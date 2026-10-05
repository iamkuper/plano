import { createHmac, randomBytes } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { WebhookEvent } from "@plano/shared";
import { appUrl } from "../auth/tokens";
import { assertPublicUrl } from "../agents/llm";
import { open } from "../agents/secret";
import { PrismaService } from "../prisma/prisma.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { currentUserId, currentWorkspaceId } from "../prisma/tenant";

const KEEP_DELIVERIES = 50;
const RETRY_DELAYS_MS = [5_000, 30_000];
const TIMEOUT_MS = 8_000;

interface Target {
  id: string;
  url: string;
  secret: string;
}

export const newSecret = () => `whsec_${randomBytes(24).toString("hex")}`;

// Sends the workspace's events to the addresses it registered. Delivery never
// blocks or fails the action that caused it: it runs after the request, is
// signed with the webhook's secret, and is tried up to three times.
@Injectable()
export class WebhooksService {
  private readonly log = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  // What receivers get for a card: enough to act on without calling back.
  async cardSnapshot(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        project: { select: { id: true, title: true } },
        column: { select: { id: true, title: true } },
        assignees: { select: { user: { select: { id: true, name: true } } } },
        labels: { select: { label: { select: { id: true, name: true, color: true } } } },
        workspace: { select: { cardPrefix: true } },
      },
    });
    if (!card) return null;
    return {
      id: card.id,
      key: `${card.workspace.cardPrefix}-${card.number}`,
      number: card.number,
      title: card.title,
      description: card.description,
      priority: card.priority,
      startDate: card.startDate?.toISOString() ?? null,
      dueDate: card.dueDate?.toISOString() ?? null,
      estimateHours: card.estimateHours,
      project: card.project,
      column: card.column,
      assignees: card.assignees.map((a) => a.user),
      labels: card.labels.map((l) => l.label),
      url: `${appUrl()}/projects/${card.project.id}?card=${card.id}`,
    };
  }

  // Call inside a request: the workspace and the actor come from its context.
  // `snapshot` is passed for a deleted card, which can no longer be read.
  async emit(event: WebhookEvent, cardId: string, extra: Record<string, unknown> = {}, snapshot?: Awaited<ReturnType<WebhooksService["cardSnapshot"]>>) {
    try {
      const workspaceId = currentWorkspaceId();
      if (!workspaceId) return;
      const hooks = (await this.prisma.webhook.findMany({ where: { isActive: true }, select: { id: true, url: true, secret: true, events: true } })).filter(
        (h) => h.events.length === 0 || h.events.includes(event),
      );
      if (!hooks.length) return;
      const card = snapshot ?? (await this.cardSnapshot(cardId));
      const actorId = currentUserId();
      const actor = actorId ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { id: true, name: true } }) : null;
      const payload = { event, createdAt: new Date().toISOString(), actor, card, ...extra };
      for (const h of hooks) this.dispatch({ id: h.id, url: h.url, secret: h.secret }, event, payload);
    } catch (e) {
      this.log.warn(`emit ${event}: ${(e as Error).message}`);
    }
  }

  // A test message from the settings page: awaited, so the answer can be shown.
  async ping(target: Target) {
    return this.deliver(target, "ping", { event: "ping", createdAt: new Date().toISOString(), message: "Webhook is set up." }, 1);
  }

  private dispatch(target: Target, event: string, payload: unknown) {
    void (async () => {
      for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
        const ok = await this.deliver(target, event, payload, attempt);
        if (ok || attempt > RETRY_DELAYS_MS.length) return;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]).unref?.());
      }
    })();
  }

  // One attempt. Returns whether the receiver answered 2xx.
  async deliver(target: Target, event: string, payload: unknown, attempt: number): Promise<boolean> {
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      const url = assertPublicUrl(target.url);
      const signature = createHmac("sha256", open(target.secret)).update(`${timestamp}.${body}`).digest("hex");
      const res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Plano-Webhooks/1",
          "X-Plano-Event": event,
          "X-Plano-Timestamp": timestamp,
          "X-Plano-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      statusCode = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error && e.name === "TimeoutError" ? "timeout" : e instanceof Error ? e.message.slice(0, 200) : "error";
    }
    const ok = error === null;
    await this.record(target.id, event, ok, statusCode, error, attempt);
    return ok;
  }

  private async record(webhookId: string, event: string, ok: boolean, statusCode: number | null, error: string | null, attempts: number) {
    try {
      await this.system.webhookDelivery.create({ data: { webhookId, event, ok, statusCode, error, attempts } });
      const old = await this.system.webhookDelivery.findMany({ where: { webhookId }, orderBy: { createdAt: "desc" }, skip: KEEP_DELIVERIES, select: { id: true } });
      if (old.length) await this.system.webhookDelivery.deleteMany({ where: { id: { in: old.map((d) => d.id) } } });
    } catch (e) {
      this.log.warn(`record delivery: ${(e as Error).message}`);
    }
  }
}
