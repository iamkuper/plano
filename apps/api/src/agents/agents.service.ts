import { randomBytes, randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { currentLocale, t, type AgentDto, type AgentProvider, type AgentRunDto, type AgentUsage } from "@plano/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OWN_FIELDS } from "../prisma/tenant";
import { BillingService } from "../billing/billing.service";
import { AuditService } from "../audit/audit.service";
import { complete, LlmError } from "./llm";
import { keyHint, open, seal } from "./secret";

export interface AgentInput {
  name: string;
  roleId?: string | null;
  provider: AgentProvider;
  model: string;
  baseUrl?: string | null;
  apiKey?: string;
  instructions?: string;
  enabled?: boolean;
}

const runSelect = {
  id: true,
  status: true,
  trigger: true,
  error: true,
  steps: true,
  inputTokens: true,
  outputTokens: true,
  createdAt: true,
  card: { select: { id: true, number: true, title: true, projectId: true } },
} as const;

const userSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  roleId: true,
  isActive: true,
  customRole: { select: { name: true } },
  agentProfile: { select: { provider: true, model: true, baseUrl: true, keyHint: true, instructions: true, enabled: true } },
} as const;

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  // Tokens spent per agent since `since`. Skipped runs never reach the model.
  private async spent(since: Date, agentId?: string): Promise<Map<string, AgentUsage>> {
    const rows = await this.prisma.agentRun.groupBy({
      by: ["agentId"],
      where: { createdAt: { gte: since }, status: { not: "SKIPPED" }, ...(agentId ? { agentId } : {}) },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    });
    return new Map(rows.map((r) => [r.agentId, { runs: r._count._all, inputTokens: r._sum.inputTokens ?? 0, outputTokens: r._sum.outputTokens ?? 0 }]));
  }

  private async usageFor(agentId?: string) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [today, month] = await Promise.all([this.spent(startOfDay, agentId), this.spent(new Date(Date.now() - 30 * 86_400_000), agentId)]);
    const none: AgentUsage = { runs: 0, inputTokens: 0, outputTokens: 0 };
    return (id: string) => ({ today: today.get(id) ?? none, month: month.get(id) ?? none });
  }

  private async toDto(u: { id: string; name: string; avatarUrl: string | null; roleId: string | null; isActive: boolean; customRole: { name: string } | null; agentProfile: any }, over: Set<string>, lastRun: unknown, usage: AgentDto["usage"]): Promise<AgentDto> {
    const p = u.agentProfile;
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      roleId: u.roleId,
      roleName: u.customRole?.name ?? t("common.noRole"),
      isActive: u.isActive,
      provider: p.provider,
      model: p.model,
      baseUrl: p.baseUrl,
      keyHint: p.keyHint,
      instructions: p.instructions,
      enabled: p.enabled,
      overSeat: u.isActive && over.has(u.id),
      lastRun: (lastRun as AgentRunDto | null) ?? null,
      usage,
    };
  }

  async list(): Promise<AgentDto[]> {
    const users = await this.prisma.user.findMany({ where: { kind: "AGENT" }, select: userSelect, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] });
    const ws = (await this.prisma.workspace.findFirstOrThrow({ select: { id: true } })).id;
    const over = await this.billing.overSeatIds(ws);
    const usage = await this.usageFor();
    const out: AgentDto[] = [];
    for (const u of users) {
      if (!u.agentProfile) continue;
      const last = await this.prisma.agentRun.findFirst({ where: { agentId: u.id }, orderBy: { createdAt: "desc" }, select: runSelect });
      out.push(await this.toDto(u, over, last, usage(u.id)));
    }
    return out;
  }

  private async one(id: string): Promise<AgentDto> {
    const u = await this.prisma.user.findFirst({ where: { id, kind: "AGENT" }, select: userSelect });
    if (!u?.agentProfile) throw new NotFoundException(t("api.agents.notFound"));
    const ws = (await this.prisma.workspace.findFirstOrThrow({ select: { id: true } })).id;
    const last = await this.prisma.agentRun.findFirst({ where: { agentId: id }, orderBy: { createdAt: "desc" }, select: runSelect });
    return this.toDto(u, await this.billing.overSeatIds(ws), last, (await this.usageFor(id))(id));
  }

  private validate(input: Pick<AgentInput, "provider" | "baseUrl">) {
    if (input.provider === "OPENAI_COMPATIBLE" && !input.baseUrl?.trim()) throw new BadRequestException(t("api.agents.baseUrlRequired"));
  }

  private async roleFor(roleId: string | null | undefined) {
    if (roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: roleId } });
      if (!role) throw new NotFoundException(t("api.agents.roleNotFound"));
      return role.id;
    }
    return (await this.prisma.role.findFirst({ where: { isDefault: true } }))?.id ?? null;
  }

  // An agent is a user of the workspace of kind AGENT: it takes a seat,
  // can be an assignee and write messages, but has no password and cannot sign in.
  async create(input: AgentInput): Promise<AgentDto> {
    this.validate(input);
    if (!input.apiKey?.trim()) throw new BadRequestException(t("api.agents.keyRequired"));
    const ws = (await this.prisma.workspace.findFirstOrThrow({ select: { id: true } })).id;
    await this.billing.assertSeat(ws, { countInvitations: true });
    const apiKey = input.apiKey.trim();
    const user = await this.prisma.user.create({
      data: {
        ...OWN_FIELDS,
        email: `agent-${randomUUID()}@agents.invalid`,
        name: input.name.trim(),
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
        role: "MEMBER",
        roleId: await this.roleFor(input.roleId),
        kind: "AGENT",
        emailNotifications: false,
        locale: currentLocale(),
        agentProfile: {
          create: {
            provider: input.provider,
            model: input.model.trim(),
            baseUrl: input.provider === "OPENAI_COMPATIBLE" ? input.baseUrl!.trim() : null,
            apiKeyEnc: seal(apiKey),
            keyHint: keyHint(apiKey),
            instructions: input.instructions?.trim() ?? "",
            enabled: input.enabled ?? true,
          },
        },
      },
      select: { id: true },
    });
    this.billing.forgetSeats(ws);
    await this.audit.record("agent.create", t("api.agents.created", { name: input.name.trim() }), user.id);
    return this.one(user.id);
  }

  async update(id: string, input: Partial<AgentInput> & { isActive?: boolean }): Promise<AgentDto> {
    const current = await this.one(id);
    const provider = input.provider ?? current.provider;
    this.validate({ provider, baseUrl: input.baseUrl !== undefined ? input.baseUrl : current.baseUrl });
    const ws = (await this.prisma.workspace.findFirstOrThrow({ select: { id: true } })).id;
    if (input.isActive === true && !current.isActive) await this.billing.assertSeat(ws, { countInvitations: true });
    const key = input.apiKey?.trim();
    await this.prisma.user.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        roleId: input.roleId !== undefined ? await this.roleFor(input.roleId) : undefined,
        isActive: input.isActive,
        agentProfile: {
          update: {
            provider: input.provider,
            model: input.model?.trim() || undefined,
            baseUrl: provider === "OPENAI_COMPATIBLE" ? (input.baseUrl !== undefined ? input.baseUrl?.trim() || null : undefined) : null,
            ...(key ? { apiKeyEnc: seal(key), keyHint: keyHint(key) } : {}),
            instructions: input.instructions?.trim(),
            enabled: input.enabled,
          },
        },
      },
    });
    this.billing.forgetSeats(ws);
    await this.audit.record("agent.update", t("api.agents.changed", { name: input.name?.trim() || current.name }), id);
    return this.one(id);
  }

  // The history stays, the seat is freed and the key is wiped.
  async remove(id: string) {
    const current = await this.one(id);
    const ws = (await this.prisma.workspace.findFirstOrThrow({ select: { id: true } })).id;
    await this.prisma.user.update({ where: { id }, data: { isActive: false, agentProfile: { update: { enabled: false, apiKeyEnc: "", keyHint: "" } } } });
    this.billing.forgetSeats(ws);
    await this.audit.record("agent.delete", t("api.agents.removed", { name: current.name }), id);
  }

  async runs(id: string): Promise<AgentRunDto[]> {
    await this.one(id);
    const rows = await this.prisma.agentRun.findMany({ where: { agentId: id }, orderBy: { createdAt: "desc" }, take: 30, select: runSelect });
    return rows as unknown as AgentRunDto[];
  }

  // Checks provider, model and key with a one-word question. Works on a saved
  // agent (its stored key) or on values typed into the form.
  async test(input: { agentId?: string; provider: AgentProvider; model: string; baseUrl?: string | null; apiKey?: string }) {
    this.validate(input);
    let apiKey = input.apiKey?.trim();
    if (!apiKey && input.agentId) {
      const p = await this.prisma.agentProfile.findUnique({ where: { userId: input.agentId } });
      if (p?.apiKeyEnc) apiKey = open(p.apiKeyEnc);
    }
    if (!apiKey) throw new BadRequestException(t("api.agents.keyRequired"));
    try {
      const res = await complete({
        provider: input.provider,
        model: input.model.trim(),
        apiKey,
        baseUrl: input.baseUrl?.trim() || null,
        system: "You are a connection check. Answer with one word.",
        messages: [{ role: "user", text: "Say OK." }],
        tools: [],
        maxTokens: 20,
      });
      return { ok: true, reply: res.text.slice(0, 80) };
    } catch (e) {
      if (e instanceof LlmError) throw new ConflictException(t("api.agents.testFailed", { reason: e.message }));
      throw e;
    }
  }
}
