import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Payment, Plan, Subscription } from "@prisma/client";
import { planAmount, type BillingDto, type BillingInterval, type PlanDto, type PlanFeature } from "@amo-kanban/shared";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { currentWorkspaceId, runInWorkspace } from "../prisma/tenant";
import { PAYMENT_PROVIDER, type PaymentNotification, type PaymentProvider } from "./payment-provider";
import { mockNotification } from "./mock.provider";
import { AuditService } from "../audit/audit.service";

const DAY = 86_400_000;
export const TRIAL_DAYS = 14;
export const MAX_RENEWAL_ATTEMPTS = 3;
const RETRY_AFTER_MS = DAY;

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

  // The plan that applies now: an expired trial counts as FREE.
  async effectivePlan(workspaceId: string, sub?: Subscription | null): Promise<Plan> {
    sub ??= await this.db.subscription.findUnique({ where: { workspaceId } });
    const trialOver = sub?.status === "TRIALING" && (!sub.trialEndsAt || sub.trialEndsAt <= new Date());
    const planId = !sub || trialOver ? "FREE" : sub.planId;
    return this.db.plan.findUniqueOrThrow({ where: { id: planId } });
  }

  private async usage(workspaceId: string) {
    const [users, projects, recurring, bytes] = await Promise.all([
      this.db.user.count({ where: { workspaceId, isActive: true } }),
      this.db.project.count({ where: { workspaceId, status: { not: "ARCHIVED" } } }),
      this.db.recurringRule.count({ where: { project: { workspaceId }, active: true } }),
      this.db.attachment.aggregate({ where: { card: { workspaceId } }, _sum: { size: true } }),
    ]);
    return { users, projects, recurring, storageMb: Math.round(((bytes._sum.size ?? 0) / 1024 / 1024) * 10) / 10 };
  }

  private storageLimitMb(plan: Plan, users: number) {
    return plan.storageMbBase + plan.storageMbPerSeat * Math.max(users, 1);
  }

  private deny(message: string): never {
    throw new HttpException({ statusCode: 402, message, error: "Payment Required" }, HttpStatus.PAYMENT_REQUIRED);
  }

  // Throws 402 when creating one more `limit` (or adding `bytes` of files)
  // would exceed the plan. Existing data is never touched.
  async assertWithin(limit: Limit, bytes = 0) {
    const workspaceId = this.ws;
    const [plan, usage] = await Promise.all([this.effectivePlan(workspaceId), this.usage(workspaceId)]);
    const hint = plan.id === "BUSINESS" ? "" : " Перейдите на более высокий тариф в разделе «Тариф и оплата».";
    switch (limit) {
      case "users":
        if (plan.maxUsers !== null && usage.users >= plan.maxUsers) this.deny(`На тарифе ${plan.name} — не больше ${plan.maxUsers} пользователей.${hint}`);
        break;
      case "projects":
        if (plan.maxProjects !== null && usage.projects >= plan.maxProjects) this.deny(`На тарифе ${plan.name} — не больше ${plan.maxProjects} проектов.${hint}`);
        break;
      case "recurring":
        if (plan.maxRecurring !== null && usage.recurring >= plan.maxRecurring) this.deny(`На тарифе ${plan.name} — не больше ${plan.maxRecurring} повторяющихся задач.${hint}`);
        break;
      case "storage": {
        const limitMb = this.storageLimitMb(plan, usage.users);
        if (usage.storageMb + bytes / 1024 / 1024 > limitMb) this.deny(`Место для файлов закончилось (${limitMb >= 1024 ? `${limitMb / 1024} ГБ` : `${limitMb} МБ`}).${hint}`);
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
      plans: plans.map(toDto),
      subscription: {
        planId: sub.planId as PlanDto["id"],
        status: sub.status,
        interval: sub.interval,
        trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        cardMask: sub.cardMask,
      },
      usage,
      storageLimitMb: this.storageLimitMb(plan, usage.users),
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
  async checkout(planId: string, interval: BillingInterval, email: string) {
    const workspaceId = this.ws;
    const plan = await this.db.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.priceKopecks <= 0) throw new BadRequestException("Выберите платный тариф");
    const seats = await this.db.user.count({ where: { workspaceId, isActive: true } });
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
        recurrent: true,
        email,
      });
      await this.db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: init.providerPaymentId, paymentUrl: init.paymentUrl } });
      return { paymentUrl: init.paymentUrl };
    } catch (e) {
      await this.db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failReason: "Не удалось создать платёж" } });
      throw e;
    }
  }

  async setCancel(cancel: boolean) {
    const workspaceId = this.ws;
    const sub = await this.db.subscription.findUniqueOrThrow({ where: { workspaceId } });
    if (sub.planId === "FREE") throw new BadRequestException("Платной подписки нет");
    if (sub.status === "TRIALING") throw new BadRequestException("Пробный период закончится сам, списаний не будет");
    await this.db.subscription.update({ where: { workspaceId }, data: { cancelAtPeriodEnd: cancel } });
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
    const sub = await this.db.subscription.findUniqueOrThrow({ where: { workspaceId: payment.workspaceId } });
    const now = new Date();
    // A renewal continues the paid period; a first payment starts it now.
    const start = payment.kind === "RENEWAL" && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    await this.db.subscription.update({
      where: { workspaceId: payment.workspaceId },
      data: {
        planId: payment.planId,
        status: "ACTIVE",
        interval: payment.interval,
        trialEndsAt: null,
        currentPeriodStart: start,
        currentPeriodEnd: addInterval(start, payment.interval),
        cancelAtPeriodEnd: false,
        failedAttempts: 0,
        nextAttemptAt: null,
        ...(n?.rebillId ? { rebillId: n.rebillId } : {}),
        ...(n?.cardMask ? { cardMask: n.cardMask } : {}),
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

  private async downgrade(workspaceId: string) {
    await this.db.subscription.update({
      where: { workspaceId },
      data: {
        planId: "FREE", status: "ACTIVE", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null,
        cancelAtPeriodEnd: false, rebillId: null, cardMask: null, failedAttempts: 0, nextAttemptAt: null,
      },
    });
  }

  // Renews paid periods that ended, downgrades cancelled and unpaid ones.
  async runDue(now = new Date()) {
    // Trials that ran out without a payment.
    const trials = await this.db.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { lte: now } } });
    for (const t of trials) await this.downgrade(t.workspaceId);

    const due = await this.db.subscription.findMany({
      where: {
        status: { in: ["ACTIVE", "PAST_DUE"] },
        planId: { not: "FREE" },
        currentPeriodEnd: { lte: now },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      include: { plan: true },
    });
    for (const sub of due) {
      try {
        await this.renew(sub, now);
      } catch (e) {
        this.log.error(`Renewal of ${sub.workspaceId} failed: ${(e as Error).message}`);
      }
    }
    return { trials: trials.length, renewals: due.length };
  }

  private async renew(sub: Subscription & { plan: Plan }, now: Date) {
    if (sub.cancelAtPeriodEnd || !sub.rebillId) return this.downgrade(sub.workspaceId);

    const seats = await this.db.user.count({ where: { workspaceId: sub.workspaceId, isActive: true } });
    const payment = await this.db.payment.create({
      data: {
        workspaceId: sub.workspaceId, kind: "RENEWAL", planId: sub.planId, interval: sub.interval, seats,
        amount: planAmount(sub.plan, seats, sub.interval), orderId: this.newOrderId(),
      },
    });
    let failure: string | undefined;
    try {
      const init = await this.provider.init({
        orderId: payment.orderId, amount: payment.amount, customerKey: sub.workspaceId, recurrent: false,
        description: `Plano, продление тарифа ${sub.plan.name}: ${seats} польз.`,
      });
      await this.db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: init.providerPaymentId } });
      const result = await this.provider.charge(init.providerPaymentId, sub.rebillId);
      if (result.confirmed) {
        const settled = await this.db.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID", paidAt: now } });
        if (settled.count) await this.activate(payment);
        return;
      }
      failure = result.reason;
    } catch (e) {
      failure = (e as Error).message;
    }

    await this.db.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failReason: failure } });
    const attempts = sub.failedAttempts + 1;
    if (attempts >= MAX_RENEWAL_ATTEMPTS) return this.downgrade(sub.workspaceId);
    await this.db.subscription.update({
      where: { workspaceId: sub.workspaceId },
      data: { status: "PAST_DUE", failedAttempts: attempts, nextAttemptAt: new Date(now.getTime() + RETRY_AFTER_MS) },
    });
  }
}
