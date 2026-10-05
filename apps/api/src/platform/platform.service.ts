import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { YEAR_MONTHS_CHARGED, t } from "@plano/shared";
import { isLocked } from "../billing/subscription-state";
import { caseVariants } from "../prisma/case-variants";
import { SystemPrismaService } from "../prisma/system-prisma.service";

const DAY = 86_400_000;
const PAGE = 30;

export type SubscriptionAction =
  | { action: "grant"; planId: string; days?: number }
  | { action: "extend-trial"; days?: number }
  | { action: "lock" }
  | { action: "free" };

type Label = "trial" | "paid" | "free" | "locked" | "past_due";

// Coarse state shown in the back-office list.
export function stateOf(sub: { planId: string; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "LOCKED"; trialEndsAt: Date | null; currentPeriodEnd: Date | null }, now = new Date()): Label {
  if (isLocked(sub, now)) return "locked";
  if (sub.status === "PAST_DUE") return "past_due";
  if (sub.status === "TRIALING") return "trial";
  return sub.planId === "FREE" ? "free" : "paid";
}

// Cross-workspace view for the platform owner. Works on the system client and
// never goes through the tenant scope on purpose.
@Injectable()
export class PlatformService {
  constructor(private readonly db: SystemPrismaService) {}

  async stats(now = new Date()) {
    const [workspaces, users, new7, new30, subs, paid30, failed7] = await Promise.all([
      this.db.workspace.count(),
      this.db.user.count({ where: { isActive: true } }),
      this.db.workspace.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      this.db.workspace.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
      this.db.subscription.findMany({ include: { plan: true } }),
      this.db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _sum: { amount: true }, _count: true }),
      this.db.payment.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    ]);
    const seatRows = await this.db.user.groupBy({ by: ["workspaceId"], where: { isActive: true }, _count: true });
    const seatsOf = new Map(seatRows.map((r) => [r.workspaceId, r._count]));
    const states: Record<Label, number> = { trial: 0, paid: 0, free: 0, locked: 0, past_due: 0 };
    let mrr = 0;
    for (const s of subs) {
      const label = stateOf(s, now);
      states[label]++;
      if (label === "paid" || label === "past_due") {
        const seats = Math.max(seatsOf.get(s.workspaceId) ?? 0, 1);
        mrr += s.interval === "YEAR" ? Math.round((s.plan.priceKopecks * seats * YEAR_MONTHS_CHARGED) / 12) : s.plan.priceKopecks * seats;
      }
    }
    return {
      workspaces,
      users,
      newWorkspaces7d: new7,
      newWorkspaces30d: new30,
      states,
      // Monthly recurring revenue in kopecks (yearly plans spread over 12 months).
      mrrKopecks: mrr,
      paid30dKopecks: paid30._sum.amount ?? 0,
      paidCount30d: paid30._count,
      failedPayments7d: failed7,
    };
  }

  async workspaces(q?: string, state?: Label, cursor?: string) {
    const where: Prisma.WorkspaceWhereInput = {
      ...(q?.trim()
        ? {
            OR: [
              ...caseVariants(q).map((v) => ({ name: { contains: v, mode: "insensitive" as const } })),
              { users: { some: { email: { contains: q.trim(), mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };
    // The state is derived from dates, so it is filtered after the query.
    const rows = await this.db.workspace.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: state ? 500 : PAGE + 1,
      ...(cursor && !state ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        subscription: true,
        _count: { select: { projects: true, cards: true } },
        users: { where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, take: 1, select: { email: true, name: true } },
        payments: { where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true, amount: true } },
      },
    });
    const userCounts = await this.db.user.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: rows.map((r) => r.id) }, isActive: true }, _count: true });
    const counts = new Map(userCounts.map((u) => [u.workspaceId, u._count]));
    let items = rows.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt,
      owner: w.users[0] ?? null,
      users: counts.get(w.id) ?? 0,
      projects: w._count.projects,
      cards: w._count.cards,
      planId: w.subscription?.planId ?? "FREE",
      state: w.subscription ? stateOf(w.subscription) : ("free" as Label),
      trialEndsAt: w.subscription?.trialEndsAt ?? null,
      currentPeriodEnd: w.subscription?.currentPeriodEnd ?? null,
      lastPayment: w.payments[0] ?? null,
    }));
    if (state) return { items: items.filter((i) => i.state === state).slice(0, PAGE * 3), next: null };
    const next = items.length > PAGE ? items[PAGE - 1].id : null;
    items = items.slice(0, PAGE);
    return { items, next };
  }

  async workspace(id: string) {
    const w = await this.db.workspace.findUnique({
      where: { id },
      include: {
        subscription: true,
        users: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 30 },
        auditLog: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, summary: true, createdAt: true } },
        _count: { select: { projects: true, cards: true } },
      },
    });
    if (!w) throw new NotFoundException(t("api.platform.workspaceNotFound"));
    const files = await this.db.attachment.aggregate({ where: { card: { workspaceId: id } }, _sum: { size: true } });
    return { ...w, state: w.subscription ? stateOf(w.subscription) : "free", storageBytes: files._sum.size ?? 0 };
  }

  // Support actions on a subscription. Each is written to the workspace's
  // journal as an action of the platform.
  async changeSubscription(id: string, cmd: SubscriptionAction, now = new Date()) {
    const sub = await this.db.subscription.findUnique({ where: { workspaceId: id } });
    if (!sub) throw new NotFoundException(t("api.platform.subscriptionNotFound"));
    const days = (n?: number) => {
      if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 3650)) throw new BadRequestException(t("api.platform.durationMustBeFrom1"));
      return n ?? 30;
    };
    let data: Prisma.SubscriptionUpdateInput;
    let summary: string;
    switch (cmd.action) {
      case "grant": {
        const plan = await this.db.plan.findUnique({ where: { id: cmd.planId } });
        if (!plan || plan.priceKopecks <= 0) throw new BadRequestException(t("common.chooseAPaidPlan"));
        const n = days(cmd.days);
        // No card is saved, so the period simply runs out and locks.
        data = {
          plan: { connect: { id: plan.id } }, status: "ACTIVE", trialEndsAt: null, currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + n * DAY), cancelAtPeriodEnd: true, failedAttempts: 0, nextAttemptAt: null,
        };
        summary = t("api.platform.planGrantedForDays", { name: plan.name, n });
        break;
      }
      case "extend-trial": {
        const n = days(cmd.days);
        const base = sub.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt : now;
        data = { plan: { connect: { id: sub.planId === "FREE" ? "PRO" : sub.planId } }, status: "TRIALING", trialEndsAt: new Date(base.getTime() + n * DAY), currentPeriodEnd: null };
        summary = t("api.platform.trialExtendedByDays", { n });
        break;
      }
      case "lock":
        data = { status: "LOCKED", cancelAtPeriodEnd: false, rebillId: null, nextAttemptAt: null };
        summary = t("api.platform.theWorkspaceWasSwitchedTo");
        break;
      case "free":
        data = { plan: { connect: { id: "FREE" } }, status: "ACTIVE", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, rebillId: null, cardMask: null, failedAttempts: 0, nextAttemptAt: null };
        summary = t("api.platform.switchedToTheFreePlan");
        break;
      default:
        throw new BadRequestException(t("api.platform.unknownAction"));
    }
    await this.db.subscription.update({ where: { workspaceId: id }, data });
    await this.db.auditLog.create({ data: { workspaceId: id, userId: null, action: `platform.${cmd.action}`, summary: t("api.platform.planoSupport", { summary }) } });
    return this.workspace(id);
  }
}
