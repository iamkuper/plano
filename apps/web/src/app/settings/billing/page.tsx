"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Download, Minus, Plus } from "lucide-react";
import { daysLeft, formatRub, planAmount, prorateSeats, type BillingDto, type BillingInterval, type InvoicePayer, type PlanDto, t, intlTag } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, Dialog, Field, Input, PageHeader, Segmented, Skeleton, Textarea } from "@/components/ui";
import { goal } from "@/lib/analytics";
import { api, downloadInvoicePdf } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(intlTag(), { day: "numeric", month: "long", year: "numeric" }) : "");
const limit = (n: number | null) => (n === null ? t("settings.billing.unlimited") : String(n));
const storage = (mb: number) => (mb >= 1024 ? t("common.gb", { value: Math.round((mb / 1024) * 10) / 10 }) : t("settings.billing.mb", { mb }));

const FEATURE_LABELS: Record<string, string> = {
  time: t("settings.billing.timeTrackingAndReports"),
  roles: t("settings.billing.customRolesAndPermissions"),
  audit: t("settings.billing.activityLog"),
  export: t("settings.billing.dataExport"),
  gantt: t("settings.billing.ganttChart"),
  fields: t("settings.billing.customCardFields"),
};

function status(b: BillingDto) {
  const s = b.subscription;
  if (b.locked) {
    const ended = date(s.status === "TRIALING" ? s.trialEndsAt : s.currentPeriodEnd);
    return t("settings.billing.thePlanHasEndedData", { name: b.plan.name, value: ended ? ` ${ended}` : "" });
  }
  if (s.status === "TRIALING" && b.plan.id !== "FREE") return t("settings.billing.trialUntil", { date: date(s.trialEndsAt) });
  if (b.plan.id === "FREE") return s.status === "TRIALING" ? t("settings.billing.theTrialHasEndedThe") : t("settings.billing.freePlan");
  return t("settings.billing.paidUntilThereAreNo", { date: date(s.currentPeriodEnd) });
}

function Usage({ label, used, max, unit }: { label: string; used: number; max: number | null; unit?: (n: number) => string }) {
  const fmt = unit ?? String;
  const ratio = max ? Math.min(used / max, 1) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-faint">{label}</span>
        <span>{t("settings.billing.of", { fmt: fmt(used), fmt2: max === null ? "∞" : fmt(max) })}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-surface-sunken" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemax={max ?? undefined}>
        <div className={`h-1 rounded-full ${ratio >= 1 ? "bg-danger" : "bg-accent"}`} style={{ width: `${max === null ? 0 : ratio * 100}%` }} />
      </div>
    </div>
  );
}

