"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { CardTileDto, ColumnDto } from "@plano/shared";
import { api } from "@/lib/api";
import { applyFilters, isReordered, type CardFilters } from "@/lib/card-filters";
import type { useBoard } from "@/lib/use-board";
import { CardTile } from "./card-tile";
import { stageColor } from "@/design/tokens";
import { Button, IconButton, Input, Menu, Skeleton } from "./ui";
import { t } from "@plano/shared";
// Fractional position for inserting a card at `index` among `cards` (which
// must already exclude the card being moved).
function positionAt(cards: CardTileDto[], index: number) {
  const prev = cards[index - 1]?.position;
  const next = cards[index]?.position;
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

function AddCardForm({ onAdd, onClose }: { onAdd: (title: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <form
      className="rounded-md border border-accent bg-surface px-3 py-2 ring-2 ring-accent/15"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onAdd(title.trim());
        setTitle("");
      }}
    >
      <textarea
        autoFocus
        rows={2}
        aria-label={t("common.cardTitle")}
        className="w-full resize-none bg-transparent text-base outline-none placeholder:text-ink-ghost"
        placeholder={t("common.cardTitle")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && onClose()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === "Escape") onClose();
        }}
      />
      <div className="mt-1 text-xs text-ink-ghost">{t("board.enterCreateEscCancel")}</div>
    </form>
  );
}

function ColumnEditForm({
  column,
  onSave,
  onClose,
}: {
  column: ColumnDto;
  onSave: (data: { title: string; wipLimit: number | null }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(column.title);
  const [wip, setWip] = useState(column.wipLimit?.toString() ?? "");
  return (
    <form
      className="space-y-2 rounded-md border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ title: title.trim(), wipLimit: wip ? Math.max(1, Number(wip)) : null });
        onClose();
      }}
    >
      <Input autoFocus aria-label={t("board.columnName")} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input
        type="number"
        min={1}
        aria-label={t("board.cardLimit")}
        placeholder={t("board.cardLimitOptional")}
        value={wip}
        onChange={(e) => setWip(e.target.value)}
      />
      <div className="flex gap-1.5">
        <Button variant="primary" size="sm">{t("common.save")}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

// Lane shared by the project board and the team board. The stage colour
// line on top is the board's one bold element (pipeline stage colours).
export function ColumnShell({
  title,
  color,
  count,
  wipLimit,
  highlighted,
  onAdd,
  menu,
  children,
  ...dropProps
}: {
  title: string;
  color: string;
  count: number;
  wipLimit?: number | null;
  highlighted?: boolean;
  onAdd?: () => void;
  menu?: React.ComponentProps<typeof Menu>["items"];
  children: React.ReactNode;
} & Pick<React.HTMLAttributes<HTMLElement>, "onDragOver" | "onDrop">) {
  const overLimit = wipLimit != null && count > wipLimit;
  return (
    <section
      aria-label={title}
      className={`group/lane flex max-h-full w-[288px] shrink-0 flex-col overflow-hidden rounded-lg transition-colors ${
        highlighted ? "bg-accent-soft" : "bg-surface-soft"
      }`}
      {...dropProps}
    >
      <div aria-hidden className="h-[3px] shrink-0" style={{ background: color }} />
      <header className="flex h-10 shrink-0 items-center gap-2 pl-3 pr-1.5">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        <span className={`text-xs ${overLimit ? "font-medium text-danger" : "text-ink-ghost"}`} title={wipLimit != null ? t("board.limit", { wipLimit }) : undefined}>
          {count}
          {overLimit && t("board.of", { wipLimit })}
        </span>
        <div className="ml-auto flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/lane:opacity-100">
          {onAdd && (
            <IconButton size="sm" onClick={onAdd} title={t("board.addCard")}>
              <Plus size={15} />
            </IconButton>
          )}
          {menu && <Menu items={menu} />}
        </div>
      </header>
      <div className="flex min-h-[56px] flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5">{children}</div>
    </section>
  );
}

function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  return (
    <div className="w-[288px] shrink-0">
      {open ? (
        <form
          className="rounded-lg bg-surface-soft p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onAdd(title.trim());
            setTitle("");
            setOpen(false);
          }}
        >
          <Input
            autoFocus
            aria-label={t("board.columnName")}
            placeholder={t("board.columnName")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          />
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-ink-ghost transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <Plus size={15} />  {t("common.column")}
        </button>
      )}
    </div>
  );
}

// Compact pipeline bar for the page header: one segment per stage, sized by
// card count, in stage colours.
export function ProjectFunnel({ columns }: { columns: ColumnDto[] }) {
  const total = columns.reduce((n, c) => n + c.cards.length, 0);
  const done = columns.at(-1)?.cards.length ?? 0;
  if (!total) return null;
  return (
    <div className="flex items-center gap-2.5" title={columns.map((c) => `${c.title}: ${c.cards.length}`).join("\n")}>
      <div className="flex h-1.5 w-40 gap-px overflow-hidden rounded-full bg-surface-sunken">
        {columns.map((c, i) =>
          c.cards.length ? (
            <span key={c.id} style={{ width: `${(c.cards.length / total) * 100}%`, background: stageColor(i, columns.length) }} />
          ) : null,
        )}
      </div>
      <span className="text-xs text-ink-faint"> {t("board.ofDone", { done, total })} </span>
    </div>
  );
}

