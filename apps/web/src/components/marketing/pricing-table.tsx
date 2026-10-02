"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { formatRub, YEAR_MONTHS_CHARGED, type PlanDto } from "@amo-kanban/shared";
import { Segmented } from "@/components/ui";
import { goal } from "@/lib/analytics";
import { API_URL } from "@/lib/api";

const FEATURES: Record<string, string> = {
  time: "Учёт времени и отчёты",
  roles: "Свои роли и права",
  audit: "Журнал действий",
  export: "Экспорт в CSV",
  gantt: "Диаграмма Ганта",
  fields: "Свои поля в карточках",
};
const PITCH: Record<string, string> = {
  FREE: "Попробовать с небольшой командой",
  PRO: "Для команды, которая работает каждый день",
  BUSINESS: "Сроки, зависимости и контроль",
};
const limit = (n: number | null, word: string) => (n === null ? `${word} без ограничений` : `${word}: до ${n}`);
const gb = (mb: number) => `${Math.round(mb / 1024)} ГБ`;

// Public plans, read from the API so the page always matches billing.
export function PricingTable() {
  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  const [trialDays, setTrialDays] = useState(14);
  const [interval, setInterval_] = useState<"MONTH" | "YEAR">("MONTH");

  useEffect(() => {
    fetch(`${API_URL}/billing/plans`)
      .then((r) => r.json())
      .then((d: { plans: PlanDto[]; trialDays: number }) => {
        setPlans(d.plans);
        setTrialDays(d.trialDays);
      })
      .catch(() => setPlans([]));
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <Segmented
          label="Период оплаты"
          value={interval}
          onChange={setInterval_}
          options={[
            { value: "MONTH", label: "Помесячно" },
            { value: "YEAR", label: "За год — 2 месяца в подарок" },
          ]}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? Array.from({ length: 3 }, () => null)).map((p, i) =>
          !p ? (
            <div key={i} className="h-[420px] animate-pulse rounded-xl bg-surface-soft" />
          ) : (
            <div key={p.id} className={`flex flex-col rounded-xl border bg-surface p-6 ${p.id === "PRO" ? "border-accent shadow-raised" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.id === "PRO" && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">Популярный</span>}
              </div>
              <p className="mt-1 text-sm text-ink-faint">{PITCH[p.id]}</p>
              <p className="mt-5 text-3xl font-semibold">
                {p.priceKopecks ? formatRub(Math.round(interval === "YEAR" ? (p.priceKopecks * YEAR_MONTHS_CHARGED) / 12 : p.priceKopecks)) : "0 ₽"}
              </p>
              <p className="text-sm text-ink-faint">{p.priceKopecks ? "за пользователя в месяц" : "бесплатно, навсегда"}</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {[
                  limit(p.maxUsers, "Пользователей"),
                  limit(p.maxProjects, "Проектов"),
                  p.storageMbPerSeat ? `${gb(p.storageMbPerSeat)} для файлов на пользователя` : `${gb(p.storageMbBase)} для файлов`,
                  "Доски, списки, таблица и календарь",
                  "Шаблоны и повторяющиеся задачи",
                  ...p.features.map((f) => FEATURES[f]).filter(Boolean),
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                onClick={() => goal("pricing_cta", { plan: p.id })}
                className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium ${
                  p.id === "PRO" ? "bg-accent text-white hover:bg-accent-hover" : "border border-border hover:bg-surface-soft"
                }`}
              >
                {p.priceKopecks ? `Попробовать ${trialDays} дней бесплатно` : "Начать бесплатно"}
              </Link>
            </div>
          ),
        )}
      </div>
      <p className="mt-6 text-center text-sm text-ink-faint">
        Пробный период — без карты. Оплата картой или по счёту для юрлиц и ИП. Автоматических списаний нет.
      </p>
    </div>
  );
}
