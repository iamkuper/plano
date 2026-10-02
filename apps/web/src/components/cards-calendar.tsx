"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cardKey, type ColumnDto } from "@amo-kanban/shared";
import { api } from "@/lib/api";
import { applyFilters, type CardFilters } from "@/lib/card-filters";
import { toast } from "@/lib/toast";
import { CARD_TYPE_STYLES } from "./card-type-icon";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MAX_PER_DAY = 3;

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Month grid (weeks start on Monday) of the cards' due dates. Drag a card to
// another day to change its due date.
export function CardsCalendar({
  columns,
  filters,
  onOpenCard,
  onChanged,
}: {
  columns: ColumnDto[];
  filters: CardFilters;
  onOpenCard: (id: string) => void;
  onChanged: () => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const doneColumnId = columns[columns.length - 1]?.id;
  const cards = useMemo(() => columns.flatMap((c) => applyFilters(c.cards, filters)), [columns, filters]);
  const byDay = useMemo(() => {
    const map = new Map<string, typeof cards>();
    for (const card of cards) {
      if (!card.dueDate) continue;
      const k = dayKey(new Date(card.dueDate));
      map.set(k, [...(map.get(k) ?? []), card]);
    }
    return map;
  }, [cards]);
  const withoutDue = cards.filter((c) => !c.dueDate).length;

  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const weeks = Math.ceil((offset + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const todayKey = dayKey(new Date());

  async function drop(cardId: string, day: Date) {
    setDragOver(null);
    const card = cards.find((c) => c.id === cardId);
    if (!card || (card.dueDate && dayKey(new Date(card.dueDate)) === dayKey(day))) return;
    try {
      await api.updateCard(cardId, { dueDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString() });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const monthName = month.toLocaleDateString("ru-RU", { month: "long" });
  const title = `${monthName[0].toUpperCase()}${monthName.slice(1)} ${month.getFullYear()}`;

  return (
    <div className="py-3">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-40 text-md font-medium">{title}</h2>
        <button onClick={() => shift(-1)} aria-label="Предыдущий месяц" className="grid size-7 place-items-center rounded-md text-ink-faint hover:bg-surface-soft hover:text-ink">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => shift(1)} aria-label="Следующий месяц" className="grid size-7 place-items-center rounded-md text-ink-faint hover:bg-surface-soft hover:text-ink">
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          className="h-7 rounded-md px-2.5 text-sm text-ink-faint hover:bg-surface-soft hover:text-ink"
        >
          Сегодня
        </button>
        {withoutDue > 0 && <span className="ml-auto text-xs text-ink-ghost">Без срока: {withoutDue}</span>}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-surface-soft text-xs text-ink-faint">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const k = dayKey(day);
            const inMonth = day.getMonth() === month.getMonth();
            const list = byDay.get(k) ?? [];
            const shown = expanded === k ? list : list.slice(0, MAX_PER_DAY);
            return (
              <div
                key={k}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(k);
                }}
                onDragLeave={() => setDragOver((v) => (v === k ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(e.dataTransfer.getData("text/plain"), day);
                }}
                className={`min-h-[104px] border-b border-r border-border p-1.5 ${i % 7 === 6 ? "border-r-0" : ""} ${i >= days.length - 7 ? "border-b-0" : ""} ${
                  dragOver === k ? "bg-accent-soft" : inMonth ? "bg-surface" : "bg-surface-soft"
                }`}
              >
                <div className={`mb-1 text-xs ${k === todayKey ? "inline-grid size-5 place-items-center rounded-full bg-accent font-medium text-white" : inMonth ? "text-ink-faint" : "text-ink-ghost"}`}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {shown.map((c) => {
                    const { icon: Icon, color } = CARD_TYPE_STYLES[c.type];
                    const done = c.columnId === doneColumnId;
                    const overdue = !done && new Date(c.dueDate!) < new Date(new Date().toDateString());
                    return (
                      <button
                        key={c.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                        onClick={() => onOpenCard(c.id)}
                        title={`${cardKey(c)} ${c.title}`}
                        className={`flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-surface-sunken ${done ? "text-ink-ghost line-through" : overdue ? "text-danger" : "text-ink"}`}
                      >
                        <Icon size={12} strokeWidth={2} style={{ color }} className="shrink-0" />
                        <span className="truncate">{c.title}</span>
                      </button>
                    );
                  })}
                  {list.length > MAX_PER_DAY && expanded !== k && (
                    <button onClick={() => setExpanded(k)} className="px-1 text-xs text-ink-faint hover:text-ink">
                      ещё {list.length - MAX_PER_DAY}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
