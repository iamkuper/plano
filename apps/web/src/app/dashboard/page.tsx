"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import { cardKey, type CardTileDto, type TeamBoardColumnDto, type TeamStageCountDto, type UserDto, type UserRefDto, t, intlTag } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { Avatar, LetterMark } from "@/components/avatar";
import { CardModal } from "@/components/card-modal";
import { Onboarding } from "@/components/onboarding";
import { HomeTabs } from "@/components/tab-links";
import { Card, EmptyState, Kpi, PageHeader, ShareBar, Skeleton } from "@/components/ui";
import { columnColor, stageColor } from "@/design/tokens";
import { api } from "@/lib/api";
import { useDebounced, useRealtime } from "@/lib/realtime";
import { useCardParam } from "@/lib/use-card-param";

interface TimeEntry {
  id: string;
  minutes: number;
  date: string;
  user: UserRefDto;
  card: { id: string; number: number; title: string; project: { id: string; title: string } };
}

type Task = CardTileDto & { stage: string; stageIndex: number; stageColor: string | null };
type Bucket = "overdue" | "today" | "week" | "later";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function weekRange(): [string, string] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [iso(monday), iso(sunday)];
}

function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t("common.min", { m });
  return m ? t("common.hMin", { h, m }) : t("common.h", { h });
}

function bucketOf(due: string | null, [, sunday]: [string, string]): Bucket {
  if (!due) return "later";
  const day = due.slice(0, 10);
  const today = iso(new Date());
  if (day < today) return "overdue";
  if (day === today) return "today";
  return day <= sunday ? "week" : "later";
}

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "overdue", label: t("common.overdue") },
  { key: "today", label: t("common.today") },
  { key: "week", label: t("dashboard.thisWeek") },
  { key: "later", label: t("dashboard.laterAndNoDueDate") },
];

const dueLabel = (due: string) => new Date(due).toLocaleDateString(intlTag(), { day: "numeric", month: "short" });

// Open tasks of one person, flattened from the team board. The last column is "done".
function openTasks(columns: TeamBoardColumnDto[]): Task[] {
  return columns
    .slice(0, -1)
    .flatMap((c, i) => c.cards.map((card) => ({ ...card, stage: c.title, stageIndex: i, stageColor: c.color })));
}

function TaskRow({ task, total, bucket, onOpen }: { task: Task; total: number; bucket: Bucket; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto_72px] items-center gap-3 border-b border-border px-4 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-surface-soft"
    >
      <span className="text-ink-ghost">{cardKey(task)}</span>
      <span className="min-w-0">
        <span className="block truncate text-base">{task.title}</span>
        <span className="block truncate text-xs text-ink-faint">{task.project.title}</span>
      </span>
      <span className="flex items-center gap-1.5 text-xs text-ink-faint">
        <span className="size-2 rounded-full" style={{ background: columnColor(task.stageColor, task.stageIndex, total) }} />
        {task.stage}
      </span>
      <span className={`text-right text-xs ${bucket === "overdue" ? "font-medium text-danger" : "text-ink-faint"}`}>
        {task.dueDate ? dueLabel(task.dueDate) : "—"}
      </span>
    </button>
  );
}

