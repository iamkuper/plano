"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock, Download } from "lucide-react";
import {
  cardKey,
  type UserDto,
  type UserRefDto,
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
import { api } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";

interface Entry {
  id: string;
  minutes: number;
  date: string;
  note: string | null;
  user: UserRefDto;
  card: {
    id: string;
    number: number;
    title: string;
    type: { name: string };
    project: { id: string; title: string };
  };
}

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
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

const shortDate = (s: string) =>
  new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

// CSV that Excel opens correctly: UTF-8 BOM, ";" separators, quoted cells.
function downloadCsv(entries: Entry[], from: string, to: string) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    [
      "Дата",
      "Сотрудник",
      "Проект",
      "Карточка",
      "Название карточки",
      "Тип",
      "Комментарий",
      "Минуты",
      "Часы",
    ],
    ...entries.map((e) => [
      e.date.slice(0, 10),
      e.user.name,
      e.card.project.title,
      cardKey(e.card),
      e.card.title,
      e.card.type.name,
      e.note ?? "",
      e.minutes,
      String(hours(e.minutes)).replace(".", ","),
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `uchet-vremeni_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TimeReportPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [[from, to], setRange] = useState<[string, string]>(() =>
    range("week"),
  );
  const [groupBy, setGroupBy] = useState<GroupBy>("user");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<UserDto[]>([]);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allowed = useCan();
  const viewAll = allowed("time.viewAll");

  useEffect(() => {
    api
      .users()
      .then(setUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setEntries(null);
    setError(null);
    api
      .timeReport(from, to, userId || undefined)
      .then((r) => setEntries(r as Entry[]))
      .catch((e) => {
        setError(e.message);
        setEntries([]);
      });
  }, [from, to, userId]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        sub?: string;
        who?: UserRefDto;
        entries: Entry[];
        minutes: number;
      }
    >();
    for (const e of entries ?? []) {
      const key = groupBy === "user" ? e.user.id : e.card.project.id;
      const g = map.get(key) ?? {
        key,
        label: groupBy === "user" ? e.user.name : e.card.project.title,
        who: groupBy === "user" ? e.user : undefined,
        entries: [],
        minutes: 0,
      };
      g.entries.push(e);
      g.minutes += e.minutes;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [entries, groupBy]);

  const total = groups.reduce((n, g) => n + g.minutes, 0);
  const people = new Set(entries?.map((e) => e.user.id)).size;
  const projects = new Set(entries?.map((e) => e.card.project.id)).size;

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <AppShell>
      <PageHeader
        title="Главная"
        meta={<HomeTabs />}
        actions={
          <Button
            disabled={!entries?.length}
            onClick={() => {
              downloadCsv(entries!, from, to);
              toast("Файл выгружен", "success");
            }}
          >
            <Download size={15} /> Выгрузить в Excel
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 py-2.5">
        <Segmented<Period>
          label="Период"
          value={period}
          onChange={(p) => {
            setPeriod(p);
            if (p !== "custom") setRange(range(p));
          }}
          options={[
            { value: "week", label: "Эта неделя" },
            { value: "lastWeek", label: "Прошлая" },
            { value: "month", label: "Этот месяц" },
            { value: "lastMonth", label: "Прошлый" },
            { value: "custom", label: "Период" },
          ]}
        />
        {period === "custom" && (
          <div className="flex items-center gap-1.5">
            <div className="w-40">
              <Input
                type="date"
                aria-label="С"
                value={from}
                max={to}
                onChange={(e) => setRange([e.target.value, to])}
              />
            </div>
            <span className="text-ink-ghost">—</span>
            <div className="w-40">
              <Input
                type="date"
                aria-label="По"
                value={to}
                min={from}
                onChange={(e) => setRange([from, e.target.value])}
              />
            </div>
          </div>
        )}
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <Segmented<GroupBy>
          label="Группировка"
          value={groupBy}
          onChange={(g) => {
            setGroupBy(g);
            setOpen(new Set());
          }}
          options={[
            { value: "user", label: "Сотрудники" },
            { value: "project", label: "Проекты" },
          ]}
        />
        {viewAll && (
          <div className="ml-auto w-52">
            <Select
              aria-label="Сотрудник"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Все сотрудники</option>
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
            label="Всего"
            value={entries ? formatHours(total) : "…"}
            hint={`${shortDate(from)} — ${shortDate(to)}`}
          />
          <Kpi label="Записей" value={entries ? String(entries.length) : "…"} />
          <Kpi label="Сотрудников" value={entries ? String(people) : "…"} />
          <Kpi label="Проектов" value={entries ? String(projects) : "…"} />
        </div>

        {error && (
          <p className="rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        {!entries && <TableSkeleton />}
        {entries && entries.length === 0 && !error && (
          <EmptyState icon={Clock} title="За этот период время не списано">
            Время списывается в карточке задачи, в разделе «Учёт времени».
          </EmptyState>
        )}

        {groups.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            {groups.map((g) => {
              const expanded = open.has(g.key);
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
                      {g.who ? (
                        <Avatar user={g.who} size={24} />
                      ) : (
                        <LetterMark name={g.label} size={22} />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-base font-medium">
                          {g.label}
                        </span>
                        {g.sub && (
                          <span className="block truncate text-xs text-ink-faint">
                            {g.sub}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-ink-ghost">
                        {g.entries.length} зап.
                      </span>
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
                  {expanded && (
                    <div className="border-t border-border bg-surface-soft/60">
                      {g.entries.map((e) => (
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
