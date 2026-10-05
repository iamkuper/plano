"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { formatRub, type Locale, type PlanDto } from "@plano/shared";
import { Segmented } from "@/components/ui";
import { goal } from "@/lib/analytics";
import { API_URL } from "@/lib/api";
import { appPath, makeTr, priceLabel, type Tr } from "@/lib/marketing";

const features = (tr: Tr): Record<string, string> => ({
  time: tr("settings.billing.timeTrackingAndReports"),
  roles: tr("settings.billing.customRolesAndPermissions"),
  audit: tr("settings.billing.activityLog"),
  export: tr("mk.pricingTable.csvExport"),
  gantt: tr("settings.billing.ganttChart"),
  fields: tr("mk.pricingTable.customCardFields"),
  agents: tr("settings.billing.aiAgents"),
});
const pitch = (tr: Tr): Record<string, string> => ({
  FREE: tr("mk.pricingTable.tryItWithASmall"),
  PRO: tr("mk.pricingTable.forATeamThatWorks"),
  BUSINESS: tr("mk.pricingTable.deadlinesDependenciesAndControl"),
});
const limit = (tr: Tr, n: number | null, word: string) => (n === null ? tr("mk.pricingTable.unlimited", { word }) : tr("mk.pricingTable.upTo", { word, n }));
const gb = (tr: Tr, mb: number) => tr("mk.pricingTable.gb", { round: Math.round(mb / 1024) });

// Public plans, read from the API so the page always matches billing.
export function PricingTable({ initial, locale = "ru" }: { initial?: { plans: PlanDto[]; trialDays: number } | null; locale?: Locale }) {
  const tr = makeTr(locale);
  const FEATURES = features(tr);
  const PITCH = pitch(tr);
  const [plans, setPlans] = useState<PlanDto[] | null>(initial?.plans ?? null);
  const [trialDays, setTrialDays] = useState(initial?.trialDays ?? 14);
  const [interval, setInterval_] = useState<"MONTH" | "YEAR">("MONTH");

  useEffect(() => {
    if (initial) return; // rendered on the server already
    fetch(`${API_URL}/billing/plans`)
      .then((r) => r.json())
      .then((d: { plans: PlanDto[]; trialDays: number }) => {
        setPlans(d.plans);
        setTrialDays(d.trialDays);
      })
      .catch(() => setPlans([]));
  }, [initial]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <Segmented
          label={tr("settings.billing.billingPeriod")}
          value={interval}
          onChange={setInterval_}
          options={[
            { value: "MONTH", label: tr("mk.pricingTable.monthly") },
            { value: "YEAR", label: tr("mk.pricingTable.yearly2MonthsFree") },
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
                {p.id === "PRO" && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">{tr("mk.pricingTable.popular")}</span>}
              </div>
              <p className="mt-1 text-sm text-ink-faint">{PITCH[p.id]}</p>
              <p className="mt-5 text-3xl font-semibold">
                {priceLabel(locale, p, interval, formatRub)}
              </p>
              <p className="text-sm text-ink-faint">{p.priceKopecks ? tr("settings.billing.perUserPerMonth") : tr("mk.pricingTable.freeForever")}</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {[
                  limit(tr, p.maxUsers, tr("platform.users2")),
                  limit(tr, p.maxProjects, tr("reports.time.projects")),
                  p.storageMbPerSeat ? tr("mk.pricingTable.ofFileStoragePerUser", { gb: gb(tr, p.storageMbPerSeat) }) : tr("mk.pricingTable.ofFileStorage", { gb: gb(tr, p.storageMbBase) }),
                  tr("mk.pricingTable.boardsListsTableAndCalendar"),
                  tr("mk.pricingTable.templatesAndRecurringTasks"),
                  ...p.features.map((f) => FEATURES[f]).filter(Boolean),
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={appPath(locale, "/register")}
                onClick={() => goal("pricing_cta", { plan: p.id })}
                className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium ${
                  p.id === "PRO" ? "bg-accent text-white hover:bg-accent-hover" : "border border-border hover:bg-surface-soft"
                }`}
              >
                {p.priceKopecks ? tr("mk.pricingTable.tryFreeForDays", { trialDays }) : tr("mk.pricingTable.getStartedFree")}
              </Link>
            </div>
          ),
        )}
      </div>
      <p className="mt-6 text-center text-sm text-ink-faint">{tr("mk.pricingTable.agentsNote")}</p>
      <p className="mt-2 text-center text-sm text-ink-faint">
        
        {tr("mk.pricingTable.theTrialNeedsNoCard")}
      </p>
    </div>
  );
}
