"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChartGantt } from "lucide-react";
import { cardKey, type CardTileDto, type ColumnDto } from "@plano/shared";
import { api } from "@/lib/api";
import { applyFilters, type CardFilters } from "@/lib/card-filters";
import { toast } from "@/lib/toast";
import { typeStyle } from "./card-type-icon";
import { Button, ConfirmDialog, EmptyState, Segmented, Skeleton } from "./ui";

const DAY_MS = 86_400_000;
const ROW = 34;
const HEAD = 48;
const LEFT = 260;
const ZOOMS = { day: 36, week: 14, month: 5 } as const;
type Zoom = keyof typeof ZOOMS;

// Dates are whole days: the "YYYY-MM-DD" part of the stored value, counted
// from the Unix epoch, so time zones never shift a bar.
const toDay = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const fromDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const todayDay = () => {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
};

interface Span {
  s: number;
  e: number;
}
const spanOf = (c: CardTileDto): Span | null => {
  const s = c.startDate ? toDay(c.startDate) : null;
  const e = c.dueDate ? toDay(c.dueDate) : null;
  if (s === null && e === null) return null;
  return { s: s ?? e!, e: e ?? s! };
};

type Drag =
  | { kind: "bar"; id: string; mode: "move" | "start" | "end"; x0: number; delta: number; moved: boolean }
  | { kind: "link"; from: string; x: number; y: number };

