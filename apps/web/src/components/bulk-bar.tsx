"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, CalendarDays, Flag, Trash2, UserPlus, X } from "lucide-react";
import { CARD_PRIORITY_LABELS, type CardPriority, type ColumnDto, type UserDto } from "@amo-kanban/shared";
import { useCan } from "@/lib/permissions";
import { api, type BulkAction } from "@/lib/api";
import { toast } from "@/lib/toast";
import { plural } from "./board-toolbar";
import { Avatar } from "./avatar";
import { ConfirmDialog, Input, MenuItem, MenuLabel, Popover, StatusDot, columnTone } from "./ui";

const barButton =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-white/90 transition-colors hover:bg-white/10 hover:text-white";

// Floating action bar for the board/table selection.
export function BulkBar({
  ids,
  columns,
  users,
  onDone,
  onClear,
}: {
  ids: string[];
  columns: ColumnDto[];
  users: UserDto[];
  onDone: () => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const allowed = useCan();
  const [confirming, setConfirming] = useState(false);
  const [due, setDue] = useState("");
  const n = ids.length;
  const cards = `${n} ${plural(n, "карточку", "карточки", "карточек")}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !confirming && onClear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClear, confirming]);

  async function run(action: BulkAction, extra: Parameters<typeof api.bulkCards>[2], done: string) {
    setBusy(true);
    try {
      await api.bulkCards(ids, action, extra);
      toast(done, "success");
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Действия с выбранными карточками"
        aria-busy={busy}
        className="animate-toast-in pointer-events-auto flex items-center gap-0.5 rounded-xl bg-dark p-1.5 pl-3.5 text-white shadow-raised"
      >
        <span className="mr-2 text-sm font-medium">
          Выбрано {n}
        </span>

        <Popover
          side="top"
          align="left"
          trigger={(_, t) => (
            <button onClick={t} className={barButton}>
              <ArrowRightLeft size={15} /> Перенести
            </button>
          )}
        >
          {(close) => (
            <div className="w-[220px] text-ink">
              <MenuLabel>В колонку</MenuLabel>
              {columns.map((c, i) => (
                <MenuItem
                  key={c.id}
                  onClick={() => {
                    close();
                    run("move", { columnId: c.id }, `${cards} в «${c.title}»`);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <StatusDot tone={columnTone(i, columns.length)} /> {c.title}
                  </span>
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Popover
          side="top"
          align="left"
          trigger={(_, t) => (
            <button onClick={t} className={barButton}>
              <UserPlus size={15} /> Исполнитель
            </button>
          )}
        >
          {(close) => (
            <div className="w-[240px] text-ink">
              <MenuLabel>Добавить исполнителя</MenuLabel>
              {users.map((u) => (
                <MenuItem
                  key={u.id}
                  onClick={() => {
                    close();
                    run("assign", { userIds: [u.id] }, `${u.name} — исполнитель в ${cards}`);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Avatar user={u} size={18} /> {u.name}
                  </span>
                </MenuItem>
              ))}
              <MenuLabel>Снять исполнителя</MenuLabel>
              {users.map((u) => (
                <MenuItem
                  key={`r-${u.id}`}
                  onClick={() => {
                    close();
                    run("unassign", { userIds: [u.id] }, `${u.name} снят(а) с ${cards}`);
                  }}
                >
                  <span className="flex items-center gap-2 text-ink-soft">
                    <Avatar user={u} size={18} /> {u.name}
                  </span>
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Popover
          side="top"
          align="left"
          trigger={(_, t) => (
            <button onClick={t} className={barButton}>
              <Flag size={15} /> Приоритет
            </button>
          )}
        >
          {(close) => (
            <div className="w-[180px] text-ink">
              {(Object.keys(CARD_PRIORITY_LABELS) as CardPriority[]).map((p) => (
                <MenuItem
                  key={p}
                  onClick={() => {
                    close();
                    run("priority", { priority: p }, `Приоритет «${CARD_PRIORITY_LABELS[p].toLowerCase()}» у ${cards}`);
                  }}
                >
                  {CARD_PRIORITY_LABELS[p]}
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Popover
          side="top"
          align="left"
          trigger={(_, t) => (
            <button onClick={t} className={barButton}>
              <CalendarDays size={15} /> Срок
            </button>
          )}
        >
          {(close) => (
            <form
              className="w-[240px] space-y-2 p-1.5 text-ink"
              onSubmit={(e) => {
                e.preventDefault();
                if (!due) return;
                close();
                run("due", { dueDate: due }, `Срок ${new Date(due).toLocaleDateString("ru-RU")} у ${cards}`);
              }}
            >
              <Input type="date" aria-label="Новый срок" value={due} onChange={(e) => setDue(e.target.value)} />
              <div className="flex gap-1.5">
                <button disabled={!due} className="h-8 flex-1 rounded-md bg-accent text-sm font-medium text-white disabled:opacity-50">
                  Поставить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    run("due", { dueDate: null }, `Срок снят у ${cards}`);
                  }}
                  className="h-8 rounded-md px-2.5 text-sm text-ink-soft hover:bg-surface-soft"
                >
                  Убрать срок
                </button>
              </div>
            </form>
          )}
        </Popover>

        {allowed("cards.delete") && (
          <button onClick={() => setConfirming(true)} className={`${barButton} text-red-300 hover:text-red-200`}>
            <Trash2 size={15} /> Удалить
          </button>
        )}
        <span aria-hidden className="mx-1 h-5 w-px bg-white/15" />
        <button onClick={onClear} title="Снять выделение (Esc)" aria-label="Снять выделение" className="grid size-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white">
          <X size={16} />
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Удалить ${cards}?`}
          body="Вместе с подзадачами, сообщениями, файлами и записями времени. Отменить нельзя."
          confirmLabel={`Удалить ${cards}`}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false);
            await run("delete", {}, `Удалено: ${cards}`);
            onClear();
          }}
        />
      )}
    </div>
  );
}
