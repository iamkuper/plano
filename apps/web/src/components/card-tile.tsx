"use client";

import { CalendarDays, Check, CheckSquare, Flag, MessageSquare, Paperclip, Repeat } from "lucide-react";
import { CARD_TYPE_LABELS, cardKey, type CardTileDto } from "@amo-kanban/shared";
import { AvatarStack } from "./avatar";
import { CARD_TYPE_STYLES } from "./card-type-icon";
import { LabelTag } from "./ui";

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Board card. Reading order: key + people → what to do → signals.
// Metadata is plain secondary text; only overdue turns red.
export function CardTile({
  card,
  onOpen,
  showProject,
  selected,
  selecting,
  onToggleSelect,
}: {
  card: CardTileDto;
  onOpen: () => void;
  showProject?: boolean;
  selected?: boolean;
  // Some card on the board is selected: a plain click toggles selection too.
  selecting?: boolean;
  onToggleSelect?: () => void;
}) {
  const today = new Date(new Date().toDateString());
  const due = card.dueDate ? new Date(card.dueDate) : null;
  const overdue = due && due < today;
  const dueToday = due && due.toDateString() === today.toDateString();
  const done = card.checklist.filter((i) => i.done).length;
  const total = card.checklist.length;
  const { icon: TypeIcon, color } = CARD_TYPE_STYLES[card.type];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={onToggleSelect ? !!selected : undefined}
      onClick={(e) => {
        if (onToggleSelect && (selecting || e.shiftKey || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onToggleSelect();
        } else onOpen();
      }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className={`group/tile relative cursor-pointer rounded-md border px-3 pb-2.5 pt-2 transition-colors ${
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      <div className="flex h-5 items-center gap-2 text-xs text-ink-ghost">
        {onToggleSelect && (
          // Collapsed to zero width (and its gap cancelled) until hover, so the
          // key sits flush with the title; slides in on hover, stays when
          // selected or while a selection is active.
          <span
            className={`-mr-2 flex w-0 shrink-0 overflow-hidden opacity-0 transition-all duration-150 ease-out group-hover/tile:mr-0 group-hover/tile:w-4 group-hover/tile:opacity-100 group-focus-within/tile:mr-0 group-focus-within/tile:w-4 group-focus-within/tile:opacity-100 ${
              selected || selecting ? "!mr-0 !w-4 !opacity-100" : ""
            }`}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={!!selected}
              aria-label={`Выбрать ${cardKey(card)}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              className={`grid size-4 shrink-0 place-items-center rounded-sm border transition-colors ${
                selected ? "border-accent bg-accent text-white" : "border-border-strong bg-surface hover:border-ink-ghost"
              }`}
            >
              {selected && <Check size={11} strokeWidth={3} />}
            </button>
          </span>
        )}
        <span>{cardKey(card)}</span>
        {card.recurringRuleId && (
          <span title="Повторяющаяся задача" className="text-ink-ghost">
            <Repeat size={12} strokeWidth={2} />
          </span>
        )}
        {showProject && <span className="truncate">{card.project.title}</span>}
        {card.assignees.length > 0 && (
          <span className="ml-auto">
            <AvatarStack users={card.assignees.map((a) => a.user)} size={18} />
          </span>
        )}
      </div>

      <p className="mt-0.5 line-clamp-3 text-base text-ink">{card.title}</p>

      {card.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {card.labels.map(({ label }) => (
            <LabelTag key={label.id} label={label} />
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
        <span className="flex items-center gap-1" title="Тип">
          <TypeIcon size={13} strokeWidth={2} style={{ color }} />
          {CARD_TYPE_LABELS[card.type]}
        </span>
        {card.priority === "HIGH" && (
          <span className="flex items-center gap-1 text-danger" title="Высокий приоритет">
            <Flag size={12} strokeWidth={2} /> Срочно
          </span>
        )}
        {due && (
          <span
            className={`flex items-center gap-1 ${overdue ? "font-medium text-danger" : dueToday ? "font-medium text-warning" : ""}`}
            title={overdue ? "Срок прошёл" : "Срок"}
          >
            <CalendarDays size={12} strokeWidth={2} />
            {dueToday ? "Сегодня" : formatDate(card.dueDate!)}
          </span>
        )}
        {total > 0 && (
          <span className={`flex items-center gap-1 ${done === total ? "text-success" : ""}`} title="Подзадачи">
            <CheckSquare size={12} strokeWidth={2} />
            {done}/{total}
          </span>
        )}
        {(card._count.attachments ?? 0) > 0 && (
          <span className="flex items-center gap-1" title="Файлы">
            <Paperclip size={12} strokeWidth={2} />
            {card._count.attachments}
          </span>
        )}
        {card._count.comments > 0 &&
          (card.unreadComments ? (
            <span className="flex items-center gap-1 font-medium text-accent" title={`Новых сообщений: ${card.unreadComments}`}>
              <MessageSquare size={12} strokeWidth={2} />
              {card._count.comments}
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            </span>
          ) : (
            <span className="flex items-center gap-1" title="Сообщения">
              <MessageSquare size={12} strokeWidth={2} />
              {card._count.comments}
            </span>
          ))}
      </div>
    </div>
  );
}
