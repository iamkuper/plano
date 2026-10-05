"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock, Download } from "lucide-react";
import {
  cardKey,
  type TimeEntryRowDto,
  type TimeSummaryDto,
  type UserDto,
  t,
  intlTag,
} from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { HomeTabs } from "@/components/tab-links";
import { Avatar, LetterMark } from "@/components/avatar";
import {
  Button,
  EmptyState,
  Input,
  Kpi,
  PageHeader,
  Segmented,
  Select,
  ShareBar,
  TableSkeleton,
} from "@/components/ui";
import { api, downloadTimeCsv } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";

type Period = "week" | "lastWeek" | "month" | "lastMonth" | "custom";
type GroupBy = "user" | "project";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Weeks start on Monday.
function range(period: Exclude<Period, "custom">): [string, string] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (period === "week") {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [iso(monday), iso(sunday)];
  }
  if (period === "lastWeek") {
    const start = new Date(monday);
    start.setDate(monday.getDate() - 7);
    const end = new Date(monday);
    end.setDate(monday.getDate() - 1);
    return [iso(start), iso(end)];
  }
  const y = now.getFullYear();
  const m = now.getMonth() - (period === "lastMonth" ? 1 : 0);
  return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t("common.min", { m });
  return m ? t("common.hMin", { h, m }) : t("common.h", { h });
}

const shortDate = (s: string) =>
  new Date(s).toLocaleDateString(intlTag(), { day: "numeric", month: "short" });

// Entries of an opened group are loaded in pages.
const PAGE = 100;
interface Opened {
  items: TimeEntryRowDto[];
  total: number;
  loading: boolean;
}

