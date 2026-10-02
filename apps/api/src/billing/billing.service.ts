import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Payment, Plan, Subscription } from "@prisma/client";
import { daysLeft, planAmount, prorateSeats, type BillingDto, type BillingInterval, type PlanDto, type PlanFeature } from "@amo-kanban/shared";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { currentWorkspaceId, runInWorkspace } from "../prisma/tenant";
import { PAYMENT_PROVIDER, type PaymentNotification, type PaymentProvider } from "./payment-provider";
import { mockNotification } from "./mock.provider";
import { GRACE_AFTER_PERIOD_MS, isLocked } from "./subscription-state";
import { AuditService } from "../audit/audit.service";
import { appUrl } from "../auth/tokens";
import { MailService } from "../mail/mail.service";
import { platformAdminEmails } from "../platform/platform-admin.guard";
import { plural } from "./amount-words";
import { renderInvoicePdf, sellerFromEnv } from "./invoice-pdf";

const DAY = 86_400_000;
export const TRIAL_DAYS = 14;
// Days before the end of a trial or paid period when billing managers are reminded.
export const REMIND_DAYS = 3;

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
    private readonly mail: MailService,
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
        id: p.id, kind: p.kind, method: p.method, invoiceNumber: p.invoiceNumber, payerName: p.payerName, failReason: p.failReason,
        planId: p.planId as PlanDto["id"], interval: p.interval, seats: p.seats,
        amount: p.amount, status: p.status, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
      })),
      lastPayer: await this.lastPayer(workspaceId),
      invoicePdf: this.canMakeInvoicePdf,
      testMode: this.provider.test,
    };
  }

  // ---- paying ----

  private newOrderId() {
    return `plano-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  }

  // Starts a payment of a paid plan: returns the bank's payment page URL.
  // The price covers the active users now; the period starts when paid.
  // Validates a purchase: a paid plan, seats not below the active users and
  // not above the plan's cap.
  private async purchase(workspaceId: string, planId: string, seatsWanted?: number) {
    const plan = await this.db.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.priceKopecks <= 0) throw new BadRequestException("Выберите платный тариф");
    const active = await this.db.user.count({ where: { workspaceId, isActive: true } });
    const seats = seatsWanted ?? Math.max(active, 1);
    if (seats < Math.max(active, 1)) throw new BadRequestException(`Мест должно быть не меньше, чем активных пользователей: ${active}. Лишних сотрудников можно отключить`);
    if (plan.maxUsers !== null && seats > plan.maxUsers) throw new BadRequestException(`На тарифе ${plan.name} — не больше ${plan.maxUsers} пользователей`);
    return { plan, seats };
  }

  // Extra seats inside a running paid period: only the days left are paid,
  // the period stays as it is.
  private async seatsPurchase(workspaceId: string, extra: number) {
    const sub = await this.db.subscription.findUniqueOrThrow({ where: { workspaceId }, include: { plan: true } });
    const now = new Date();
    if (sub.plan.priceKopecks <= 0 || sub.status !== "ACTIVE" || sub.seats == null || !sub.currentPeriodEnd || sub.currentPeriodEnd <= now) {
      throw new BadRequestException("Докупить места можно в оплаченном периоде. Сейчас выберите тариф и число мест целиком");
    }
    if (!Number.isInteger(extra) || extra < 1) throw new BadRequestException("Укажите, сколько мест добавить");
    if (sub.plan.maxUsers !== null && sub.seats + extra > sub.plan.maxUsers) throw new BadRequestException(`На тарифе ${sub.plan.name} — не больше ${sub.plan.maxUsers} пользователей`);
    return { sub, plan: sub.plan, amount: prorateSeats(sub.plan, sub.interval, extra, sub.currentPeriodEnd, now), days: daysLeft(sub.currentPeriodEnd, now) };
  }

  async buySeats(extra: number, email: string) {
    const workspaceId = this.ws;
    const { sub, plan, amount, days } = await this.seatsPurchase(workspaceId, extra);
    const payment = await this.db.payment.create({
      data: { workspaceId, kind: "SEATS", planId: plan.id, interval: sub.interval, seats: extra, amount, orderId: this.newOrderId() },
    });
    try {
      const init = await this.provider.init({
        orderId: payment.orderId,
        amount,
        description: `Plano, тариф ${plan.name}: +${extra} польз. на ${days} дн.`,
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

  async checkout(planId: string, interval: BillingInterval, seatsWanted: number | undefined, email: string) {
    const workspaceId = this.ws;
    const { plan, seats } = await this.purchase(workspaceId, planId, seatsWanted);
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


  // ---- bank transfer by invoice ----

  private async lastPayer(workspaceId: string) {
    const p = await this.db.payment.findFirst({ where: { workspaceId, method: "INVOICE" }, orderBy: { createdAt: "desc" } });
    if (!p?.payerName) return null;
    return { payerName: p.payerName, payerInn: p.payerInn ?? "", payerKpp: p.payerKpp, payerAddress: p.payerAddress ?? "", payerEmail: p.payerEmail ?? "" };
  }

  // A company asks for an invoice instead of paying by card. The request is
  // a PENDING payment; the platform owner issues the invoice from the
  // details, and marks it paid when the money arrives (markInvoicePaid).
  // A newer request replaces an unpaid older one.
  async requestInvoice(
    dto: { planId: string; interval: BillingInterval; seats?: number; addSeats?: number; payerName: string; payerInn: string; payerKpp?: string; payerAddress: string; payerEmail: string },
    requester: { email: string },
  ) {
    const workspaceId = this.ws;
    const extra = dto.addSeats ? await this.seatsPurchase(workspaceId, dto.addSeats) : null;
    const { plan, seats } = extra ? { plan: extra.plan, seats: dto.addSeats! } : await this.purchase(workspaceId, dto.planId, dto.seats);
    const interval = extra ? extra.sub.interval : dto.interval;
    await this.db.payment.updateMany({
      where: { workspaceId, method: "INVOICE", status: "PENDING" },
      data: { status: "FAILED", failReason: "Заменён новым счётом" },
    });
    const last = await this.db.payment.aggregate({ _max: { invoiceNumber: true } });
    const payment = await this.db.payment.create({
      data: {
        workspaceId, kind: extra ? "SEATS" : "INITIAL", method: "INVOICE", planId: plan.id, interval, seats,
        amount: extra ? extra.amount : planAmount(plan, seats, interval), orderId: this.newOrderId(),
        invoiceNumber: (last._max.invoiceNumber ?? 0) + 1,
        payerName: dto.payerName.trim(), payerInn: dto.payerInn.trim(), payerKpp: dto.payerKpp?.trim() || null,
        payerAddress: dto.payerAddress.trim(), payerEmail: dto.payerEmail.trim(),
      },
      include: { workspace: { select: { name: true } } },
    });
    const amount = (payment.amount / 100).toLocaleString("ru-RU");
    const period = extra ? `доплата за ${extra.days} дн. до конца периода` : interval === "YEAR" ? "год" : "месяц";
    const pdf = await this.invoicePdfOf(payment).catch(() => null);
    const files = pdf ? [{ filename: pdf.filename, content: pdf.content }] : undefined;
    await this.audit.record("billing.invoice", `Запрошен счёт №${payment.invoiceNumber}: тариф ${plan.name}, ${extra ? "+" : ""}${seats} польз., ${period}, ${amount} ₽`, payment.id);

    const details = [
      `Счёт №${payment.invoiceNumber} на ${amount} ₽`,
      `Пространство: ${payment.workspace.name}, ID аккаунта ${workspaceId}`,
      `Тариф ${plan.name}, ${extra ? "+" : ""}${seats} польз., ${period}`,
      "",
      `Плательщик: ${payment.payerName}`,
      `ИНН ${payment.payerInn}${payment.payerKpp ? `, КПП ${payment.payerKpp}` : ""}`,
      `Адрес: ${payment.payerAddress}`,
      `Почта для счёта: ${payment.payerEmail}`,
      `Запросил: ${requester.email}`,
    ].join("\n");
    for (const to of platformAdminEmails()) {
      await this.mail.send(to, `Plano: запрос счёта №${payment.invoiceNumber} — ${payment.payerName}`, `${details}\n\nКогда оплата поступит, отметьте счёт оплаченным: ${appUrl()}/platform`, files);
    }
    await this.mail.send(
      payment.payerEmail!,
      `Plano: запрос счёта №${payment.invoiceNumber} принят`,
      pdf
        ? `${details}\n\nСчёт во вложении. Тариф включится, как только оплата поступит на счёт.`
        : `${details}\n\nСчёт пришлём на эту почту. Тариф включится, как только оплата поступит на счёт.`,
      files,
    );
    return { id: payment.id, invoiceNumber: payment.invoiceNumber, pdf: !!pdf };
  }

  // PDF of an invoice made from the seller's details (SELLER_* env).
  private async invoicePdfOf(p: Payment) {
    const seller = sellerFromEnv();
    if (!seller) throw new HttpException("Реквизиты продавца не настроены: счёт в PDF пока недоступен, пришлём его на почту", HttpStatus.SERVICE_UNAVAILABLE);
    const plan = await this.db.plan.findUniqueOrThrow({ where: { id: p.planId } });
    const period = p.interval === "YEAR" ? "12 месяцев" : "1 месяц";
    const sub = p.kind === "SEATS" ? await this.db.subscription.findUnique({ where: { workspaceId: p.workspaceId } }) : null;
    const until = sub?.currentPeriodEnd?.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
    const content = await renderInvoicePdf(seller, {
      number: p.invoiceNumber!,
      workspaceId: p.workspaceId,
      date: p.createdAt,
      payer: { name: p.payerName ?? "", inn: p.payerInn ?? "", kpp: p.payerKpp, address: p.payerAddress ?? "" },
      item:
        p.kind === "SEATS"
          ? `Дополнительные места в сервисе Plano, тариф «${plan.name}»: ${p.seats} ${plural(p.seats, "пользователь", "пользователя", "пользователей")}${until ? ` до ${until}` : ""}`
          : `Предоставление доступа к сервису Plano, тариф «${plan.name}», ${p.seats} ${plural(p.seats, "пользователь", "пользователя", "пользователей")}, ${period}`,
      amount: p.amount,
    });
    return { filename: `Plano-schet-${p.invoiceNumber}.pdf`, content };
  }

  // The workspace's own invoice; `anyWorkspace` for the platform owner.
  async invoicePdf(id: string, anyWorkspace = false) {
    const p = await this.db.payment.findFirst({ where: { id, method: "INVOICE", ...(anyWorkspace ? {} : { workspaceId: this.ws }) } });
    if (!p) throw new NotFoundException("Счёт не найден");
    return this.invoicePdfOf(p);
  }

  get canMakeInvoicePdf() {
    return !!sellerFromEnv();
  }

  async cancelInvoice(id: string) {
    const done = await this.db.payment.updateMany({
      where: { id, workspaceId: this.ws, method: "INVOICE", status: "PENDING" },
      data: { status: "FAILED", failReason: "Отменён" },
    });
    if (!done.count) throw new NotFoundException("Счёт не найден или уже закрыт");
    await this.audit.record("billing.invoice.cancel", "Запрос счёта отменён", id);
  }

  // Platform owner: the transfer arrived. Activates the plan like a card
  // payment (same prolong-or-start rules). Idempotent.
  async markInvoicePaid(id: string) {
    const payment = await this.db.payment.findUnique({ where: { id } });
    if (!payment || payment.method !== "INVOICE") throw new NotFoundException("Счёт не найден");
    if (payment.status === "PAID") return;
    if (payment.status !== "PENDING") throw new BadRequestException("Счёт отменён");
    const settled = await this.db.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "PAID", paidAt: new Date() } });
    if (settled.count) await this.activate(payment);
  }

  pendingInvoices() {
    return this.db.payment.findMany({
      where: { method: "INVOICE", status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { workspace: { select: { id: true, name: true } } },
    });
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
    if (payment.kind === "SEATS") {
      // Same period, more seats.
      const seats = (sub.seats ?? 0) + payment.seats;
      await this.db.subscription.update({ where: { workspaceId: payment.workspaceId }, data: { seats } });
      await runInWorkspace(payment.workspaceId, () =>
        this.audit.record("billing.seats", `Докуплено мест: ${payment.seats}, теперь ${seats}. Оплачено ${(payment.amount / 100).toLocaleString("ru-RU")} ₽`, payment.id),
      );
      return;
    }
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

  // Without auto-renewal people forget to pay, so whoever manages billing
  // gets a letter REMIND_DAYS before the trial or paid period ends and one
  // more once it has ended (during the grace, before the lock). Each is sent
  // once per end date. The in-app banner is on the web side.
  private async remindEnding(now: Date) {
    const soon = new Date(now.getTime() + REMIND_DAYS * DAY);
    const subs = await this.db.subscription.findMany({
      where: {
        planId: { not: "FREE" },
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
        OR: [
          { status: "TRIALING", trialEndsAt: { lte: soon } },
          { status: { not: "TRIALING" }, currentPeriodEnd: { lte: soon } },
        ],
      },
      include: { plan: true, workspace: { select: { name: true } } },
    });
    for (const sub of subs) {
      const trial = sub.status === "TRIALING";
      const end = trial ? sub.trialEndsAt : sub.currentPeriodEnd;
      // An ended trial has no grace: it locks in this same run, right after the letter.
      if (!end || (!trial && isLocked(sub, now))) continue;
      const stage = end > now ? 1 : 2;
      const already = sub.endReminderFor?.getTime() === end.getTime() ? sub.endReminderStage : 0;
      if (already >= stage) continue;
      await this.db.subscription.update({ where: { id: sub.id }, data: { endReminderFor: end, endReminderStage: stage } });

      const recipients = await this.db.user.findMany({
        where: {
          workspaceId: sub.workspaceId,
          isActive: true,
          OR: [{ role: "ADMIN" }, { customRole: { permissions: { has: "billing.manage" } } }],
        },
        select: { email: true },
      });
      const what = trial ? `Пробный период тарифа ${sub.plan.name}` : `Оплаченный период тарифа ${sub.plan.name}`;
      const day = end.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
      const lockDay = new Date(end.getTime() + (trial ? 0 : GRACE_AFTER_PERIOD_MS)).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
      const subject =
        stage === 1 ? `Plano: ${trial ? "пробный период" : "тариф"} заканчивается ${day}` : `Plano: ${trial ? "пробный период закончился" : "тариф закончился"}`;
      const body = [
        `Пространство «${sub.workspace.name}».`,
        stage === 1
          ? `${what} заканчивается ${day}. Автоматических списаний нет — чтобы работа не остановилась, оплатите тариф картой.`
          : trial
            ? `${what} закончился ${day}. Пространство доступно только для чтения, пока тариф не оплачен.`
            : `${what} закончился ${day}. ${lockDay} пространство перейдёт в режим чтения, если тариф не оплатить.`,
        "",
        `Оплатить: ${appUrl()}/settings/billing`,
      ].join("\n");
      for (const r of recipients) await this.mail.send(r.email, subject, body);
    }
  }

  // No automatic renewals: a trial or paid period that ran out (paid ones
  // after a short grace) makes the workspace read-only until paid by card.
  async runDue(now = new Date()) {
    await this.remindEnding(now);
    const trials = await this.db.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { lte: now } } });
    for (const t of trials) await this.lock(t.workspaceId);
    const ended = await this.db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, planId: { not: "FREE" }, currentPeriodEnd: { lte: new Date(now.getTime() - GRACE_AFTER_PERIOD_MS) } },
    });
    for (const e of ended) await this.lock(e.workspaceId);
    return { trials: trials.length, ended: ended.length };
  }
}
