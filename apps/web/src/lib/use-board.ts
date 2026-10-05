"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardDto, CardTileDto, ColumnDto } from "@plano/shared";
import { api } from "./api";
import { toast } from "./toast";
import { t } from "@plano/shared";
// Board data + optimistic card mutations shared by the kanban, table and
// list views of a project.
export function useBoard(projectId: string) {
  const [board, setBoard] = useState<BoardDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.projectBoard(projectId).then(setBoard).catch((e) => setError(e.message));
  }, [projectId]);

  useEffect(reload, [reload]);

  const setColumns = useCallback(
    (update: (cols: ColumnDto[]) => ColumnDto[]) => setBoard((b) => (b ? { ...b, columns: update(b.columns) } : b)),
    [],
  );

  const patchCard = useCallback(
    (cardId: string, update: (card: CardTileDto) => CardTileDto) =>
      setColumns((cols) => cols.map((col) => ({ ...col, cards: col.cards.map((c) => (c.id === cardId ? update(c) : c)) }))),
    [setColumns],
  );

  // Failures fall back to a reload so the UI never stays out of sync.
  const guard = useCallback(
    (p: Promise<unknown>) =>
      p.catch((e) => {
        toast((e as Error).message, "error");
        reload();
      }),
    [reload],
  );

  const actions = {
    toggleItem(cardId: string, itemId: string, done: boolean) {
      patchCard(cardId, (c) => ({ ...c, checklist: c.checklist.map((i) => (i.id === itemId ? { ...i, done } : i)) }));
      guard(api.updateChecklistItem(itemId, { done }));
    },
    async addItem(cardId: string, text: string) {
      const item = await api.addChecklistItem(cardId, text);
      patchCard(cardId, (c) => ({ ...c, checklist: [...c.checklist, { id: item.id, text: item.text, done: item.done }] }));
    },
    deleteCard(card: CardTileDto) {
      if (!confirm(t("lib.useBoard.deleteCard", { title: card.title }))) return;
      setColumns((cols) => cols.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== card.id) })));
      guard(api.deleteCard(card.id).then(() => toast(t("lib.useBoard.cardDeleted"), "success")));
    },
    async addCard(columnId: string, title: string) {
      const card = await api.createCard(columnId, title);
      setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, cards: [card, ...c.cards] } : c)));
    },
  };

  // Realtime hints name the cards that changed: refetch just those tiles and
  // patch them in (a moved card changes column, a deleted one disappears).
  // Anything unclear falls back to reloading the board.
  const boardRef = useRef(board);
  boardRef.current = board;
  const applyHints = useCallback(
    async (hints: { cardId: string; op: "upsert" | "remove" }[]) => {
      const last = new Map(hints.map((h) => [h.cardId, h.op]));
      const removeFrom = (cols: ColumnDto[], id: string) => cols.map((col) => (col.cards.some((c) => c.id === id) ? { ...col, cards: col.cards.filter((c) => c.id !== id) } : col));
      await Promise.all(
        [...last].map(async ([id, op]) => {
          if (op === "remove") return setColumns((cols) => removeFrom(cols, id));
          try {
            const tile = await api.cardTile(id);
            if (!boardRef.current?.columns.some((col) => col.id === tile.columnId)) return reload(); // a column we don't know
            setColumns((cols) =>
              removeFrom(cols, id).map((col) => {
                if (col.id !== tile.columnId) return col;
                const at = col.cards.findIndex((c) => c.position > tile.position);
                return { ...col, cards: at === -1 ? [...col.cards, tile] : [...col.cards.slice(0, at), tile, ...col.cards.slice(at)] };
              }),
            );
          } catch (e) {
            // Gone (or no longer ours): drop it; for other errors trust a full reload.
            if (/not found|не найден/i.test((e as Error).message)) setColumns((cols) => removeFrom(cols, id));
            else reload();
          }
        }),
      );
    },
    [reload, setColumns],
  );

  return { board, error, reload, setColumns, guard, actions, applyHints };
}