export function Board({
  boardId,
  columns,
  state,
  filters,
  onOpenCard,
  selected,
  onToggleSelect,
}: {
  boardId: string;
  columns: ColumnDto[];
  state: ReturnType<typeof useBoard>;
  filters: CardFilters;
  onOpenCard: (id: string) => void;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const { setColumns, guard, actions } = state;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // With a sort or filter on, drop positions can't be mapped back to the
  // stored order, so a drop just moves the card to the end of the column.
  const reordered = isReordered(filters);

  function drop(columnId: string, index: number) {
    if (!dragId) return;
    const card = columns.flatMap((c) => c.cards).find((c) => c.id === dragId);
    setDragId(null);
    setOverColumn(null);
    if (!card) return;

    const target = columns.find((c) => c.id === columnId)!;
    if (reordered && card.columnId === columnId) return;
    const siblings = target.cards.filter((c) => c.id !== card.id);
    const from = target.cards.findIndex((c) => c.id === card.id);
    const insertAt = reordered ? siblings.length : from !== -1 && from < index ? index - 1 : index;
    const position = positionAt(siblings, insertAt);
    const moved = { ...card, columnId, position };

    setColumns((cols) =>
      cols.map((col) => {
        const rest = col.cards.filter((c) => c.id !== card.id);
        if (col.id !== columnId) return { ...col, cards: rest };
        return { ...col, cards: [...rest, moved].sort((a, b) => a.position - b.position) };
      }),
    );
    guard(api.moveCard(card.id, columnId, position));
  }

  return (
    <div className="-mx-6 flex h-[calc(100vh-124px)] min-h-[420px] items-start gap-2 overflow-x-auto px-6 pb-4">
      {columns.map((column, index) => {
        const visible = applyFilters(column.cards, filters);
        return (
          <ColumnShell
            key={column.id}
            title={column.title}
            color={stageColor(index, columns.length)}
            count={visible.length}
            wipLimit={column.wipLimit}
            highlighted={overColumn === column.id}
            onAdd={() => setAddingTo(column.id)}
            menu={[{ label: t("board.renameAndSetALimit"), onClick: () => setEditing(column.id) }]}
            onDragOver={(e) => {
              e.preventDefault();
              if (overColumn !== column.id) setOverColumn(column.id);
            }}
            onDrop={() => drop(column.id, column.cards.length)}
          >
            {editing === column.id && (
              <ColumnEditForm
                column={column}
                onClose={() => setEditing(null)}
                onSave={(data) => {
                  setColumns((cols) => cols.map((c) => (c.id === column.id ? { ...c, ...data } : c)));
                  guard(api.updateColumn(column.id, data));
                }}
              />
            )}
            {addingTo === column.id && (
              <AddCardForm onAdd={(title) => actions.addCard(column.id, title)} onClose={() => setAddingTo(null)} />
            )}
            {visible.map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragId(card.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverColumn(null);
                }}
                onDrop={(e) => {
                  e.stopPropagation();
                  drop(column.id, column.cards.findIndex((c) => c.id === card.id));
                }}
                className={dragId === card.id ? "rounded-md border border-dashed border-border-strong [&>*]:invisible" : ""}
              >
                <CardTile
                  card={card}
                  onOpen={() => onOpenCard(card.id)}
                  selected={selected?.has(card.id)}
                  selecting={!!selected?.size}
                  onToggleSelect={onToggleSelect && (() => onToggleSelect(card.id))}
                />
              </div>
            ))}
          </ColumnShell>
        );
      })}
      <AddColumn
        onAdd={(title) =>
          guard(api.addColumn(boardId, title).then((col) => setColumns((cols) => [...cols, { ...col, cards: [] }])))
        }
      />
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="-mx-6 flex gap-2 overflow-hidden px-6 pt-1" aria-busy="true" aria-label={t("board.loadingTheBoard")}>
      {[4, 3, 2, 3].map((n, i) => (
        <div key={i} className="w-[288px] shrink-0 overflow-hidden rounded-lg bg-surface-soft">
          <div className="h-[3px] bg-surface-sunken" />
          <Skeleton className="mx-3 my-3 h-3.5 w-24" />
          <div className="space-y-1.5 px-1.5 pb-1.5">
            {Array.from({ length: n }).map((_, j) => (
              <div key={j} className="rounded-md border border-border bg-surface px-3 py-2.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="mt-2 h-3.5 w-11/12" />
                <Skeleton className="mt-3 h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