export default function TimeReportPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [[from, to], setRange] = useState<[string, string]>(() =>
    range("week"),
  );
  const [groupBy, setGroupBy] = useState<GroupBy>("user");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<UserDto[]>([]);
  const [summary, setSummary] = useState<TimeSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Map<string, Opened>>(new Map());
  const allowed = useCan();
  const viewAll = allowed("time.viewAll");

  useEffect(() => {
    api
      .users()
      .then(setUsers)
      .catch(() => {});
  }, []);

  // Totals and the rows of groups come from the server; the entries of a group
  // are fetched when it is opened.
  useEffect(() => {
    if (!from || !to) return;
    setSummary(null);
    setError(null);
    setOpen(new Map());
    let live = true;
    api
      .timeSummary(from, to, groupBy, userId || undefined)
      .then((r) => live && setSummary(r))
      .catch((e) => {
        if (!live) return;
        setError(e.message);
        setSummary({ totalMinutes: 0, entries: 0, people: 0, projects: 0, groups: [] });
      });
    return () => {
      live = false;
    };
  }, [from, to, userId, groupBy]);

  async function loadEntries(key: string, offset: number) {
    setOpen((m) => new Map(m).set(key, { items: m.get(key)?.items ?? [], total: m.get(key)?.total ?? 0, loading: true }));
    try {
      const page = await api.timeEntries(from, to, { groupBy, key, userId: userId || undefined, limit: PAGE, offset });
      setOpen((m) => new Map(m).set(key, { items: [...(offset ? (m.get(key)?.items ?? []) : []), ...page.items], total: page.total, loading: false }));
    } catch (e) {
      toast((e as Error).message, "error");
      setOpen((m) => {
        const next = new Map(m);
        next.delete(key);
        return next;
      });
    }
  }

  const groups = summary?.groups ?? [];
  const total = summary?.totalMinutes ?? 0;

  const toggle = (key: string) => {
    if (open.has(key)) {
      setOpen((m) => {
        const next = new Map(m);
        next.delete(key);
        return next;
      });
    } else loadEntries(key, 0);
  };

  return (
    <AppShell>
      <PageHeader
        title={t("common.home")}
        meta={<HomeTabs />}
        actions={
          <Button
            disabled={!summary?.entries}
            onClick={() =>
              downloadTimeCsv(from, to, userId || undefined)
                .then(() => toast(t("reports.time.fileExported"), "success"))
                .catch((e) => toast((e as Error).message, "error"))
            }
          >
            <Download size={15} />  {t("reports.time.exportToExcel")}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 py-2.5">
        <Segmented<Period>
          label={t("reports.time.period")}
          value={period}
          onChange={(p) => {
            setPeriod(p);
            if (p !== "custom") setRange(range(p));
          }}
          options={[
            { value: "week", label: t("reports.time.thisWeek") },
            { value: "lastWeek", label: t("reports.time.lastWeek") },
            { value: "month", label: t("reports.time.thisMonth") },
            { value: "lastMonth", label: t("reports.time.lastMonth") },
            { value: "custom", label: t("reports.time.period") },
          ]}
        />
        {period === "custom" && (
          <div className="flex items-center gap-1.5">
            <div className="w-40">
              <Input
                type="date"
                aria-label={t("reports.time.from")}
                value={from}
                max={to}
                onChange={(e) => setRange([e.target.value, to])}
              />
            </div>
            <span className="text-ink-ghost">—</span>
            <div className="w-40">
              <Input
                type="date"
                aria-label={t("reports.time.to")}
                value={to}
                min={from}
                onChange={(e) => setRange([from, e.target.value])}
              />
            </div>
          </div>
        )}
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <Segmented<GroupBy>
          label={t("reports.time.groupBy")}
          value={groupBy}
          onChange={(g) => {
            setGroupBy(g);
            setOpen(new Map());
          }}
          options={[
            { value: "user", label: t("common.staff") },
            { value: "project", label: t("common.projects") },
          ]}
        />
        {viewAll && (
          <div className="ml-auto w-52">
            <Select
              aria-label={t("common.employee")}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">{t("reports.time.allEmployees")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-4 pb-8 pt-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={t("reports.time.total")}
            value={summary ? formatHours(total) : "…"}
            hint={`${shortDate(from)} — ${shortDate(to)}`}
          />
          <Kpi label={t("reports.time.entries")} value={summary ? String(summary.entries) : "…"} />
          <Kpi label={t("reports.time.employees")} value={summary ? String(summary.people) : "…"} />
          <Kpi label={t("reports.time.projects")} value={summary ? String(summary.projects) : "…"} />
        </div>

        {error && (
          <p className="rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        {!summary && <TableSkeleton />}
        {summary && summary.entries === 0 && !error && (
          <EmptyState icon={Clock} title={t("reports.time.noTimeWasLoggedIn")}>
            
            {t("reports.time.timeIsLoggedOnA")}
          </EmptyState>
        )}

        {groups.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            {groups.map((g) => {
              const opened = open.get(g.key);
              const expanded = !!opened;
              return (
                <div
                  key={g.key}
                  className="border-b border-border last:border-b-0"
                >
                  <button
                    onClick={() => toggle(g.key)}
                    aria-expanded={expanded}
                    className="grid w-full grid-cols-[20px_minmax(0,1fr)_160px_96px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-soft"
                  >
                    <ChevronDown
                      size={14}
                      className={`text-ink-ghost transition-transform ${expanded ? "" : "-rotate-90"}`}
                    />
                    <span className="flex min-w-0 items-center gap-2.5">
                      {g.user ? (
                        <Avatar user={g.user} size={24} />
                      ) : (
                        <LetterMark name={g.label} size={22} />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-base font-medium">
                          {g.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-ghost"> {t("reports.time.entries2", { entries: g.entries })} </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex-1">
                        <ShareBar value={total ? g.minutes / total : 0} />
                      </span>
                      <span className="w-9 text-right text-xs text-ink-faint">
                        {total ? Math.round((g.minutes / total) * 100) : 0}%
                      </span>
                    </span>
                    <span className="text-right text-base font-medium">
                      {formatHours(g.minutes)}
                    </span>
                  </button>
                  {opened && (
                    <div className="border-t border-border bg-surface-soft/60">
                      {opened.items.map((e) => (
                        <div
                          key={e.id}
                          className="grid grid-cols-[20px_64px_minmax(0,1fr)_96px] items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0"
                        >
                          <span />
                          <span className="text-ink-faint">
                            {shortDate(e.date)}
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            {groupBy !== "user" && (
                              <Avatar user={e.user} size={18} />
                            )}
                            <Link
                              href={`/projects/${e.card.project.id}?card=${e.card.id}`}
                              className="shrink-0 text-ink-ghost hover:text-accent"
                            >
                              {cardKey(e.card)}
                            </Link>
                            <span className="truncate">{e.card.title}</span>
                            {groupBy === "user" && (
                              <span className="shrink-0 truncate text-xs text-ink-ghost">
                                {e.card.project.title}
                              </span>
                            )}
                            {e.note && (
                              <span className="min-w-0 truncate text-ink-faint">
                                — {e.note}
                              </span>
                            )}
                          </span>
                          <span className="text-right">
                            {formatHours(e.minutes)}
                          </span>
                        </div>
                      ))}
                      {opened.loading && <p className="px-4 py-2 text-sm text-ink-faint">…</p>}
                      {!opened.loading && opened.items.length < opened.total && (
                        <div className="px-4 py-2">
                          <button type="button" onClick={() => loadEntries(g.key, opened.items.length)} className="text-sm text-accent hover:underline">
                            {t("reports.time.showMore", { shown: opened.items.length, total: opened.total })}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