// Seats stepper: never below the active users, never above the cap.
function SeatPicker({ value, min, max, onChange }: { value: number; min: number; max: number | null; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(min, max === null ? n : Math.min(n, max));
  const btn = "grid size-8 place-items-center text-ink-faint transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-faint">{t("platform.users2")}</span>
      <div className="flex h-8 items-center overflow-hidden rounded-md border border-border">
        <button type="button" aria-label={t("settings.billing.fewerSeats")} className={btn} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
          <Minus size={14} />
        </button>
        <input
          aria-label={t("settings.billing.numberOfUsers")}
          inputMode="numeric"
          className="h-8 w-12 border-x border-border bg-transparent text-center text-sm outline-none"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
        />
        <button type="button" aria-label={t("settings.billing.moreSeats")} className={btn} disabled={max !== null && value >= max} onClick={() => onChange(clamp(value + 1))}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// Extra seats on the current paid plan: paid for the days left in the period.
function seatTopUp(b: BillingDto, plan: PlanDto, seats: number) {
  const s = b.subscription;
  if (b.locked || s.status !== "ACTIVE" || s.planId !== plan.id || s.seats == null || !s.currentPeriodEnd) return null;
  if (new Date(s.currentPeriodEnd) <= new Date() || seats <= s.seats) return null;
  const extra = seats - s.seats;
  return { extra, amount: prorateSeats(plan, s.interval, extra, s.currentPeriodEnd), days: daysLeft(s.currentPeriodEnd), until: s.currentPeriodEnd };
}

// Company details for a bank-transfer invoice. Prefilled from the last request.
function InvoiceDialog({ plan, interval, seats, addSeats, amount: fixedAmount, initial, pdfReady, onClose, onDone }: { plan: PlanDto; interval: BillingInterval; seats: number; addSeats?: number; amount?: number; initial: InvoicePayer | null; pdfReady: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    payerName: initial?.payerName ?? "",
    payerInn: initial?.payerInn ?? "",
    payerKpp: initial?.payerKpp ?? "",
    payerAddress: initial?.payerAddress ?? "",
    payerEmail: initial?.payerEmail ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const amount = fixedAmount ?? planAmount(plan, seats, interval);
  return (
    <Dialog
      title={t("settings.billing.payByInvoice")}
      description={
        addSeats
          ? t("settings.billing.planUsersUntilTheEnd", { name: plan.name, addSeats, formatRub: formatRub(amount) })
          : t("settings.billing.planUsers", { name: plan.name, seats, value: interval === "YEAR" ? t("common.periodYear") : t("common.periodMonth"), formatRub: formatRub(amount) })
      }
      onClose={onClose}
      width="max-w-lg"
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            goal("invoice_requested", { plan: plan.id });
            const { id, invoiceNumber, pdf } = await api.requestInvoice({ planId: plan.id, interval, seats, addSeats, ...form, payerKpp: form.payerKpp || null });
            if (pdf) {
              await downloadInvoicePdf(id, invoiceNumber).catch(() => {});
              toast(t("settings.billing.invoiceNoDownloadedAndSent", { invoiceNumber, payerEmail: form.payerEmail }), "success");
            } else {
              toast(t("settings.billing.invoiceNoRequestedItWill", { invoiceNumber, payerEmail: form.payerEmail }), "success");
            }
            onDone();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("settings.billing.companyOrSoleTrader")}>
          {(a) => <Input {...a} autoFocus placeholder={t("settings.billing.acmeInc")} value={form.payerName} onChange={set("payerName")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.billing.taxId")}>{(a) => <Input {...a} inputMode="numeric" maxLength={12} value={form.payerInn} onChange={set("payerInn")} />}</Field>
          <Field label={t("settings.billing.registrationCode")} hint={t("settings.billing.notNeededForSoleTraders")}>
            {(a) => <Input {...a} inputMode="numeric" maxLength={9} value={form.payerKpp} onChange={set("payerKpp")} />}
          </Field>
        </div>
        <Field label={t("settings.billing.legalAddress")}>
          {(a) => <Textarea {...a} className="min-h-[64px]" value={form.payerAddress} onChange={set("payerAddress")} />}
        </Field>
        <Field label={t("settings.billing.emailForTheInvoiceAnd")}>
          {(a) => <Input {...a} type="email" value={form.payerEmail} onChange={set("payerEmail")} />}
        </Field>
        <p className="text-sm text-ink-faint"> {t("settings.billing.thePlanTurnsOnWhen", { value: pdfReady ? t("settings.billing.invoiceDelivered") : t("settings.billing.invoiceEmailed") })} </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy}>
            
            {t("settings.billing.requestInvoice")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PlanCard({ plan, b, interval, seats: wanted, canPay, onPick, onInvoice, busy }: { plan: PlanDto; b: BillingDto; interval: BillingInterval; seats: number; canPay: boolean; onPick: () => void; onInvoice: () => void; busy: boolean }) {
  const current = !b.locked && b.plan.id === plan.id && b.subscription.status !== "TRIALING";
  const seats = plan.maxUsers === null ? wanted : Math.min(wanted, plan.maxUsers);
  const tooSmall = plan.maxUsers !== null && b.usage.users > plan.maxUsers;
  const same = current && b.subscription.interval === interval && b.subscription.seats === seats;
  const topUp = seatTopUp(b, plan, seats);
  const monthly = interval === "YEAR" ? (plan.priceKopecks * 10) / 12 : plan.priceKopecks;
  const features = [
    t("settings.billing.users", { limit: limit(plan.maxUsers) }),
    t("settings.billing.projects", { limit: limit(plan.maxProjects) }),
    t("settings.billing.recurringTasks", { limit: limit(plan.maxRecurring) }),
    plan.storageMbPerSeat ? t("settings.billing.filesPerPaidSeat", { storage: storage(plan.storageMbPerSeat) }) : t("settings.billing.files", { storage: storage(plan.storageMbBase) }),
    ...plan.features.map((f) => FEATURE_LABELS[f]),
  ];
  return (
    <div className={`flex flex-col rounded-lg border p-4 ${current ? "border-accent" : "border-border"}`}>
      <h3 className="text-base font-medium">{plan.name}</h3>
      <p className="mt-2 text-2xl font-semibold">{plan.priceKopecks ? formatRub(Math.round(monthly)) : "0 ₽"}</p>
      <p className="text-sm text-ink-faint">{plan.priceKopecks ? t("settings.billing.perUserPerMonth") : t("settings.billing.forever")}</p>
      <ul className="mt-4 flex-1 space-y-1.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-faint" />
            {f}
          </li>
        ))}
      </ul>
      {plan.priceKopecks > 0 && (
        <p className="mt-4 text-sm text-ink-faint">
          {tooSmall
            ? t("settings.billing.thePlanCoversUsersBut", { maxUsers: plan.maxUsers, users: b.usage.users })
            : topUp
              ? t("settings.billing.addUntilDaysThePeriod", { seats: t("plural.seats", { count: topUp.extra }), date: date(topUp.until), days: topUp.days, formatRub: formatRub(topUp.amount) })
              : t("settings.billing.dueForUsers", { formatRub: formatRub(planAmount(plan, seats, interval)), value: interval === "YEAR" ? t("common.periodYear") : t("common.periodMonth"), seats })}
        </p>
      )}
      <div className="mt-3">
        {plan.priceKopecks === 0 ? (
          <Button disabled className="w-full">{current ? t("settings.billing.currentPlan") : t("settings.billing.free")}</Button>
        ) : (
          <div className="space-y-1.5">
            <Button variant="primary" className="w-full" disabled={!canPay || tooSmall} loading={busy} onClick={onPick}>
              {topUp ? t("settings.billing.addByCard") : same ? t("settings.billing.extendByCard") : current ? t("settings.billing.changeAndPayByCard") : t("settings.billing.payByCard")}
            </Button>
            <Button variant="ghost" className="w-full" disabled={!canPay || tooSmall} onClick={onInvoice}>
              
              {t("settings.billing.payByInvoice2")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function BillingView() {
  const can = useCan();
  const params = useSearchParams();
  const [b, setB] = useState<BillingDto | null>(null);
  const [interval, setInterval_] = useState<BillingInterval>("MONTH");
  const [busy, setBusy] = useState<string | null>(null);
  const canPay = can("billing.manage");
  const [invoiceFor, setInvoiceFor] = useState<PlanDto | null>(null);
  const [seats, setSeats] = useState<number | null>(null);

  const load = useCallback(
    () =>
      api
        .billing()
        .then((next) => {
          setB(next);
          // Start from the paid seats, or from the people already here.
          setSeats((cur) => cur ?? Math.max(next.subscription.seats ?? 0, next.usage.users + next.usage.invitations, 1));
        })
        .catch((e) => toast((e as Error).message, "error")),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  // Back from the bank: the notification may arrive a few seconds later.
  const paid = params.get("paid");
  useEffect(() => {
    if (paid === null) return;
    if (paid === "1") goal("payment_success");
    toast(paid === "1" ? t("settings.billing.paymentReceivedThePlanWill") : t("settings.billing.paymentFailedPleaseTryAgain"), paid === "1" ? "success" : "error");
    const timers = [2000, 5000, 10000].map((ms) => setTimeout(load, ms));
    return () => timers.forEach(clearTimeout);
  }, [paid, load]);

  async function pick(plan: PlanDto) {
    setBusy(plan.id);
    try {
      const topUp = seatTopUp(b!, plan, plan.maxUsers === null ? seatCount : Math.min(seatCount, plan.maxUsers));
      goal("payment_started", { plan: plan.id, kind: topUp ? "seats" : "plan" });
      if (topUp) {
        window.location.href = (await api.buySeats(topUp.extra)).paymentUrl;
        return;
      }
      const { paymentUrl } = await api.checkout(plan.id, interval, plan.maxUsers === null ? seatCount : Math.min(seatCount, plan.maxUsers));
      window.location.href = paymentUrl;
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(null);
    }
  }


  if (!b) return <Skeleton className="h-64" />;
  const minSeats = Math.max(b.usage.users, 1);
  const seatCount = Math.max(seats ?? minSeats, minSeats);
  const maxSeats = b.plans.reduce<number | null>((m, p) => (p.priceKopecks <= 0 ? m : p.maxUsers === null || m === null ? null : Math.max(m, p.maxUsers)), 0);
  const trial = b.subscription.status === "TRIALING" && !b.locked;
  const canLeaveForFree = canPay && (b.locked || b.subscription.status === "TRIALING");
  return (
    <>
      <Card title={b.locked ? t("settings.billing.thePlanHasEnded", { name: b.plan.name }) : t("settings.billing.plan", { name: b.plan.name })} description={status(b)} action={
        canLeaveForFree ? (
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await api.switchToFree();
                toast(t("settings.billing.theFreePlanIsActive"), "success");
                load();
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            
            {t("settings.billing.switchToFree")}
          </Button>
        ) : undefined
      }>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Usage label={b.subscription.seats != null && !trial ? t("settings.billing.usersPaidSeats") : t("settings.billing.users2")} used={b.usage.users} max={b.seatLimit} />
            {trial && <p className="mt-1 text-xs text-ink-faint">{t("settings.billing.duringTheTrialUnlimitedAfter")}</p>}
            {!trial && b.usage.invitations > 0 && <p className="mt-1 text-xs text-ink-faint">{t("settings.billing.moreInInvitationsTheyTake", { invitations: b.usage.invitations })}</p>}
          </div>
          <Usage label={t("common.projects")} used={b.usage.projects} max={b.plan.maxProjects} />
          <Usage label={t("common.recurringTasks")} used={b.usage.recurring} max={b.plan.maxRecurring} />
          <div>
            <Usage label={t("common.files")} used={b.usage.storageMb} max={b.storageLimitMb} unit={(n) => storage(Math.round(n))} />
            {b.plan.storageMbPerSeat > 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                {b.subscription.seats != null && !trial
                  ? t("settings.billing.perPaidSeat", { storage: storage(b.plan.storageMbPerSeat) })
                  : t("settings.billing.perActiveUser", { storage: storage(b.plan.storageMbPerSeat) })}
              </p>
            )}
          </div>
        </div>
        {b.testMode && (
          <p className="mt-4 text-sm text-ink-faint">{t("settings.billing.paymentsGoThroughTestMode")}</p>
        )}
      </Card>

      <Card title={t("settings.billing.chooseAPlan")} description={t("settings.billing.thePriceIsPerPaid")} action={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <SeatPicker value={seatCount} min={minSeats} max={maxSeats === 0 ? null : maxSeats} onChange={setSeats} />
          <Segmented label={t("settings.billing.billingPeriod")} value={interval} onChange={setInterval_} options={[{ value: "MONTH", label: t("settings.billing.month") }, { value: "YEAR", label: t("settings.billing.year") }]} />
        </div>
      }>
        {!canPay && <p className="mb-3 text-sm text-ink-faint">{t("settings.billing.thePlanCanBeChanged")}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          {b.plans.map((p) => (
            <PlanCard key={p.id} plan={p} b={b} interval={interval} seats={seatCount} canPay={canPay} busy={busy === p.id} onPick={() => pick(p)} onInvoice={() => setInvoiceFor(p)} />
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-faint">{t("settings.billing.paymentIsOneOffBy")}</p>
      </Card>

      <Card title={t("common.payments")} bodyClassName="p-0">
        {b.payments.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-faint">{t("settings.billing.noPaymentsYet")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-faint">
                <th className="px-4 py-2 font-normal">{t("common.date")}</th>
                <th className="px-4 py-2 font-normal">{t("common.plan")}</th>
                <th className="px-4 py-2 font-normal">{t("settings.billing.amount")}</th>
                <th className="px-4 py-2 font-normal">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {b.payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{date(p.paidAt ?? p.createdAt)}</td>
                  <td className="px-4 py-2">
                    {b.plans.find((x) => x.id === p.planId)?.name}, {p.seats}  {t("settings.billing.users4")} {p.interval === "YEAR" ? t("common.periodYear") : t("common.periodMonth")}
                    {p.kind === "RENEWAL" ? t("common.renewalSuffix") : p.kind === "SEATS" ? t("settings.billing.extraSeats") : ""}
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                      {p.method === "INVOICE" ? t("settings.billing.invoiceNo", { invoiceNumber: p.invoiceNumber, value: p.payerName ? `, ${p.payerName}` : "" }) : t("settings.billing.card")}
                      {p.method === "INVOICE" && canPay && (
                        <button
                          className="inline-flex items-center gap-1 font-medium text-ink underline-offset-2 hover:underline"
                          onClick={() => downloadInvoicePdf(p.id, p.invoiceNumber!).catch((e) => toast((e as Error).message, "error"))}
                        >
                          <Download size={12} />  {t("settings.billing.downloadInvoice")}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">{formatRub(p.amount)}</td>
                  <td className="px-4 py-2">
                    {p.status === "PAID"
                      ? t("common.paid")
                      : p.status === "FAILED"
                        ? p.method === "INVOICE"
                          ? p.failReason ?? t("common.cancelled")
                          : t("settings.billing.failed")
                        : p.method === "INVOICE"
                          ? t("settings.billing.awaitingInvoicePayment")
                          : t("settings.billing.awaitingPayment")}
                    {p.method === "INVOICE" && p.status === "PENDING" && canPay && (
                      <button
                        className="ml-2 text-xs text-ink-faint underline hover:text-ink"
                        onClick={async () => {
                          try {
                            await api.cancelInvoice(p.id);
                            toast(t("common.invoiceRequestCancelled"), "success");
                            load();
                          } catch (e) {
                            toast((e as Error).message, "error");
                          }
                        }}
                      >
                        
                        {t("settings.roles.undo")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {invoiceFor && (
        <InvoiceDialog
          plan={invoiceFor}
          interval={interval}
          seats={invoiceFor.maxUsers === null ? seatCount : Math.min(seatCount, invoiceFor.maxUsers)}
          addSeats={seatTopUp(b, invoiceFor, seatCount)?.extra}
          amount={seatTopUp(b, invoiceFor, seatCount)?.amount}
          initial={b.lastPayer}
          pdfReady={b.invoicePdf}
          onClose={() => setInvoiceFor(null)}
          onDone={load}
        />
      )}
    </>
  );
}

export default function BillingPage() {
  return (
    <AppShell>
      <PageHeader title={t("common.settings")} meta={<SettingsTabs />} />
      <div className="w-full space-y-4 py-6">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <BillingView />
        </Suspense>
      </div>
    </AppShell>
  );
}
