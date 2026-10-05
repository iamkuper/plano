"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardDto, CardTileDto, ColumnDto } from "@plano/shared";
import { api } from "./api";
import { toast } from "./toast";

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
      if (!confirm(`Удалить карточку «${card.title}»?`)) return;
      setColumns((cols) => cols.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== card.id) })));
      guard(api.deleteCard(card.id).then(() => toast("Карточка удалена", "success")));
    },
    async addCard(columnId: string, title: string) {
      const card = await api.createCard(columnId, title);
      setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, cards: [card, ...c.cards] } : c)));
    },
  };

  return { board, error, reload, setColumns, guard, actions };
}