// Gantt chart (Business plan). Bars run from the card's start to its due
// date: drag to move, drag an edge to resize, drag the dot at the right end
// onto another bar to make that card wait for this one.
export function GanttChart({
  projectId,
  columns,
  filters,
  hasGantt,
  onOpenCard,
  onChanged,
}: {
  projectId: string;
  columns: ColumnDto[];
  filters: CardFilters;
  hasGantt: boolean | null;
  onOpenCard: (id: string) => void;
  onChanged: () => void;
}) {
  const [zoom, setZoom] = useState<Zoom>("day");
  const [deps, setDeps] = useState<{ cardId: string; dependsOnId: string }[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [removing, setRemoving] = useState<{ cardId: string; dependsOnId: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dayW = ZOOMS[zoom];

  const doneColumnId = columns[columns.length - 1]?.id;
  const cards = useMemo(() => columns.flatMap((c) => applyFilters(c.cards, filters)), [columns, filters]);
  // Dated cards first, in start order; undated ones after them.
  const rows = useMemo(() => {
    const dated = cards.filter((c) => spanOf(c)).sort((a, b) => spanOf(a)!.s - spanOf(b)!.s || spanOf(a)!.e - spanOf(b)!.e);
    return [...dated, ...cards.filter((c) => !spanOf(c))];
  }, [cards]);
  const rowOf = useMemo(() => new Map(rows.map((c, i) => [c.id, i])), [rows]);

  const loadDeps = useCallback(() => {
    if (hasGantt) api.dependencies(projectId).then(setDeps).catch(() => {});
  }, [projectId, hasGantt]);
  useEffect(loadDeps, [loadDeps]);
  // Re-read links when the board refreshes (a colleague changed something).
  useEffect(loadDeps, [columns, loadDeps]);

  const today = todayDay();
  const [origin, total] = useMemo(() => {
    const days = cards.flatMap((c) => {
      const sp = spanOf(c);
      return sp ? [sp.s, sp.e] : [];
    });
    const min = Math.min(today, ...days) - 5;
    const max = Math.max(today + 30, ...days) + 14;
    return [min, max - min + 1];
  }, [cards, today]);

  if (hasGantt === null) return <Skeleton className="mt-4 h-72" />;
  if (!hasGantt) {
    return (
      <EmptyState
        icon={ChartGantt}
        title="Диаграмма Ганта есть на тарифе Business"
        action={
          <Link href="/settings/billing">
            <Button variant="primary">Посмотреть тарифы</Button>
          </Link>
        }
      >
        Полосы по срокам задач, перенос и растягивание мышью, связи «сначала это, потом то».
      </EmptyState>
    );
  }

  const x = (day: number) => (day - origin) * dayW;
  const rowY = (i: number) => i * ROW + ROW / 2;

  // Span of a bar while it is being dragged.
  function live(c: CardTileDto): Span | null {
    const sp = spanOf(c);
    if (!sp || !drag || drag.kind !== "bar" || drag.id !== c.id) return sp;
    const d = drag.delta;
    if (drag.mode === "move") return { s: sp.s + d, e: sp.e + d };
    if (drag.mode === "start") return { s: Math.min(sp.s + d, sp.e), e: sp.e };
    return { s: sp.s, e: Math.max(sp.e + d, sp.s) };
  }

  async function save(id: string, sp: Span) {
    try {
      await api.updateCard(id, { startDate: fromDay(sp.s), dueDate: fromDay(sp.e) });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function startBar(e: React.PointerEvent, c: CardTileDto, mode: "move" | "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    const base: Drag = { kind: "bar", id: c.id, mode, x0: e.clientX, delta: 0, moved: false };
    setDrag(base);
    const sp = spanOf(c)!;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - base.x0;
      setDrag({ ...base, delta: Math.round(dx / dayW), moved: Math.abs(dx) > 3 });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dx = ev.clientX - base.x0;
      const d = Math.round(dx / dayW);
      setDrag(null);
      if (Math.abs(dx) <= 3) return onOpenCard(c.id);
      if (d === 0) return;
      const next = mode === "move" ? { s: sp.s + d, e: sp.e + d } : mode === "start" ? { s: Math.min(sp.s + d, sp.e), e: sp.e } : { s: sp.s, e: Math.max(sp.e + d, sp.s) };
      save(c.id, next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startLink(e: React.PointerEvent, c: CardTileDto) {
    e.preventDefault();
    e.stopPropagation();
    const box = trackRef.current!.getBoundingClientRect();
    const point = (ev: PointerEvent) => ({ x: ev.clientX - box.left, y: ev.clientY - box.top });
    setDrag({ kind: "link", from: c.id, ...point(e.nativeEvent) });
    const onMove = (ev: PointerEvent) => setDrag({ kind: "link", from: c.id, ...point(ev) });
    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDrag(null);
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-bar]")?.dataset.bar;
      if (!target || target === c.id) return;
      try {
        await api.addDependency(target, c.id);
        loadDeps();
        onChanged();
      } catch (err) {
        toast((err as Error).message, "error");
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Header: months on top, days (or week starts) below.
  const months: { label: string; from: number; days: number }[] = [];
  for (let d = origin; d < origin + total; d++) {
    const date = new Date(d * DAY_MS);
    const name = date.toLocaleDateString("ru-RU", { month: "long", timeZone: "UTC" });
    const label = `${name[0].toUpperCase()}${name.slice(1)} ${date.getUTCFullYear()}`;
    const last = months[months.length - 1];
    if (last && last.label === label) last.days++;
    else months.push({ label, from: d, days: 1 });
  }
  const width = total * dayW;
  const height = rows.length * ROW;
  const isWeekend = (d: number) => [0, 6].includes(new Date(d * DAY_MS).getUTCDay());

  const arrows = deps.flatMap((dep) => {
    const from = rows[rowOf.get(dep.dependsOnId) ?? -1];
    const to = rows[rowOf.get(dep.cardId) ?? -1];
    if (!from || !to) return [];
    const a = live(from);
    const b = live(to);
    if (!a || !b) return [];
    const x1 = x(a.e + 1);
    const x2 = x(b.s);
    const y1 = rowY(rowOf.get(from.id)!);
    const y2 = rowY(rowOf.get(to.id)!);
    const bad = b.s <= a.e;
    const mid = y2 > y1 ? y1 + ROW / 2 : y1 - ROW / 2;
    const d = x2 >= x1 + 12 ? `M${x1},${y1} H${x1 + 6} V${y2} H${x2}` : `M${x1},${y1} H${x1 + 6} V${mid} H${x2 - 8} V${y2} H${x2}`;
    return [{ key: `${dep.cardId}-${dep.dependsOnId}`, d, bad, dep }];
  });

  return (
    <div className="py-3">
      <div className="mb-3 flex items-center gap-3">
        <Segmented<Zoom> label="Масштаб" value={zoom} onChange={setZoom} options={[{ value: "day", label: "Дни" }, { value: "week", label: "Недели" }, { value: "month", label: "Месяцы" }]} />
        <span className="text-xs text-ink-ghost">Тяните полосу, чтобы сдвинуть, края — чтобы растянуть. Точка справа соединяет с зависимой задачей</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-faint">Нет карточек для диаграммы</p>
      ) : (
        <div className="max-h-[calc(100vh-230px)] overflow-auto rounded-lg border border-border bg-surface" onPointerLeave={() => undefined}>
          <div className="relative" style={{ width: LEFT + width, minHeight: HEAD + height }}>
            {/* header */}
            <div className="sticky top-0 z-30 flex border-b border-border bg-surface-soft" style={{ height: HEAD }}>
              <div className="sticky left-0 z-40 shrink-0 border-r border-border bg-surface-soft px-3 text-xs text-ink-faint" style={{ width: LEFT, lineHeight: `${HEAD}px` }}>
                Задача
              </div>
              <div className="relative" style={{ width }}>
                {months.map((m) => (
                  <div key={m.from} className="absolute top-0 truncate border-l border-border px-2 text-xs text-ink-soft" style={{ left: x(m.from), width: m.days * dayW, lineHeight: "24px" }}>
                    {m.label}
                  </div>
                ))}
                {Array.from({ length: total }, (_, i) => origin + i).map((d) => {
                  const date = new Date(d * DAY_MS);
                  const show = zoom === "day" || (zoom === "week" && date.getUTCDay() === 1);
                  return show ? (
                    <div key={d} className={`absolute text-center text-xs ${d === today ? "font-medium text-ink" : "text-ink-ghost"}`} style={{ left: x(d), width: zoom === "day" ? dayW : dayW * 7, top: 24, lineHeight: "24px" }}>
                      {date.getUTCDate()}
                    </div>
                  ) : null;
                })}
              </div>
            </div>

            <div className="flex">
              {/* task names */}
              <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-surface" style={{ width: LEFT }}>
                {rows.map((c) => {
                  const { icon: Icon, color } = typeStyle(c.type);
                  return (
                    <button key={c.id} onClick={() => onOpenCard(c.id)} className="flex w-full items-center gap-2 border-b border-border px-3 text-left text-sm hover:bg-surface-soft" style={{ height: ROW }} title={c.title}>
                      <Icon size={13} strokeWidth={2} style={{ color }} className="shrink-0" />
                      <span className="shrink-0 text-xs text-ink-ghost">{cardKey(c)}</span>
                      <span className={`truncate ${c.columnId === doneColumnId ? "text-ink-ghost line-through" : ""}`}>{c.title}</span>
                    </button>
                  );
                })}
              </div>

              {/* timeline */}
              <div ref={trackRef} className="relative" style={{ width, height }}>
                {Array.from({ length: total }, (_, i) => origin + i).filter(isWeekend).map((d) => (
                  <div key={d} className="absolute top-0 bg-surface-soft" style={{ left: x(d), width: dayW, height }} />
                ))}
                {rows.map((c, i) => (
                  <div
                    key={c.id}
                    className="absolute left-0 w-full border-b border-border"
                    style={{ top: i * ROW, height: ROW }}
                    onDoubleClick={(e) => {
                      if (spanOf(c)) return;
                      const day = origin + Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / dayW);
                      save(c.id, { s: day, e: day });
                    }}
                    title={spanOf(c) ? undefined : "Двойной щелчок — задать даты"}
                  >
                    {!spanOf(c) && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-ghost">Без дат: двойной щелчок задаёт день</span>}
                  </div>
                ))}
                <div className="pointer-events-none absolute top-0 z-10 w-px bg-danger" style={{ left: x(today) + dayW / 2, height }} />

                <svg className="pointer-events-none absolute left-0 top-0 z-10" width={width} height={height}>
                  <defs>
                    <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
                    </marker>
                  </defs>
                  {arrows.map((a) => (
                    <g key={a.key} className={a.bad ? "text-danger" : "text-ink-faint"}>
                      <path d={a.d} fill="none" stroke="currentColor" strokeWidth={1.25} markerEnd="url(#gantt-arrow)" />
                      <path d={a.d} fill="none" stroke="transparent" strokeWidth={10} className="pointer-events-auto cursor-pointer" onClick={() => setRemoving(a.dep)}>
                        <title>{a.bad ? "Зависимая задача начинается раньше. Нажмите, чтобы удалить связь" : "Нажмите, чтобы удалить связь"}</title>
                      </path>
                    </g>
                  ))}
                  {drag?.kind === "link" && rowOf.has(drag.from) && (() => {
                    const from = rows[rowOf.get(drag.from)!];
                    const sp = live(from)!;
                    return <line x1={x(sp.e + 1)} y1={rowY(rowOf.get(drag.from)!)} x2={drag.x} y2={drag.y} stroke="currentColor" strokeDasharray="4 3" className="text-accent" />;
                  })()}
                </svg>

                {rows.map((c, i) => {
                  const sp = live(c);
                  if (!sp) return null;
                  const { color } = typeStyle(c.type);
                  const done = c.columnId === doneColumnId;
                  const overdue = !done && sp.e < today;
                  const left = x(sp.s);
                  const w = (sp.e - sp.s + 1) * dayW;
                  return (
                    <div
                      key={c.id}
                      data-bar={c.id}
                      onPointerDown={(e) => startBar(e, c, "move")}
                      className="group/bar absolute z-20 flex cursor-grab items-center overflow-visible rounded-md active:cursor-grabbing"
                      style={{ left, top: i * ROW + 6, width: Math.max(w, 6), height: ROW - 12, background: done ? `${color}55` : color, outline: overdue ? "2px solid #D23F3F" : undefined, outlineOffset: -1 }}
                      title={`${cardKey(c)} ${c.title}: ${fromDay(sp.s)} – ${fromDay(sp.e)}`}
                    >
                      <span onPointerDown={(e) => startBar(e, c, "start")} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" />
                      {w > 70 && <span className="pointer-events-none truncate px-2 text-xs text-white">{c.title}</span>}
                      <span onPointerDown={(e) => startBar(e, c, "end")} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" />
                      <span
                        onPointerDown={(e) => startLink(e, c)}
                        title="Потянуть на зависимую задачу"
                        className="absolute -right-3 top-1/2 size-2.5 -translate-y-1/2 cursor-crosshair rounded-full border border-ink-faint bg-surface opacity-0 transition-opacity group-hover/bar:opacity-100"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {removing && (
        <ConfirmDialog
          title="Удалить связь?"
          body="Задачи останутся, пропадёт только стрелка между ними."
          confirmLabel="Удалить"
          onConfirm={async () => {
            await api.removeDependency(removing.cardId, removing.dependsOnId).catch((e) => toast((e as Error).message, "error"));
            setRemoving(null);
            loadDeps();
            onChanged();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
