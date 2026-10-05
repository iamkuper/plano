import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { intlTag, t } from "@plano/shared";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInWorkspace } from "../prisma/tenant";
import { CardsService } from "../cards/cards.service";
import { BillingService } from "../billing/billing.service";
import { isLocked } from "../billing/subscription-state";
import { withLocale } from "../i18n/request-locale";
import { AgentEvent, AgentEvents } from "./agent-events";
import { complete, LlmError, type ChatMsg } from "./llm";
import { open } from "./secret";
import { AGENT_TOOLS, SYSTEM_PROMPT } from "./tools";

// Limits that also stop agents from talking each other into a loop.
export const MAX_STEPS = 8;
export const RUNS_PER_CARD_HOUR = 6;
export const RUNS_PER_WORKSPACE_DAY = Number(process.env.AGENT_RUNS_PER_DAY ?? 300);
const MAX_OUTPUT_TOKENS = 1500;
const HOUR = 3_600_000;

const clip = (s: string | null | undefined, n: number) => ((s ?? "").length > n ? `${(s ?? "").slice(0, n - 1)}…` : (s ?? ""));
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

class Skip extends Error {}

@Injectable()
export class AgentRunner implements OnModuleInit {
  private readonly log = new Logger("Agents");
  // One run per agent and card at a time; events arriving meanwhile collapse into one more run.
  private active = new Map<string, AgentEvent | null>();

  constructor(
    private readonly events: AgentEvents,
    private readonly db: SystemPrismaService,
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
    private readonly billing: BillingService,
  ) {}

  onModuleInit() {
    this.events.subscribe((e) => void this.enqueue(e));
  }

  // Resolves when the queue for this event is empty (tests await it).
  async enqueue(event: AgentEvent): Promise<void> {
    const key = `${event.agentId}:${event.cardId}`;
    if (this.active.has(key)) {
      this.active.set(key, event);
      return;
    }
    this.active.set(key, null);
    try {
      let next: AgentEvent | null = event;
      while (next) {
        await this.run(next).catch((e) => this.log.error(`run failed: ${e instanceof Error ? e.message : e}`));
        next = this.active.get(key) ?? null;
        this.active.set(key, null);
      }
    } finally {
      this.active.delete(key);
    }
  }