function Dashboard() {
  const [me, setMe] = useState<UserDto | null>(null);
  const [mine, setMine] = useState<TeamBoardColumnDto[] | null>(null);
  const [team, setTeam] = useState<TeamStageCountDto[] | null>(null);
  const [time, setTime] = useState<TimeEntry[] | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [cardId, setCardId] = useCardParam();
  const week = useMemo(weekRange, []);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
    api.projects("ACTIVE").then((list) => setProjectIds(list.map((p) => p.id))).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!me) return;
    api.teamBoard(me.id).then(setMine).catch(() => setMine([]));
    api.teamSummary().then(setTeam).catch(() => setTeam([]));
    api.timeReport(week[0], week[1]).then((r) => setTime(r as TimeEntry[])).catch(() => setTime([]));
  }, [me, week]);
  useEffect(load, [load]);

  const refresh = useDebounced(load, 400);
  useRealtime(projectIds.map((id) => `project:${id}`), { "board:changed": refresh });

  const tasks = useMemo(() => (mine ? openTasks(mine) : []), [mine]);
  const grouped = useMemo(() => {
    const map = new Map<Bucket, Task[]>(BUCKETS.map((b) => [b.key, []]));
    for (const t of tasks) map.get(bucketOf(t.dueDate, week))!.push(t);
    for (const list of map.values()) list.sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
    return map;
  }, [tasks, week]);

  const myMinutes = (time ?? []).filter((e) => e.user.id === me?.id).reduce((n, e) => n + e.minutes, 0);
  const teamMinutes = (time ?? []).reduce((n, e) => n + e.minutes, 0);
  const byPerson = useMemo(() => {
    const map = new Map<string, { user: UserRefDto; minutes: number }>();
    for (const e of time ?? []) {
      const p = map.get(e.user.id) ?? { user: e.user, minutes: 0 };
      p.minutes += e.minutes;
      map.set(e.user.id, p);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [time]);

  // Open cards per stage across all active projects.
  const stages = useMemo(() => (team ?? []).map((c) => ({ title: c.title, color: c.color, count: c.count })), [team]);
  const teamOpen = stages.slice(0, -1).reduce((n, s) => n + s.count, 0);
  const stageMax = Math.max(1, ...stages.map((s) => s.count));

  const loading = !mine || !time || !team;
  const overdue = grouped.get("overdue")!.length;
  const columnsTotal = mine?.length ?? 1;

  return (
    <>
      <PageHeader title={t("common.home")} meta={<HomeTabs />} subtitle={me ? t("dashboard.hello", { value: me.name.split(" ")[0] }) : undefined} />
      <div className="space-y-4 py-5">
        <Onboarding />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label={t("dashboard.myOpenTasks")} value={loading ? "…" : tasks.length} />
          <Kpi label={t("common.overdue")} value={loading ? "…" : overdue} tone={overdue ? "danger" : undefined} />
          <Kpi label={t("dashboard.dueThisWeek")} value={loading ? "…" : grouped.get("today")!.length + grouped.get("week")!.length} />
          <Kpi label={t("dashboard.myTime")} value={loading ? "…" : formatHours(myMinutes)} hint={t("dashboard.thisWeek2")} />
          <Kpi label={t("dashboard.teamTime")} value={loading ? "…" : formatHours(teamMinutes)} hint={t("dashboard.thisWeek2")} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card
            title={t("dashboard.myTasks")}
            action={
              <Link href="/team?mine=1" className="text-sm text-ink-faint hover:text-ink">
                
                {t("dashboard.board")}
              </Link>
            }
            bodyClassName="pt-3"
          >
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <EmptyState icon={CheckCircle2} title={t("dashboard.noOpenTasks")}>
                
                {t("dashboard.cardsWhereYouAreAn")}
              </EmptyState>
            ) : (
              BUCKETS.map(({ key, label }) => {
                const list = grouped.get(key)!;
                if (!list.length) return null;
                return (
                  <div key={key}>
                    <div
                      className={`flex h-8 items-center gap-1.5 border-y border-border bg-surface-soft px-4 text-xs font-medium ${key === "overdue" ? "text-danger" : "text-ink-faint"}`}
                    >
                      {key === "overdue" ? <AlertTriangle size={12} /> : key !== "later" ? <CalendarDays size={12} /> : null}
                      {label}
                      <span className="font-normal text-ink-ghost">{list.length}</span>
                    </div>
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} total={columnsTotal} bucket={key} onOpen={() => setCardId(t.id)} />
                    ))}
                  </div>
                );
              })
            )}
          </Card>

          <div className="space-y-4">
            <Card
              title={t("dashboard.timeThisWeek")}
              action={
                <Link href="/reports/time" className="text-sm text-ink-faint hover:text-ink">
                  
                  {t("dashboard.report")}
                </Link>
              }
            >
              {loading ? (
                <Skeleton className="h-24" />
              ) : byPerson.length === 0 ? (
                <p className="text-sm text-ink-faint">{t("dashboard.noTimeHasBeenLogged")}</p>
              ) : (
                <div className="space-y-2.5">
                  {byPerson.map((p) => (
                    <div key={p.user.id} className="grid grid-cols-[minmax(0,1fr)_88px_64px] items-center gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar user={p.user} size={20} />
                        <span className="truncate">{p.user.name}</span>
                      </span>
                      <ShareBar value={teamMinutes ? p.minutes / teamMinutes : 0} />
                      <span className="text-right text-ink-faint">{formatHours(p.minutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title={t("dashboard.teamByStage")}
              description={loading ? undefined : t("dashboard.openCardsInActiveProjects", { teamOpen })}
              action={
                <Link href="/team" className="text-sm text-ink-faint hover:text-ink">
                  
                  {t("dashboard.all")}
                </Link>
              }
            >
              {loading ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="space-y-2">
                  {stages.map((s, i) => (
                    <div key={s.title} className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-center gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: columnColor(s.color, i, stages.length) }} />
                        <span className="truncate">{s.title}</span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                        <span className="block h-full rounded-full" style={{ width: `${(s.count / stageMax) * 100}%`, background: columnColor(s.color, i, stages.length) }} />
                      </span>
                      <span className="text-right text-ink-faint">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {time && time.length > 0 && (
              <Card title={t("dashboard.recentTimeEntries")}>
                <div className="-mx-4 -mb-4">
                  {[...time]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 5)
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setCardId(e.card.id)}
                        className="flex w-full items-center gap-2 border-t border-border px-4 py-2 text-left text-sm hover:bg-surface-soft"
                      >
                        <LetterMark name={e.card.project.title} size={16} />
                        <span className="min-w-0 flex-1 truncate">{e.card.title}</span>
                        <Avatar user={e.user} size={18} />
                        <span className="w-14 text-right text-ink-faint">{formatHours(e.minutes)}</span>
                      </button>
                    ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
      {cardId && (
        <CardModal
          key={cardId}
          cardId={cardId}
          onClose={(changed) => {
            setCardId(null);
            if (changed) load();
          }}
        />
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense>
        <Dashboard />
      </Suspense>
    </AppShell>
  );
}
