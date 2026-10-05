"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { formatRub, planAmount, type BillingDto, type BillingInterval, type PlanDto, t, intlTag } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, ConfirmDialog, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
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
  if (s.status === "PAST_DUE") return t("settings.billing.thePaymentCouldNotBe");
  if (s.cancelAtPeriodEnd) return t("settings.billing.paidUntilRenewalIsOff", { date: date(s.currentPeriodEnd) });
  return t("settings.billing.paidUntilThenChargedAutomatically", { date: date(s.currentPeriodEnd), value: s.cardMask ? t("settings.billing.fromCard", { cardMask: s.cardMask }) : "" });
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

function PlanCard({ plan, b, interval, canPay, onPick, busy }: { plan: PlanDto; b: BillingDto; interval: BillingInterval; canPay: boolean; onPick: () => void; busy: boolean }) {
  const current = !b.locked && b.plan.id === plan.id && b.subscription.status !== "TRIALING";
  const seats = Math.max(b.usage.users, 1);
  const monthly = interval === "YEAR" ? (plan.priceKopecks * 10) / 12 : plan.priceKopecks;
  const features = [
    t("settings.billing.users", { limit: limit(plan.maxUsers) }),
    t("settings.billing.projects", { limit: limit(plan.maxProjects) }),
    t("settings.billing.recurringTasks", { limit: limit(plan.maxRecurring) }),
    plan.storageMbPerSeat ? t("settings.billing.filesPerUser", { storage: storage(plan.storageMbPerSeat) }) : t("settings.billing.files", { storage: storage(plan.storageMbBase) }),
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
        <p className="mt-4 text-sm text-ink-faint"> {t("settings.billing.dueNowForUsers", { formatRub: formatRub(planAmount(plan, seats, interval)), value: interval === "YEAR" ? t("common.periodYear") : t("common.periodMonth"), seats })} </p>
      )}
      <div className="mt-3">
        {plan.priceKopecks === 0 ? (
          <Button disabled className="w-full">{current ? t("settings.billing.currentPlan") : t("settings.billing.free")}</Button>
        ) : current && b.subscription.interval === interval ? (
          <Button disabled className="w-full">{t("settings.billing.currentPlan")}</Button>
        ) : (
          <Button variant="primary" className="w-full" disabled={!canPay} loading={busy} onClick={onPick}>
            {current ? t("settings.billing.changePeriod") : t("settings.billing.choose")}
          </Button>
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canPay = can("billing.manage");

  const load = useCallback(() => api.billing().then(setB).catch((e) => toast((e as Error).message, "error")), []);
  useEffect(() => {
    load();
  }, [load]);

  // Back from the bank: the notification may arrive a few seconds later.
  const paid = params.get("paid");
  useEffect(() => {
    if (paid === null) return;
    toast(paid === "1" ? t("settings.billing.paymentReceivedThePlanWill") : t("settings.billing.paymentFailedPleaseTryAgain"), paid === "1" ? "success" : "error");
    const timers = [2000, 5000, 10000].map((ms) => setTimeout(load, ms));
    return () => timers.forEach(clearTimeout);
  }, [paid, load]);

  async function pick(plan: PlanDto) {
    setBusy(plan.id);
    try {
      const { paymentUrl } = await api.checkout(plan.id, interval);
      window.location.href = paymentUrl;
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(null);
    }
  }

  async function setCancel(cancel: boolean) {
    try {
      await api.cancelSubscription(cancel);
      toast(cancel ? t("settings.billing.renewalTurnedOff") : t("settings.billing.renewalTurnedOn"), "success");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  if (!b) return <Skeleton className="h-64" />;
  const paidPlan = b.subscription.planId !== "FREE" && b.subscription.status !== "TRIALING" && !b.locked;
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
        ) : paidPlan && canPay ? (
          b.subscription.cancelAtPeriodEnd ? (
            <Button onClick={() => setCancel(false)}>{t("settings.billing.turnOnRenewal")}</Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmCancel(true)}>{t("settings.billing.turnOffRenewal")}</Button>
          )
        ) : undefined
      }>
        <div className="grid gap-4 sm:grid-cols-2">
          <Usage label={t("settings.billing.users2")} used={b.usage.users} max={b.plan.maxUsers} />
          <Usage label={t("common.projects")} used={b.usage.projects} max={b.plan.maxProjects} />
          <Usage label={t("common.recurringTasks")} used={b.usage.recurring} max={b.plan.maxRecurring} />
          <Usage label={t("common.files")} used={b.usage.storageMb} max={b.storageLimitMb} unit={(n) => storage(Math.round(n))} />
        </div>
        {b.testMode && (
          <p className="mt-4 text-sm text-ink-faint">{t("settings.billing.paymentsGoThroughTestMode")}</p>
        )}
      </Card>

      <Card title={t("settings.billing.chooseAPlan")} description={t("settings.billing.thePriceDependsOnThe")} action={
        <Segmented label={t("settings.billing.billingPeriod")} value={interval} onChange={setInterval_} options={[{ value: "MONTH", label: t("settings.billing.month") }, { value: "YEAR", label: t("settings.billing.year") }]} />
      }>
        {!canPay && <p className="mb-3 text-sm text-ink-faint">{t("settings.billing.thePlanCanBeChanged")}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          {b.plans.map((p) => (
            <PlanCard key={p.id} plan={p} b={b} interval={interval} canPay={canPay} busy={busy === p.id} onPick={() => pick(p)} />
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-faint">{t("settings.billing.payingForANewPlan")}</p>
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
                  <td className="px-4 py-2"> {t("settings.billing.users3", { name: b.plans.find((x) => x.id === p.planId)?.name, seats: p.seats, value: p.interval === "YEAR" ? t("common.periodYear") : t("common.periodMonth"), value2: p.kind === "RENEWAL" ? t("common.renewalSuffix") : "" })} </td>
                  <td className="px-4 py-2">{formatRub(p.amount)}</td>
                  <td className="px-4 py-2">{p.status === "PAID" ? t("common.paid") : p.status === "FAILED" ? t("settings.billing.failed") : t("settings.billing.awaitingPayment")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {confirmCancel && (
        <ConfirmDialog
          title={t("settings.billing.turnOffRenewal2")}
          body={t("settings.billing.thePlanWillStayActive", { name: b.plan.name, date: date(b.subscription.currentPeriodEnd) })}
          confirmLabel={t("common.turnOff")}
          onConfirm={async () => {
            await setCancel(true);
            setConfirmCancel(false);
          }}
          onClose={() => setConfirmCancel(false)}
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
