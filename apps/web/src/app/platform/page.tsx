"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRub, t, intlTag } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { Button, Dialog, Field, Input, Kpi, PageHeader, Panel, Select, Segmented, td, th, tr, TableSkeleton } from "@/components/ui";
import { api, type PlatformState, type PlatformStats, type PlatformWorkspaceDetail, type PlatformWorkspaceRow } from "@/lib/api";
import { toast } from "@/lib/toast";

const STATE_LABELS: Record<PlatformState, string> = { trial: t("platform.trial"), paid: t("common.paid"), free: "Free", locked: t("platform.locked"), past_due: t("platform.pastDue") };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(intlTag(), { day: "numeric", month: "short", year: "numeric" }) : "—");
const mb = (bytes: number) => t("platform.mb", { round: Math.round(bytes / 1024 / 1024) });

function WorkspaceDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [w, setW] = useState<PlatformWorkspaceDetail | null>(null);
  const [planId, setPlanId] = useState("PRO");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.platformWorkspace(id).then(setW).catch((e) => toast((e as Error).message, "error"));
  }, [id]);

  async function act(action: "grant" | "extend-trial" | "lock" | "free") {
    setBusy(true);
    try {
      setW(await api.platformChangeSubscription(id, { action, ...(action === "grant" ? { planId } : {}), ...(action === "grant" || action === "extend-trial" ? { days: Number(days) } : {}) }));
      toast(t("common.done"), "success");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={w ? w.name : t("common.loading")} description={w ? t("platform.created", { day: day(w.createdAt), value: STATE_LABELS[w.state] }) : undefined} onClose={onClose}>
      {w && (
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-ink-faint">{t("platform.projectsCards")}</div>
              {w._count.projects} / {w._count.cards}
            </div>
            <div>
              <div className="text-ink-faint">{t("common.files")}</div>
              {mb(w.storageBytes)}
            </div>
            <div>
              <div className="text-ink-faint">{t("common.plan")}</div>
              {w.subscription?.planId ?? "FREE"}{t("platform.until")} {day(w.subscription?.trialEndsAt ?? w.subscription?.currentPeriodEnd ?? null)}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">{t("platform.subscription")}</h3>
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t("common.plan")}>
                {(a) => (
                  <Select {...a} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                    <option value="PRO">Pro</option>
                    <option value="BUSINESS">Business</option>
                  </Select>
                )}
              </Field>
              <Field label={t("platform.days")}>{(a) => <Input {...a} className="w-20" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />}</Field>
              <Button variant="primary" loading={busy} onClick={() => act("grant")}>
                
                {t("platform.grantPlan")}
              </Button>
              <Button loading={busy} onClick={() => act("extend-trial")}>
                
                {t("platform.extendTrial")}
              </Button>
              <Button loading={busy} onClick={() => act("free")}>
                
                {t("platform.moveToFree")}
              </Button>
              <Button variant="danger" loading={busy} onClick={() => act("lock")}>
                
                {t("platform.lock")}
              </Button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">{t("platform.staff", { users: w.users.length })}</h3>
            <ul className="divide-y divide-border text-sm">
              {w.users.map((u) => (
                <li key={u.id} className="flex justify-between py-1.5">
                  <span>
                    {u.name} <span className="text-ink-faint">{u.email}</span>
                  </span>
                  <span className="text-ink-faint">
                    {u.role === "ADMIN" ? t("platform.admin") : t("platform.member")}
                    {u.isActive ? "" : t("platform.deactivated")}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">{t("common.payments")}</h3>
            {w.payments.length === 0 ? (
              <p className="text-sm text-ink-faint">{t("platform.noPaymentsYet")}</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {w.payments.map((p) => (
                  <li key={p.id} className="flex justify-between py-1.5">
                    <span> {t("platform.users", { day: day(p.paidAt ?? p.createdAt), planId: p.planId, seats: p.seats, value: p.kind === "RENEWAL" ? t("common.renewalSuffix") : "" })} </span>
                    <span>
                      {formatRub(p.amount)} <span className="text-ink-faint">{p.status === "PAID" ? t("platform.paid") : p.status === "FAILED" ? t("platform.failed") : t("platform.pending")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">{t("platform.recentActions")}</h3>
            <ul className="divide-y divide-border text-sm">
              {w.auditLog.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-1.5">
                  <span>{e.summary}</span>
                  <span className="shrink-0 text-ink-faint">{day(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// Hidden back-office. There is no link to it; the API answers 404 to anyone
// not listed in PLATFORM_ADMIN_EMAILS, and so does this page.
export default function PlatformPage() {
  const router = useRouter();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [rows, setRows] = useState<PlatformWorkspaceRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    (cursor?: string) =>
      api
        .platformWorkspaces({ q, state, cursor })
        .then((r) => {
          setRows((prev) => (cursor && prev ? [...prev, ...r.items] : r.items));
          setNext(r.next);
        })
        .catch(() => router.replace("/dashboard")),
    [q, state, router],
  );

  useEffect(() => {
    api.platformStats().then(setStats).catch(() => router.replace("/dashboard"));
  }, [router]);
  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  if (!stats) return <AppShell><TableSkeleton /></AppShell>;

  return (
    <AppShell>
      <PageHeader title={t("platform.platform")} subtitle={t("platform.internalSection")} />
      <div className="space-y-4 py-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Kpi label={t("platform.companies")} value={stats.workspaces} hint={t("platform.thisWeekThisMonth", { newWorkspaces7d: stats.newWorkspaces7d, newWorkspaces30d: stats.newWorkspaces30d })} />
          <Kpi label={t("platform.users2")} value={stats.users} />
          <Kpi label={t("platform.paying")} value={stats.states.paid + stats.states.past_due} hint={t("platform.onTrialOnFree", { trial: stats.states.trial, free: stats.states.free })} />
          <Kpi label={t("platform.locked2")} value={stats.states.locked} tone={stats.states.locked ? "danger" : undefined} />
          <Kpi label="MRR" value={formatRub(stats.mrrKopecks)} hint={t("platform.receivedIn30Days", { formatRub: formatRub(stats.paid30dKopecks) })} />
          <Kpi label={t("platform.failedPayments")} value={stats.failedPayments7d} hint={t("platform.thisWeek")} tone={stats.failedPayments7d ? "danger" : undefined} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input className="w-64" placeholder={t("platform.nameOrEmail")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented
            label={t("platform.status")}
            value={state}
            onChange={setState}
            options={[{ value: "", label: t("common.all") }, ...(Object.keys(STATE_LABELS) as PlatformState[]).map((s) => ({ value: s, label: STATE_LABELS[s] }))]}
          />
        </div>

        {!rows ? (
          <TableSkeleton />
        ) : (
          <Panel className="overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>{t("platform.company")}</th>
                  <th className={th}>{t("platform.owner")}</th>
                  <th className={th}>{t("platform.users3")}</th>
                  <th className={th}>{t("platform.projectsCards2")}</th>
                  <th className={th}>{t("platform.status")}</th>
                  <th className={th}>{t("platform.until2")}</th>
                  <th className={th}>{t("common.created")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className={`${tr} cursor-pointer`} onClick={() => setOpen(w.id)}>
                    <td className={`${td} font-medium`}>{w.name}</td>
                    <td className={`${td} text-ink-faint`}>{w.owner?.email ?? "—"}</td>
                    <td className={td}>{w.users}</td>
                    <td className={td}>
                      {w.projects} / {w.cards}
                    </td>
                    <td className={td}>
                      {STATE_LABELS[w.state]}
                      {w.state === "paid" || w.state === "past_due" || w.state === "locked" ? `, ${w.planId}` : ""}
                    </td>
                    <td className={`${td} text-ink-faint`}>{day(w.trialEndsAt ?? w.currentPeriodEnd)}</td>
                    <td className={`${td} text-ink-faint`}>{day(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-faint">{t("common.nothingFound")}</p>}
          </Panel>
        )}
        {next && (
          <div className="flex justify-center">
            <Button onClick={() => load(next)}>{t("common.showMore")}</Button>
          </div>
        )}
      </div>
      {open && <WorkspaceDialog id={open} onClose={() => setOpen(null)} onChanged={() => load()} />}
    </AppShell>
  );
}
