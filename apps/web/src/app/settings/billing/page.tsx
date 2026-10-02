"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import { formatRub, planAmount, type BillingDto, type BillingInterval, type InvoicePayer, type PlanDto } from "@amo-kanban/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, Dialog, Field, Input, PageHeader, Segmented, Skeleton, Textarea } from "@/components/ui";
import { api, downloadInvoicePdf } from "@/lib/api";
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
  gantt: "Диаграмма Ганта",
  fields: "Дополнительные поля карточек",
};

function status(b: BillingDto) {
  const s = b.subscription;
  if (b.locked) {
    const ended = date(s.status === "TRIALING" ? s.trialEndsAt : s.currentPeriodEnd);
    return `Тариф ${b.plan.name} закончился${ended ? ` ${ended}` : ""}. Данные доступны только для чтения, оплата открыта`;
  }
  if (s.status === "TRIALING" && b.plan.id !== "FREE") return `Пробный период до ${date(s.trialEndsAt)}`;
  if (b.plan.id === "FREE") return s.status === "TRIALING" ? "Пробный период закончился, действует бесплатный тариф" : "Бесплатный тариф";
  return `Оплачен до ${date(s.currentPeriodEnd)}. Автоматических списаний нет: чтобы продлить, оплатите следующий период картой`;
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

// Seats stepper: never below the active users, never above the cap.
function SeatPicker({ value, min, max, onChange }: { value: number; min: number; max: number | null; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(min, max === null ? n : Math.min(n, max));
  const btn = "grid size-8 place-items-center text-ink-faint transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-faint">Пользователей</span>
      <div className="flex h-8 items-center overflow-hidden rounded-md border border-border">
        <button type="button" aria-label="Меньше мест" className={btn} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
          <Minus size={14} />
        </button>
        <input
          aria-label="Количество пользователей"
          inputMode="numeric"
          className="h-8 w-12 border-x border-border bg-transparent text-center text-sm outline-none"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
        />
        <button type="button" aria-label="Больше мест" className={btn} disabled={max !== null && value >= max} onClick={() => onChange(clamp(value + 1))}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// Company details for a bank-transfer invoice. Prefilled from the last request.
function InvoiceDialog({ plan, interval, seats, initial, pdfReady, onClose, onDone }: { plan: PlanDto; interval: BillingInterval; seats: number; initial: InvoicePayer | null; pdfReady: boolean; onClose: () => void; onDone: () => void }) {
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
  const amount = planAmount(plan, seats, interval);
  return (
    <Dialog
      title="Оплата по счёту"
      description={`Тариф ${plan.name}, ${seats} польз., ${interval === "YEAR" ? "год" : "месяц"} — ${formatRub(amount)}`}
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
            const { id, invoiceNumber, pdf } = await api.requestInvoice({ planId: plan.id, interval, seats, ...form, payerKpp: form.payerKpp || null });
            if (pdf) {
              await downloadInvoicePdf(id, invoiceNumber).catch(() => {});
              toast(`Счёт №${invoiceNumber} скачан и отправлен на ${form.payerEmail}`, "success");
            } else {
              toast(`Запрос счёта №${invoiceNumber} отправлен. Счёт придёт на ${form.payerEmail}`, "success");
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
        <Field label="Организация или ИП">
          {(a) => <Input {...a} autoFocus placeholder="ООО «Ромашка»" value={form.payerName} onChange={set("payerName")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ИНН">{(a) => <Input {...a} inputMode="numeric" maxLength={12} value={form.payerInn} onChange={set("payerInn")} />}</Field>
          <Field label="КПП" hint="Для ИП не нужен">
            {(a) => <Input {...a} inputMode="numeric" maxLength={9} value={form.payerKpp} onChange={set("payerKpp")} />}
          </Field>
        </div>
        <Field label="Юридический адрес">
          {(a) => <Textarea {...a} className="min-h-[64px]" value={form.payerAddress} onChange={set("payerAddress")} />}
        </Field>
        <Field label="Почта для счёта и закрывающих документов">
          {(a) => <Input {...a} type="email" value={form.payerEmail} onChange={set("payerEmail")} />}
        </Field>
        <p className="text-sm text-ink-faint">
          {pdfReady ? "Счёт сразу скачается в PDF и придёт на эту почту." : "Пришлём счёт на эту почту."} Тариф включится, когда оплата поступит на счёт — обычно 1–3 рабочих дня. Пока ждём оплату, пространство работает как сейчас.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy}>
            Запросить счёт
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
  const monthly = interval === "YEAR" ? (plan.priceKopecks * 10) / 12 : plan.priceKopecks;
  const features = [
    `Пользователей: ${limit(plan.maxUsers)}`,
    `Проектов: ${limit(plan.maxProjects)}`,
    `Повторяющихся задач: ${limit(plan.maxRecurring)}`,
    plan.storageMbPerSeat ? `Файлы: ${storage(plan.storageMbPerSeat)} на оплаченное место` : `Файлы: ${storage(plan.storageMbBase)}`,
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
          {tooSmall
            ? `Тариф рассчитан на ${plan.maxUsers} польз., а активных уже ${b.usage.users}`
            : `К оплате ${formatRub(planAmount(plan, seats, interval))} за ${interval === "YEAR" ? "год" : "месяц"} (${seats} польз.)`}
        </p>
      )}
      <div className="mt-3">
        {plan.priceKopecks === 0 ? (
          <Button disabled className="w-full">{current ? "Текущий тариф" : "Бесплатный"}</Button>
        ) : (
          <div className="space-y-1.5">
            <Button variant="primary" className="w-full" disabled={!canPay || tooSmall} loading={busy} onClick={onPick}>
              {same ? "Продлить картой" : current ? "Изменить и оплатить картой" : "Оплатить картой"}
            </Button>
            <Button variant="ghost" className="w-full" disabled={!canPay || tooSmall} onClick={onInvoice}>
              Оплатить по счёту
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
    toast(paid === "1" ? "Оплата получена, тариф обновится через несколько секунд" : "Оплата не прошла. Попробуйте ещё раз", paid === "1" ? "success" : "error");
    const timers = [2000, 5000, 10000].map((ms) => setTimeout(load, ms));
    return () => timers.forEach(clearTimeout);
  }, [paid, load]);

  async function pick(plan: PlanDto) {
    setBusy(plan.id);
    try {
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
      <Card title={b.locked ? `Тариф ${b.plan.name} закончился` : `Тариф ${b.plan.name}`} description={status(b)} action={
        canLeaveForFree ? (
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await api.switchToFree();
                toast("Включён бесплатный тариф", "success");
                load();
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            Перейти на бесплатный
          </Button>
        ) : undefined
      }>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Usage label={b.subscription.seats != null && !trial ? "Пользователи (оплачено мест)" : "Пользователи"} used={b.usage.users} max={b.seatLimit} />
            {trial && <p className="mt-1 text-xs text-ink-faint">В пробный период — без ограничений. После оплаты — столько, сколько мест оплачено.</p>}
            {!trial && b.usage.invitations > 0 && <p className="mt-1 text-xs text-ink-faint">Ещё {b.usage.invitations} в приглашениях — они тоже занимают места.</p>}
          </div>
          <Usage label="Проекты" used={b.usage.projects} max={b.plan.maxProjects} />
          <Usage label="Повторяющиеся задачи" used={b.usage.recurring} max={b.plan.maxRecurring} />
          <div>
            <Usage label="Файлы" used={b.usage.storageMb} max={b.storageLimitMb} unit={(n) => storage(Math.round(n))} />
            {b.plan.storageMbPerSeat > 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                {b.subscription.seats != null && !trial
                  ? `${storage(b.plan.storageMbPerSeat)} за каждое оплаченное место`
                  : `${storage(b.plan.storageMbPerSeat)} на каждого активного пользователя`}
              </p>
            )}
          </div>
        </div>
        {b.testMode && (
          <p className="mt-4 text-sm text-ink-faint">Платежи идут через тестовый режим: реальные деньги не списываются.</p>
        )}
      </Card>

      <Card title="Выбрать тариф" description="Цена — за каждое оплаченное место. Пользователей и места для файлов доступно столько, сколько оплачено мест. Год стоит как 10 месяцев." action={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <SeatPicker value={seatCount} min={minSeats} max={maxSeats === 0 ? null : maxSeats} onChange={setSeats} />
          <Segmented label="Период оплаты" value={interval} onChange={setInterval_} options={[{ value: "MONTH", label: "Месяц" }, { value: "YEAR", label: "Год" }]} />
        </div>
      }>
        {!canPay && <p className="mb-3 text-sm text-ink-faint">Менять тариф может администратор или сотрудник с правом «Управлять тарифом и оплатой».</p>}
        <div className="grid gap-4 md:grid-cols-3">
          {b.plans.map((p) => (
            <PlanCard key={p.id} plan={p} b={b} interval={interval} seats={seatCount} canPay={canPay} busy={busy === p.id} onPick={() => pick(p)} onInvoice={() => setInvoiceFor(p)} />
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-faint">Оплата разовая: картой сразу или по счёту для юрлиц и ИП. Продление с тем же тарифом, периодом и числом мест добавляет период к текущему; любое изменение начинает новый период с сегодняшнего дня. После окончания периода есть 3 дня, затем пространство переходит в режим чтения до оплаты. При превышении лимитов существующие данные остаются, новые записи создать нельзя.</p>
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
                    <div className="text-xs text-ink-faint">{p.method === "INVOICE" ? `Счёт №${p.invoiceNumber}${p.payerName ? `, ${p.payerName}` : ""}` : "Картой"}</div>
                  </td>
                  <td className="px-4 py-2">{formatRub(p.amount)}</td>
                  <td className="px-4 py-2">
                    {p.status === "PAID"
                      ? "Оплачен"
                      : p.status === "FAILED"
                        ? p.method === "INVOICE"
                          ? p.failReason ?? "Отменён"
                          : "Не прошёл"
                        : p.method === "INVOICE"
                          ? "Ждём оплату по счёту"
                          : "Ожидает оплаты"}
                    {p.method === "INVOICE" && p.status !== "FAILED" && b.invoicePdf && canPay && (
                      <button
                        className="ml-2 text-xs text-ink-faint underline hover:text-ink"
                        onClick={() => downloadInvoicePdf(p.id, p.invoiceNumber!).catch((e) => toast((e as Error).message, "error"))}
                      >
                        PDF
                      </button>
                    )}
                    {p.method === "INVOICE" && p.status === "PENDING" && canPay && (
                      <button
                        className="ml-2 text-xs text-ink-faint underline hover:text-ink"
                        onClick={async () => {
                          try {
                            await api.cancelInvoice(p.id);
                            toast("Запрос счёта отменён", "success");
                            load();
                          } catch (e) {
                            toast((e as Error).message, "error");
                          }
                        }}
                      >
                        Отменить
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
      <PageHeader title="Настройки" meta={<SettingsTabs />} />
      <div className="w-full space-y-4 py-6">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <BillingView />
        </Suspense>
      </div>
    </AppShell>
  );
}
