"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { formatRub, planAmount, type BillingDto, type BillingInterval, type PlanDto } from "@amo-kanban/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, ConfirmDialog, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "");
const limit = (n: number | null) => (n === null ? "без ограничений" : String(n));
const storage = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} ГБ` : `${mb} МБ`);

const FEATURE_LABELS: Record<string, string> = {
  time: "Учёт времени и отчёты",
  roles: "Свои роли и права",
  audit: "Журнал действий",
  export: "Экспорт данных",
  api: "API и webhook'и",
};

function status(b: BillingDto) {
  const s = b.subscription;
  if (s.status === "TRIALING" && b.plan.id !== "FREE") return `Пробный период до ${date(s.trialEndsAt)}`;
  if (b.plan.id === "FREE") return s.status === "TRIALING" ? "Пробный период закончился, действует бесплатный тариф" : "Бесплатный тариф";
  if (s.status === "PAST_DUE") return "Не удалось списать оплату. Попробуем ещё раз, проверьте карту";
  if (s.cancelAtPeriodEnd) return `Оплачен до ${date(s.currentPeriodEnd)}, продление отключено`;
  return `Оплачен до ${date(s.currentPeriodEnd)}, дальше спишем автоматически${s.cardMask ? ` с карты ${s.cardMask}` : ""}`;
}

function Usage({ label, used, max, unit }: { label: string; used: number; max: number | null; unit?: (n: number) => string }) {
  const fmt = unit ?? String;
  const ratio = max ? Math.min(used / max, 1) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-faint">{label}</span>
        <span>{fmt(used)} из {max === null ? "∞" : fmt(max)}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-surface-sunken" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemax={max ?? undefined}>
        <div className={`h-1 rounded-full ${ratio >= 1 ? "bg-danger" : "bg-accent"}`} style={{ width: `${max === null ? 0 : ratio * 100}%` }} />
      </div>
    </div>
  );
}

function PlanCard({ plan, b, interval, canPay, onPick, busy }: { plan: PlanDto; b: BillingDto; interval: BillingInterval; canPay: boolean; onPick: () => void; busy: boolean }) {
  const current = b.plan.id === plan.id && b.subscription.status !== "TRIALING";
  const seats = Math.max(b.usage.users, 1);
  const monthly = interval === "YEAR" ? (plan.priceKopecks * 10) / 12 : plan.priceKopecks;
  const features = [
    `Пользователей: ${limit(plan.maxUsers)}`,
    `Проектов: ${limit(plan.maxProjects)}`,
    `Повторяющихся задач: ${limit(plan.maxRecurring)}`,
    plan.storageMbPerSeat ? `Файлы: ${storage(plan.storageMbPerSeat)} на пользователя` : `Файлы: ${storage(plan.storageMbBase)}`,
    ...plan.features.map((f) => FEATURE_LABELS[f]),
  ];
  return (
    <div className={`flex flex-col rounded-lg border p-4 ${current ? "border-accent" : "border-border"}`}>
      <h3 className="text-base font-medium">{plan.name}</h3>
      <p className="mt-2 text-2xl font-semibold">{plan.priceKopecks ? formatRub(Math.round(monthly)) : "0 ₽"}</p>
      <p className="text-sm text-ink-faint">{plan.priceKopecks ? "за пользователя в месяц" : "навсегда"}</p>
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
          Сейчас к оплате {formatRub(planAmount(plan, seats, interval))} за {interval === "YEAR" ? "год" : "месяц"} ({seats} польз.)
        </p>
      )}
      <div className="mt-3">
        {plan.priceKopecks === 0 ? (
          <Button disabled className="w-full">{current ? "Текущий тариф" : "Бесплатный"}</Button>
        ) : current && b.subscription.interval === interval ? (
          <Button disabled className="w-full">Текущий тариф</Button>
        ) : (
          <Button variant="primary" className="w-full" disabled={!canPay} loading={busy} onClick={onPick}>
            {current ? "Сменить период" : "Выбрать"}
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
    toast(paid === "1" ? "Оплата получена, тариф обновится через несколько секунд" : "Оплата не прошла. Попробуйте ещё раз", paid === "1" ? "success" : "error");
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
      toast(cancel ? "Продление отключено" : "Продление включено", "success");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  if (!b) return <Skeleton className="h-64" />;
  const paidPlan = b.subscription.planId !== "FREE" && b.subscription.status !== "TRIALING";
  return (
    <>
      <Card title={`Тариф ${b.plan.name}`} description={status(b)} action={
        paidPlan && canPay ? (
          b.subscription.cancelAtPeriodEnd ? (
            <Button onClick={() => setCancel(false)}>Включить продление</Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Отключить продление</Button>
          )
        ) : undefined
      }>
        <div className="grid gap-4 sm:grid-cols-2">
          <Usage label="Пользователи" used={b.usage.users} max={b.plan.maxUsers} />
          <Usage label="Проекты" used={b.usage.projects} max={b.plan.maxProjects} />
          <Usage label="Повторяющиеся задачи" used={b.usage.recurring} max={b.plan.maxRecurring} />
          <Usage label="Файлы" used={b.usage.storageMb} max={b.storageLimitMb} unit={(n) => storage(Math.round(n))} />
        </div>
        {b.testMode && (
          <p className="mt-4 text-sm text-ink-faint">Платежи идут через тестовый режим: реальные деньги не списываются.</p>
        )}
      </Card>

      <Card title="Выбрать тариф" description="Цена считается по числу активных пользователей. Год стоит как 10 месяцев." action={
        <Segmented label="Период оплаты" value={interval} onChange={setInterval_} options={[{ value: "MONTH", label: "Месяц" }, { value: "YEAR", label: "Год" }]} />
      }>
        {!canPay && <p className="mb-3 text-sm text-ink-faint">Менять тариф может администратор или сотрудник с правом «Управлять тарифом и оплатой».</p>}
        <div className="grid gap-4 md:grid-cols-3">
          {b.plans.map((p) => (
            <PlanCard key={p.id} plan={p} b={b} interval={interval} canPay={canPay} busy={busy === p.id} onPick={() => pick(p)} />
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-faint">Оплата нового тарифа начинает новый оплаченный период с сегодняшнего дня. При превышении лимитов существующие данные остаются, новые записи создать нельзя.</p>
      </Card>

      <Card title="Платежи" bodyClassName="p-0">
        {b.payments.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-faint">Платежей пока нет.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-ink-faint">
                <th className="px-4 py-2 font-normal">Дата</th>
                <th className="px-4 py-2 font-normal">Тариф</th>
                <th className="px-4 py-2 font-normal">Сумма</th>
                <th className="px-4 py-2 font-normal">Статус</th>
              </tr>
            </thead>
            <tbody>
              {b.payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{date(p.paidAt ?? p.createdAt)}</td>
                  <td className="px-4 py-2">
                    {b.plans.find((x) => x.id === p.planId)?.name}, {p.seats} польз., {p.interval === "YEAR" ? "год" : "месяц"}
                    {p.kind === "RENEWAL" ? ", продление" : ""}
                  </td>
                  <td className="px-4 py-2">{formatRub(p.amount)}</td>
                  <td className="px-4 py-2">{p.status === "PAID" ? "Оплачен" : p.status === "FAILED" ? "Не прошёл" : "Ожидает оплаты"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {confirmCancel && (
        <ConfirmDialog
          title="Отключить продление?"
          body={`Тариф ${b.plan.name} будет действовать до ${date(b.subscription.currentPeriodEnd)}, потом начнётся бесплатный. Данные сохранятся.`}
          confirmLabel="Отключить"
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
      <PageHeader title="Настройки" meta={<SettingsTabs />} />
      <div className="w-full space-y-4 py-6">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <BillingView />
        </Suspense>
      </div>
    </AppShell>
  );
}
