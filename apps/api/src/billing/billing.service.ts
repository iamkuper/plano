import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Payment, Plan, Subscription } from "@prisma/client";
import { planAmount, type BillingDto, type BillingInterval, type PlanDto, type PlanFeature } from "@amo-kanban/shared";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { currentWorkspaceId, runInWorkspace } from "../prisma/tenant";
import { PAYMENT_PROVIDER, type PaymentNotification, type PaymentProvider } from "./payment-provider";
import { mockNotification } from "./mock.provider";
import { GRACE_AFTER_PERIOD_MS, isLocked } from "./subscription-state";
import { AuditService } from "../audit/audit.service";

const DAY = 86_400_000;
export const TRIAL_DAYS = 14;

export type Limit = "users" | "projects" | "recurring" | "storage";

const toDto = (p: Plan): PlanDto => ({ ...p, id: p.id as PlanDto["id"], features: p.features as PlanFeature[] });

function addInterval(from: Date, interval: BillingInterval) {
  const d = new Date(from);
  if (interval === "YEAR") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

// Billing works across workspaces (webhooks, scheduler), so it uses the
// system client and always filters by workspaceId explicitly.
@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly db: SystemPrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly audit: AuditService,
  ) {}

  private get ws() {
    const id = currentWorkspaceId();
    if (!id) throw new Error("Нет контекста рабочего пространства");
    return id;
  }

  // ---- what the workspace may do ----

  // The plan whose limits and features apply. A locked workspace keeps its
  // last plan (so everything stays readable); writes are refused separately.
  async effectivePlan(workspaceId: string, sub?: Subscription | null): Promise<Plan> {
    sub ??= await this.db.subscription.findUnique({ where: { workspaceId } });
    return this.db.plan.findUniqueOrThrow({ where: { id: sub?.planId ?? "FREE" } });
  }

  private async usage(workspaceId: string) {
    const [users, invitations, projects, recurring, bytes] = await Promise.all([
      this.db.user.count({ where: { workspaceId, isActive: true } }),
      this.db.invitation.count({ where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      this.db.project.count({ where: { workspaceId, status: { not: "ARCHIVED" } } }),
      this.db.recurringRule.count({ where: { project: { workspaceId }, active: true } }),
      this.db.attachment.aggregate({ where: { card: { workspaceId } }, _sum: { size: true } }),
    ]);
    return { users, invitations, projects, recurring, storageMb: Math.round(((bytes._sum.size ?? 0) / 1024 / 1024) * 10) / 10 };
  }

  // How many active users the workspace may have: unlimited during a trial,
  // the paid seats on a paid plan, the plan's cap on FREE.
  seatLimit(sub: Subscription | null, plan: Plan): number | null {
    if (sub?.status === "TRIALING" && !isLocked(sub)) return null;
    if (plan.priceKopecks > 0 && sub?.seats != null) return plan.maxUsers === null ? sub.seats : Math.min(sub.seats, plan.maxUsers);
    return plan.maxUsers;
  }

  // Active users beyond the paid seats. Seats go to administrators first,
  // then by who joined earlier, so the newest extra people are the ones
  // left out. Cached briefly: the auth check calls this on every request.
  private overSeatCache = new Map<string, { at: number; ids: Set<string> }>();
  async overSeatIds(workspaceId: string): Promise<Set<string>> {
    const hit = this.overSeatCache.get(workspaceId);
    if (hit && Date.now() - hit.at < 5000) return hit.ids;
    const sub = await this.db.subscription.findUnique({ where: { workspaceId } });
    const plan = await this.effectivePlan(workspaceId, sub);
    const max = this.seatLimit(sub, plan);
    let ids = new Set<string>();
    if (max !== null) {
      const users = await this.db.user.findMany({
        where: { workspaceId, isActive: true },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true, role: true },
      });
      // UserRole enum order is ADMIN, MEMBER, so "asc" puts admins first.
      ids = new Set(users.slice(max).map((u) => u.id));
    }
    this.overSeatCache.set(workspaceId, { at: Date.now(), ids });
    return ids;
  }

  forgetSeats(workspaceId: string) {
    this.overSeatCache.delete(workspaceId);
  }

  // Throws 402 unless one more active user fits. `invitations` reserve seats
  // too, except when the person accepting one is that reservation.
  async assertSeat(workspaceId: string, { countInvitations }: { countInvitations: boolean }) {
    const sub = await this.db.subscription.findUnique({ where: { workspaceId } });
    const plan = await this.effectivePlan(workspaceId, sub);
    const max = this.seatLimit(sub, plan);
    if (max === null) return;
    const usage = await this.usage(workspaceId);
    const taken = usage.users + (countInvitations ? usage.invitations : 0);
    if (taken < max) return;
    const invited = countInvitations && usage.invitations ? ` (из них ${usage.invitations} — в приглашениях)` : "";
    if (plan.priceKopecks > 0 && sub?.seats != null) {
      this.deny(`Оплачено мест: ${max}, все заняты${invited}. Добавьте места в разделе «Тариф и оплата» или отключите неактивных сотрудников.`);
    }
    this.deny(`На тарифе ${plan.name} — не больше ${max} пользователей${invited}. Перейдите на платный тариф в разделе «Тариф и оплата».`);
  }

  // Seats that per-seat allowances (file storage) are counted from: the paid
  // seats on a paid plan, otherwise the active users (Free, trial).
  private paidSeats(sub: Subscription | null, plan: Plan): number | null {
    return plan.priceKopecks > 0 && sub?.seats != null && sub.status !== "TRIALING" ? sub.seats : null;
  }

  private storageLimitMb(plan: Plan, sub: Subscription | null, users: number) {
    users = this.paidSeats(sub, plan) ?? users;
    return plan.storageMbBase + plan.storageMbPerSeat * Math.max(users, 1);
  }

  private deny(message: string): never {
    throw new HttpException({ statusCode: 402, message, error: "Payment Required" }, HttpStatus.PAYMENT_REQUIRED);
  }

  // Throws 402 when creating one more `limit` (or adding `bytes` of files)
  // would exceed the plan. Existing data is never touched.
  async assertWithin(limit: Limit, bytes = 0) {
    const workspaceId = this.ws;
    const sub = await this.db.subscription.findUnique({ where: { workspaceId } });
    const [plan, usage] = await Promise.all([this.effectivePlan(workspaceId, sub), this.usage(workspaceId)]);
    const hint = plan.id === "BUSINESS" ? "" : " Перейдите на более высокий тариф в разделе «Тариф и оплата».";
    switch (limit) {
      case "users":
        return this.assertSeat(workspaceId, { countInvitations: true });
      case "projects":
        if (plan.maxProjects !== null && usage.projects >= plan.maxProjects) this.deny(`На тарифе ${plan.name} — не больше ${plan.maxProjects} проектов.${hint}`);
        break;
      case "recurring":
        if (plan.maxRecurring !== null && usage.recurring >= plan.maxRecurring) this.deny(`На тарифе ${plan.name} — не больше ${plan.maxRecurring} повторяющихся задач.${hint}`);
        break;
      case "storage": {
        const limitMb = this.storageLimitMb(plan, sub, usage.users);
        const more =
          this.paidSeats(sub, plan) !== null && plan.storageMbPerSeat
            ? ` Каждое оплаченное место добавляет ${plan.storageMbPerSeat >= 1024 ? `${plan.storageMbPerSeat / 1024} ГБ` : `${plan.storageMbPerSeat} МБ`} — добавьте места в разделе «Тариф и оплата».`
            : hint;
        if (usage.storageMb + bytes / 1024 / 1024 > limitMb) this.deny(`Место для файлов закончилось (${limitMb >= 1024 ? `${limitMb / 1024} ГБ` : `${limitMb} МБ`}).${more}`);
        break;
      }
    }
  }

  async assertFeature(feature: PlanFeature) {
    const plan = await this.effectivePlan(this.ws);
    if (!plan.features.includes(feature)) {
      const needed = await this.db.plan.findFirst({ where: { features: { has: feature } }, orderBy: { position: "asc" } });
      this.deny(`Эта возможность доступна на тарифе ${needed?.name ?? "выше"}. Перейдите на него в разделе «Тариф и оплата».`);
    }
  }

  // ---- the billing page ----

  async overview(): Promise<BillingDto> {
    const workspaceId = this.ws;
    const [sub, plans, payments, usage] = await Promise.all([
      this.db.subscription.findUniqueOrThrow({ where: { workspaceId } }),
      this.db.plan.findMany({ orderBy: { position: "asc" } }),
      this.db.payment.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.usage(workspaceId),
    ]);
    const plan = await this.effectivePlan(workspaceId, sub);
    return {
      plan: toDto(plan),
      seatLimit: this.seatLimit(sub, plan),
      plans: plans.map(toDto),
      locked: isLocked(sub),
      subscription: {
        planId: sub.planId as PlanDto["id"],
        status: sub.status,
        interval: sub.interval,
        trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        cardMask: sub.cardMask,
        seats: sub.seats,
      },
      usage,
      storageLimitMb: this.storageLimitMb(plan, sub, usage.users),
      payments: payments.map((p) => ({
        id: p.id, kind: p.kind, planId: p.planId as PlanDto["id"], interval: p.interval, seats: p.seats,
        amount: p.amount, status: p.status, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
      })),
      testMode: this.provider.test,
    };
  }

  // ---- paying ----

  private newOrderId() {
    return `plano-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  }

  // Starts a payment of a paid plan: returns the bank's payment page URL.
  // The price covers the active users now; the period starts when paid.
  async checkout(planId: string, interval: BillingInterval, seatsWanted: number | undefined, email: string) {
    const workspaceId = this.ws;
    const plan = await this.db.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.priceKopecks <= 0) throw new BadRequestException("Выберите платный тариф");
    const active = await this.db.user.count({ where: { workspaceId, isActive: true } });
    const seats = seatsWanted ?? Math.max(active, 1);
    if (seats < Math.max(active, 1)) throw new BadRequestException(`Мест должно быть не меньше, чем активных пользователей: ${active}. Лишних сотрудников можно отключить`);
    if (plan.maxUsers !== null && seats > plan.maxUsers) throw new BadRequestException(`На тарифе ${plan.name} — не больше ${plan.maxUsers} пользователей`);
    const payment = await this.db.payment.create({
      data: {
        workspaceId, kind: "INITIAL", planId: plan.id, interval, seats,
        amount: planAmount(plan, seats, interval), orderId: this.newOrderId(),
      },
    });
    try {
      const init = await this.provider.init({
        orderId: payment.orderId,
        amount: payment.amount,
        description: `Plano, тариф ${plan.name}: ${seats} польз., ${interval === "YEAR" ? "год" : "месяц"}`,
        customerKey: workspaceId,
        recurrent: false,
        email,
      });
      await this.db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: init.providerPaymentId, paymentUrl: init.paymentUrl } });
      return { paymentUrl: init.paymentUrl };
    } catch (e) {
      await this.db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failReason: "Не удалось создать платёж" } });
      throw e;
    }
  }


  // ---- bank notifications ----

  async handleNotification(body: Record<string, unknown>) {
    const n = this.provider.parseNotification(body);
    if (n.status === "IGNORE") return;
    await this.applyResult(n);
  }

  // Idempotent: a payment settles once, repeated notifications do nothing.
  private async applyResult(n: PaymentNotification) {
    const payment = await this.db.payment.findUnique({ where: { orderId: n.orderId } });
    if (!payment) throw new NotFoundException("Платёж не найден");
    if (payment.status !== "PENDING") return;
    if (n.status === "FAILED") {
      await this.db.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failReason: n.reason } });
      return;
    }
    if (n.amount !== payment.amount) {
      this.log.error(`Amount mismatch for ${payment.orderId}: got ${n.amount}, expected ${payment.amount}`);
      throw new BadRequestException("Сумма платежа не совпадает");
    }
    const settled = await this.db.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date(), providerPaymentId: n.providerPaymentId || payment.providerPaymentId },
    });
    if (!settled.count) return;
    await this.activate(payment, n);
  }

  private async activate(payment: Payment, n?: Pick<PaymentNotification, "rebillId" | "cardMask">) {
    this.forgetSeats(payment.workspaceId);
    const sub = await this.db.subscription.findUniqueOrThrow({ where: { workspaceId: payment.workspaceId } });
    const now = new Date();
    // Paying the same plan, period and seats before it ends extends it from
    // the current end; any change (plan, period, seats) starts a new period now.
    const prolong =
      sub.status === "ACTIVE" && sub.planId === payment.planId && sub.interval === payment.interval && sub.seats === payment.seats &&
      !!sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    const start = prolong ? sub.currentPeriodEnd! : now;
    await this.db.subscription.update({
      where: { workspaceId: payment.workspaceId },
      data: {
        planId: payment.planId,
        status: "ACTIVE",
        interval: payment.interval,
        seats: payment.seats,
        trialEndsAt: null,
        currentPeriodStart: start,
        currentPeriodEnd: addInterval(start, payment.interval),
        cancelAtPeriodEnd: false,
        failedAttempts: 0,
        nextAttemptAt: null,
        // No recurring charges: nothing about the card is kept.
        rebillId: null,
        cardMask: null,
      },
    });
    // Webhooks and the scheduler have no request, so enter the workspace.
    await runInWorkspace(payment.workspaceId, () =>
      this.audit.record("billing.paid", `Оплачен тариф ${payment.planId}: ${(payment.amount / 100).toLocaleString("ru-RU")} ₽${payment.kind === "RENEWAL" ? " (продление)" : ""}`, payment.id),
    );
  }

  // Test provider only: plays the part of the bank's payment page.
  async devPay(orderId: string, success: boolean) {
    if (!this.provider.test) throw new NotFoundException();
    const payment = await this.db.payment.findFirst({ where: { orderId, workspaceId: this.ws } });
    if (!payment) throw new NotFoundException("Платёж не найден");
    await this.handleNotification(
      mockNotification({
        OrderId: payment.orderId,
        PaymentId: payment.providerPaymentId ?? "mock",
        Amount: payment.amount,
        Status: success ? "CONFIRMED" : "REJECTED",
        Success: success,
      }),
    );
  }

  // ---- scheduler ----

  // Trial or paid period over and not renewed: read-only until paid.
  private async lock(workspaceId: string) {
    this.forgetSeats(workspaceId);
    await this.db.subscription.update({
      where: { workspaceId },
      data: { status: "LOCKED", cancelAtPeriodEnd: false, rebillId: null, cardMask: null, failedAttempts: 0, nextAttemptAt: null },
    });
    await runInWorkspace(workspaceId, () => this.audit.record("billing.locked", "Тариф закончился, пространство переведено в режим чтения"));
  }

  // Choosing the free plan explicitly (from a trial or a locked workspace).
  // Existing data stays; only creating beyond the Free limits is refused.
  async switchToFree() {
    const workspaceId = this.ws;
    this.forgetSeats(workspaceId);
    const sub = await this.db.subscription.findUniqueOrThrow({ where: { workspaceId } });
    const paidActive = sub.planId !== "FREE" && sub.status !== "TRIALING" && sub.status !== "LOCKED" && !isLocked(sub);
    if (paidActive) throw new BadRequestException("Оплаченный тариф действует до конца периода. Отключите продление, и после него начнётся бесплатный");
    await this.db.subscription.update({
      where: { workspaceId },
      data: {
        planId: "FREE", status: "ACTIVE", seats: null, trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null,
        cancelAtPeriodEnd: false, rebillId: null, cardMask: null, failedAttempts: 0, nextAttemptAt: null,
      },
    });
    await this.audit.record("billing.free", "Выбран бесплатный тариф");
  }

  // No automatic renewals: a trial or paid period that ran out (paid ones
  // after a short grace) makes the workspace read-only until paid by card.
  async runDue(now = new Date()) {
    const trials = await this.db.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { lte: now } } });
    for (const t of trials) await this.lock(t.workspaceId);
    const ended = await this.db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, planId: { not: "FREE" }, currentPeriodEnd: { lte: new Date(now.getTime() - GRACE_AFTER_PERIOD_MS) } },
    });
    for (const e of ended) await this.lock(e.workspaceId);
    return { trials: trials.length, ended: ended.length };
  }
}
