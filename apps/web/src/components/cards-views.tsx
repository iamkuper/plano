"use client";

import { CalendarDays } from "lucide-react";
import { cardKey, type CardTileDto, type ColumnDto, t } from "@plano/shared";
import { AvatarStack } from "./avatar";
import { CardTypeIcon, CardTypeTag } from "./card-type-icon";
import { formatDate } from "./card-tile";
import { PriorityBadge } from "./priority-badge";
import { applyFilters, type CardFilters } from "@/lib/card-filters";
import { Checkbox, ShareBar, StatusDot, columnTone, td, th, tr } from "./ui";

function Assignees({ card }: { card: CardTileDto }) {
  if (card.assignees.length === 0) return <span className="text-ink-ghost">—</span>;
  return (
    <AvatarStack users={card.assignees.map((a) => a.user)} size={24} max={4} />
  );
}

function Due({ card }: { card: CardTileDto }) {
  if (!card.dueDate) return <span className="text-ink-ghost">—</span>;
  const overdue = new Date(card.dueDate) < new Date();
  return (
    <span className={`flex items-center gap-1.5 ${overdue ? "font-semibold text-danger" : "text-ink-soft"}`}>
      <CalendarDays size={14} /> {formatDate(card.dueDate)}
    </span>
  );
}

function Progress({ card }: { card: CardTileDto }) {
  const total = card.checklist.length;
  if (!total) return <span className="text-ink-ghost">—</span>;
  const done = card.checklist.filter((i) => i.done).length;
  return (
    <span className="flex items-center gap-2">
      <span className="w-16">
        <ShareBar value={done / total} tone={done === total ? "success" : "accent"} />
      </span>
      <span className="text-xs text-ink-faint">
        {done}/{total}
      </span>
    </span>
  );
}

export function CardsTable({
  columns,
  filters,
  onOpenCard,
  selected,
  onToggleSelect,
  onSelectAll,
}: {
  columns: ColumnDto[];
  filters: CardFilters;
  onOpenCard: (id: string) => void;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: (ids: string[], on: boolean) => void;
}) {
  const rows = columns.flatMap((col, index) => applyFilters(col.cards, filters).map((card) => ({ card, col, index })));
  const allOn = rows.length > 0 && rows.every((r) => selected?.has(r.card.id));
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {onToggleSelect && (
              <th className={`${th} w-10 pr-0`}>
                <Checkbox
                  checked={allOn}
                  label={t("cardsViews.selectAll")}
                  onChange={(on) => onSelectAll?.(rows.map((r) => r.card.id), on)}
                />
              </th>
            )}
            <th className={th}>{t("common.task")}</th>
            <th className={th}>{t("common.status")}</th>
            <th className={th}>{t("common.priority")}</th>
            <th className={th}>{t("common.assignees")}</th>
            <th className={th}>{t("common.dueDate")}</th>
            <th className={th}>{t("common.subtasks")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-base text-ink-faint">
                
                {t("cardsViews.noCardsYet")}
              </td>
            </tr>
          )}
          {rows.map(({ card, col, index }) => (
            <tr
              key={card.id}
              className={`${tr} cursor-pointer ${selected?.has(card.id) ? "bg-accent-soft hover:bg-accent-soft" : ""}`}
              onClick={(e) => (onToggleSelect && (selected?.size || e.shiftKey || e.metaKey || e.ctrlKey) ? onToggleSelect(card.id) : onOpenCard(card.id))}
            >
              {onToggleSelect && (
                <td className={`${td} w-10 pr-0`} onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={!!selected?.has(card.id)} label={t("common.select", { cardKey: cardKey(card) })} onChange={() => onToggleSelect(card.id)} />
                </td>
              )}
              <td className={`${td} max-w-[420px]`}>
                <div className="flex items-center gap-3">
                  <CardTypeIcon type={card.type} size={22} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{card.title}</div>
                    <div className="text-xs text-ink-ghost">{cardKey(card)}</div>
                  </div>
                </div>
              </td>
              <td className={td}>
                <span className="flex items-center gap-2">
                  <StatusDot tone={columnTone(index, columns.length)} />
                  {col.title}
                </span>
              </td>
              <td className={td}>
                <PriorityBadge priority={card.priority} />
              </td>
              <td className={td}>
                <Assignees card={card} />
              </td>
              <td className={td}>
                <Due card={card} />
              </td>
              <td className={td}>
                <Progress card={card} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CardsList({
  columns,
  filters,
  onOpenCard,
}: {
  columns: ColumnDto[];
  filters: CardFilters;
  onOpenCard: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {columns.map((rawCol, index) => {
        const col = { ...rawCol, cards: applyFilters(rawCol.cards, filters) };
        return (
        <section key={col.id}>
          <header className="mb-2 flex items-center gap-2 px-1">
            <StatusDot tone={columnTone(index, columns.length)} />
            <h3 className="text-md font-semibold">{col.title}</h3>
            <span className="text-xs text-ink-ghost">{col.cards.length}</span>
          </header>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {col.cards.length === 0 && <div className="px-4 py-4 text-base text-ink-faint">{t("cardsViews.empty")}</div>}
            {col.cards.map((card) => (
              <button
                key={card.id}
                onClick={() => onOpenCard(card.id)}
                className="flex w-full items-center gap-4 border-b border-border px-4 py-3 text-left transition last:border-b-0 hover:bg-surface-soft"
              >
                <span className="w-16 shrink-0 text-xs text-ink-ghost">{cardKey(card)}</span>
                <span className="min-w-0 flex-1 truncate text-base font-medium">{card.title}</span>
                <span className="hidden shrink-0 items-center gap-1.5 md:flex">
                  <CardTypeTag type={card.type} />
                  {card.priority !== "MEDIUM" && <PriorityBadge priority={card.priority} />}
                </span>
                <span className="hidden w-28 shrink-0 lg:block">
                  <Progress card={card} />
                </span>
                <span className="w-20 shrink-0 text-base">
                  <Due card={card} />
                </span>
                <span className="w-20 shrink-0">
                  <Assignees card={card} />
                </span>
              </button>
            ))}
          </div>
        </section>
        );
      })}
    </div>
  );
}