  private async run(event: AgentEvent) {
    const profile = await this.db.agentProfile.findUnique({ where: { userId: event.agentId }, include: { user: { include: { customRole: true } } } });
    if (!profile || profile.user.kind !== "AGENT" || profile.user.workspaceId !== event.workspaceId) return;
    const run = await this.db.agentRun.create({ data: { workspaceId: event.workspaceId, agentId: event.agentId, cardId: event.cardId, trigger: event.type } });
    const finish = (data: { status: "DONE" | "FAILED" | "SKIPPED"; error?: string; steps?: number; inputTokens?: number; outputTokens?: number }) =>
      this.db.agentRun.update({ where: { id: run.id }, data: { ...data, finishedAt: new Date() } });

    let steps = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      await withLocale(event.locale, async () => {
        await this.guard(event, profile);
        const apiKey = open(profile.apiKeyEnc);
        await runInWorkspace(
          event.workspaceId,
          async () => {
            const system = SYSTEM_PROMPT(profile.user.name, profile.instructions, event.locale === "en" ? "English" : "Russian");
            const messages: ChatMsg[] = [{ role: "user", text: await this.context(event) }];
            let posted = false;
            for (; steps < MAX_STEPS; ) {
              steps++;
              const res = await complete({ provider: profile.provider, model: profile.model, apiKey, baseUrl: profile.baseUrl, system, messages, tools: AGENT_TOOLS, maxTokens: MAX_OUTPUT_TOKENS });
              inputTokens += res.inputTokens;
              outputTokens += res.outputTokens;
              if (!res.toolCalls.length) {
                if (res.text && !posted) await this.cards.addComment(event.cardId, event.agentId, res.text, []);
                return;
              }
              messages.push({ role: "assistant", text: res.text, toolCalls: res.toolCalls });
              const results = [];
              for (const call of res.toolCalls) {
                if (call.name === "add_comment") posted = true;
                results.push({ id: call.id, name: call.name, content: await this.tool(event, call.name, call.args) });
              }
              messages.push({ role: "tool", results });
            }
            throw new LlmError(t("api.agents.tooManySteps"));
          },
          event.agentId,
        );
      });
      await finish({ status: "DONE", steps, inputTokens, outputTokens });
    } catch (e) {
      if (e instanceof Skip) {
        await finish({ status: "SKIPPED", error: e.message, steps, inputTokens, outputTokens });
        return;
      }
      const reason = e instanceof Error ? e.message : String(e);
      await finish({ status: "FAILED", error: reason, steps, inputTokens, outputTokens });
      // Say so on the card: otherwise a broken key looks like a silent agent.
      await withLocale(event.locale, () =>
        runInWorkspace(event.workspaceId, async () => await this.cards.addComment(event.cardId, event.agentId, t("api.agents.couldNotAnswer", { reason }), []), event.agentId),
      ).catch(() => {});
    }
  }

  // Reasons not to react at all.
  private async guard(event: AgentEvent, profile: { enabled: boolean; user: { isActive: boolean } }) {
    if (!profile.enabled || !profile.user.isActive) throw new Skip(t("api.agents.turnedOff"));
    const sub = await this.db.subscription.findUnique({ where: { workspaceId: event.workspaceId } });
    if (isLocked(sub)) throw new Skip(t("api.agents.workspaceReadOnly"));
    if ((await this.billing.overSeatIds(event.workspaceId)).has(event.agentId)) throw new Skip(t("api.agents.noSeat"));
    // Downgraded below Business: agents stay in the team but stop working.
    if (!(await this.billing.effectivePlan(event.workspaceId, sub)).features.includes("agents")) throw new Skip(t("api.agents.planWithoutAgents"));
    const hourAgo = new Date(Date.now() - HOUR);
    const perCard = await this.db.agentRun.count({ where: { agentId: event.agentId, cardId: event.cardId, createdAt: { gte: hourAgo }, status: { not: "SKIPPED" } } });
    // The run being started is already counted once.
    if (perCard > RUNS_PER_CARD_HOUR) throw new Skip(t("api.agents.limitPerCard"));
    const today = await this.db.agentRun.count({ where: { workspaceId: event.workspaceId, createdAt: { gte: new Date(Date.now() - 24 * HOUR) }, status: { not: "SKIPPED" } } });
    if (today > RUNS_PER_WORKSPACE_DAY) throw new Skip(t("api.agents.limitPerDay"));
  }

  // What the model sees: the card, the board, the team and the latest messages.
  private async context(event: AgentEvent): Promise<string> {
    const card = await this.cards.get(event.cardId);
    const [columns, team, workspace, actor] = await Promise.all([
      this.prisma.column.findMany({ where: { board: { projectId: card.projectId } }, orderBy: { position: "asc" }, select: { title: true } }),
      this.prisma.user.findMany({ where: { isActive: true }, select: { name: true, kind: true } }),
      this.prisma.workspace.findFirstOrThrow({ select: { cardPrefix: true } }),
      event.actorId ? this.prisma.user.findUnique({ where: { id: event.actorId }, select: { name: true } }) : null,
    ]);
    const key = `${workspace.cardPrefix}-${card.number}`;
    const trigger =
      event.type === "ASSIGNED" ? "You were assigned to this card." : event.type === "MENTIONED" ? "You were mentioned in a message." : "A new message was written on a card you are assigned to.";
    const lines = [
      `Event: ${trigger}${actor ? ` By: ${actor.name}.` : ""}${event.text ? `\nMessage: ${clip(event.text, 1500)}` : ""}`,
      "",
      `Card ${key}: ${card.title}`,
      `Project: ${card.project.title}; column: ${card.column.title}; priority: ${card.priority}`,
      `Start: ${day(card.startDate)}; due: ${day(card.dueDate)}; estimate: ${card.estimateHours ?? "—"} h`,
      `Assignees: ${card.assignees.map((a) => a.user.name).join(", ") || "—"}; labels: ${card.labels.map((l) => l.label.name).join(", ") || "—"}`,
      `Columns of the board: ${columns.map((c) => c.title).join(" | ")}`,
      `Team (active): ${team.map((u) => (u.kind === "AGENT" ? `${u.name} (agent)` : u.name)).join(", ")}`,
      `Today: ${day(new Date())}`,
      "",
      "Description:",
      clip(card.description, 4000) || "—",
      "",
      "Subtasks:",
      ...(card.checklist.length ? card.checklist.map((i) => `[${i.id}] ${i.done ? "x" : " "} ${i.text}`) : ["—"]),
      "",
      "Discussion (oldest first, latest 20):",
      ...(card.comments.length ? card.comments.slice(-20).map((c) => `${new Date(c.createdAt).toLocaleString(intlTag())} ${c.author.name}: ${clip(c.text, 1500)}`) : ["—"]),
    ];
    return lines.join("\n");
  }

  // Runs one tool call as the agent; failures go back to the model as text.
  private async tool(event: AgentEvent, name: string, args: Record<string, unknown>): Promise<string> {
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    try {
      switch (name) {
        case "add_comment": {
          const text = str(args.text);
          if (!text) return "error: text is empty";
          const names = (Array.isArray(args.mention) ? args.mention : []).map((n) => str(n).toLowerCase()).filter(Boolean);
          const users = names.length ? await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }) : [];
          const ids = users.filter((u) => names.includes(u.name.toLowerCase()) && u.id !== event.agentId).map((u) => u.id);
          await this.cards.addComment(event.cardId, event.agentId, text, ids);
          return "ok: message posted";
        }
        case "move_card": {
          const card = await this.cards.get(event.cardId);
          const columns = await this.prisma.column.findMany({ where: { board: { projectId: card.projectId } }, select: { id: true, title: true } });
          const target = columns.find((c) => c.title.toLowerCase() === str(args.column).toLowerCase());
          if (!target) return `error: no such column. Columns: ${columns.map((c) => c.title).join(", ")}`;
          await this.cards.move(event.cardId, { columnId: target.id }, event.agentId);
          return `ok: moved to ${target.title}`;
        }
        case "update_card": {
          const dto: Record<string, unknown> = {};
          if (str(args.title)) dto.title = str(args.title);
          if (typeof args.description === "string") dto.description = args.description;
          if (["LOW", "MEDIUM", "HIGH"].includes(str(args.priority))) dto.priority = str(args.priority);
          for (const [from, to] of [["start_date", "startDate"], ["due_date", "dueDate"]] as const) {
            const v = str(args[from]);
            if (v) {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return `error: ${from} must be YYYY-MM-DD`;
              dto[to] = new Date(`${v}T00:00:00.000Z`);
            }
          }
          if (typeof args.estimate_hours === "number" && args.estimate_hours >= 0) dto.estimateHours = Math.round(args.estimate_hours);
          if (!Object.keys(dto).length) return "error: nothing to change";
          await this.cards.update(event.cardId, dto, event.agentId);
          return "ok: card updated";
        }
        case "add_subtask": {
          const text = str(args.text);
          if (!text) return "error: text is empty";
          const item = await this.cards.addChecklistItem(event.cardId, text);
          return `ok: subtask ${item.id} added`;
        }
        case "set_subtask_done": {
          const item = await this.prisma.checklistItem.findFirst({ where: { id: str(args.id), cardId: event.cardId } });
          if (!item) return "error: no such subtask on this card";
          await this.cards.updateChecklistItem(item.id, { done: args.done === true });
          return "ok";
        }
        case "search_cards": {
          const found = await this.cards.search(str(args.query));
          return JSON.stringify((await found).slice(0, 10).map((c: { id: string; number: number; title: string; column?: { title: string } }) => ({ number: c.number, title: c.title })));
        }
        default:
          return `error: unknown tool ${name}`;
      }
    } catch (e) {
      return `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
