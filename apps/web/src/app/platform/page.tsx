"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRub } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { Button, Dialog, Field, Input, Kpi, PageHeader, Panel, Select, Segmented, td, th, tr, TableSkeleton } from "@/components/ui";
import { api, type PlatformState, type PlatformStats, type PlatformWorkspaceDetail, type PlatformWorkspaceRow } from "@/lib/api";
import { toast } from "@/lib/toast";

const STATE_LABELS: Record<PlatformState, string> = { trial: "Пробный", paid: "Оплачен", free: "Free", locked: "Заблокирован", past_due: "Долг" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—");
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} МБ`;

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
      toast("Готово", "success");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={w ? w.name : "Загрузка…"} description={w ? `Создано ${day(w.createdAt)}, ${STATE_LABELS[w.state]}` : undefined} onClose={onClose}>
      {w && (
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-ink-faint">Проектов / карточек</div>
              {w._count.projects} / {w._count.cards}
            </div>
            <div>
              <div className="text-ink-faint">Файлы</div>
              {mb(w.storageBytes)}
            </div>
            <div>
              <div className="text-ink-faint">Тариф</div>
              {w.subscription?.planId ?? "FREE"}, до {day(w.subscription?.trialEndsAt ?? w.subscription?.currentPeriodEnd ?? null)}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Подписка</h3>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Тариф">
                {(a) => (
                  <Select {...a} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                    <option value="PRO">Pro</option>
                    <option value="BUSINESS">Business</option>
                  </Select>
                )}
              </Field>
              <Field label="Дней">{(a) => <Input {...a} className="w-20" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />}</Field>
              <Button variant="primary" loading={busy} onClick={() => act("grant")}>
                Выдать тариф
              </Button>
              <Button loading={busy} onClick={() => act("extend-trial")}>
                Продлить пробный
              </Button>
              <Button loading={busy} onClick={() => act("free")}>
                На Free
              </Button>
              <Button variant="danger" loading={busy} onClick={() => act("lock")}>
                Заблокировать
              </Button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Сотрудники ({w.users.length})</h3>
            <ul className="divide-y divide-border text-sm">
              {w.users.map((u) => (
                <li key={u.id} className="flex justify-between py-1.5">
                  <span>
                    {u.name} <span className="text-ink-faint">{u.email}</span>
                  </span>
                  <span className="text-ink-faint">
                    {u.role === "ADMIN" ? "админ" : "участник"}
                    {u.isActive ? "" : ", отключён"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Платежи</h3>
            {w.payments.length === 0 ? (
              <p className="text-sm text-ink-faint">Платежей не было</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {w.payments.map((p) => (
                  <li key={p.id} className="flex justify-between py-1.5">
                    <span>
                      {day(p.paidAt ?? p.createdAt)}, {p.planId}, {p.seats} польз.{p.kind === "RENEWAL" ? ", продление" : ""}
                    </span>
                    <span>
                      {formatRub(p.amount)} <span className="text-ink-faint">{p.status === "PAID" ? "оплачен" : p.status === "FAILED" ? "не прошёл" : "ожидает"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Последние действия</h3>
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
      <PageHeader title="Платформа" subtitle="Служебный раздел" />
      <div className="space-y-4 py-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Kpi label="Компаний" value={stats.workspaces} hint={`+${stats.newWorkspaces7d} за неделю, +${stats.newWorkspaces30d} за месяц`} />
          <Kpi label="Пользователей" value={stats.users} />
          <Kpi label="Платят" value={stats.states.paid + stats.states.past_due} hint={`на пробном ${stats.states.trial}, Free ${stats.states.free}`} />
          <Kpi label="Заблокировано" value={stats.states.locked} tone={stats.states.locked ? "danger" : undefined} />
          <Kpi label="MRR" value={formatRub(stats.mrrKopecks)} hint={`за 30 дней получено ${formatRub(stats.paid30dKopecks)}`} />
          <Kpi label="Неудачных платежей" value={stats.failedPayments7d} hint="за неделю" tone={stats.failedPayments7d ? "danger" : undefined} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input className="w-64" placeholder="Название или почта" aria-label="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented
            label="Состояние"
            value={state}
            onChange={setState}
            options={[{ value: "", label: "Все" }, ...(Object.keys(STATE_LABELS) as PlatformState[]).map((s) => ({ value: s, label: STATE_LABELS[s] }))]}
          />
        </div>

        {!rows ? (
          <TableSkeleton />
        ) : (
          <Panel className="overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Компания</th>
                  <th className={th}>Владелец</th>
                  <th className={th}>Польз.</th>
                  <th className={th}>Проекты / карточки</th>
                  <th className={th}>Состояние</th>
                  <th className={th}>До</th>
                  <th className={th}>Создана</th>
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
            {rows.length === 0 && <p className="py-8 text-center text-sm text-ink-faint">Ничего не найдено</p>}
          </Panel>
        )}
        {next && (
          <div className="flex justify-center">
            <Button onClick={() => load(next)}>Показать ещё</Button>
          </div>
        )}
      </div>
      {open && <WorkspaceDialog id={open} onClose={() => setOpen(null)} onChanged={() => load()} />}
    </AppShell>
  );
}
