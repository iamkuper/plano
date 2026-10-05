import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import { useBoard } from "@/lib/use-board";
import { card, column } from "./fixtures";

const board = () => ({
  id: "b1",
  columns: [
    column({ id: "col1", title: "Бэклог", cards: [card({ id: "a", position: 1 }), card({ id: "b", position: 2 }), card({ id: "c", position: 3 })] }),
    column({ id: "col2", title: "Готово", cards: [card({ id: "d", position: 1, columnId: "col2" })] }),
  ],
});
const ids = (result: { current: ReturnType<typeof useBoard> }) => result.current.board!.columns.map((c) => c.cards.map((k) => k.id).join(""));

async function loaded() {
  const projectBoard = vi.spyOn(api, "projectBoard").mockResolvedValue(board() as never);
  const hook = renderHook(() => useBoard("p1"));
  await waitFor(() => expect(hook.result.current.board).not.toBeNull());
  return { ...hook, projectBoard };
}

describe("board point updates", () => {
  it("puts a changed card where it belongs: same column in order, or another column", async () => {
    const { result } = await loaded();
    vi.spyOn(api, "cardTile").mockImplementation((async (id: string) => {
      if (id === "a") return card({ id: "a", position: 2.5, title: "Новое" }); // moved down within the column
      return card({ id: "b", position: 0.5, columnId: "col2" }); // moved to the other column, to the top
    }) as never);
    await act(() => result.current.applyHints([{ cardId: "a", op: "upsert" }]));
    expect(ids(result)).toEqual(["bac", "d"]);
    expect(result.current.board!.columns[0].cards[1].title).toBe("Новое");
    await act(() => result.current.applyHints([{ cardId: "b", op: "upsert" }]));
    expect(ids(result)).toEqual(["ac", "bd"]);
  });

  it("adds a new card at its position and removes a deleted one", async () => {
    const { result } = await loaded();
    vi.spyOn(api, "cardTile").mockResolvedValue(card({ id: "n", position: 9 }));
    await act(() => result.current.applyHints([{ cardId: "n", op: "upsert" }]));
    expect(ids(result)).toEqual(["abcn", "d"]);
    await act(() => result.current.applyHints([{ cardId: "a", op: "remove" }, { cardId: "n", op: "remove" }]));
    expect(ids(result)).toEqual(["bc", "d"]);
  });

  it("uses the last hint for a card named twice", async () => {
    const { result } = await loaded();
    const tile = vi.spyOn(api, "cardTile");
    await act(() => result.current.applyHints([{ cardId: "a", op: "upsert" }, { cardId: "a", op: "remove" }]));
    expect(tile).not.toHaveBeenCalled();
    expect(ids(result)).toEqual(["bc", "d"]);
  });

  it("drops a card that is gone for us (404) and reloads for any other failure or an unknown column", async () => {
    const { result, projectBoard } = await loaded();
    const tile = vi.spyOn(api, "cardTile").mockRejectedValue(new Error("Карточка не найдена"));
    await act(() => result.current.applyHints([{ cardId: "c", op: "upsert" }]));
    expect(ids(result)).toEqual(["ab", "d"]);
    expect(projectBoard).toHaveBeenCalledTimes(1);

    tile.mockRejectedValue(new Error("Сервер недоступен"));
    await act(() => result.current.applyHints([{ cardId: "a", op: "upsert" }]));
    await waitFor(() => expect(projectBoard).toHaveBeenCalledTimes(2));

    tile.mockResolvedValue(card({ id: "z", columnId: "brand-new-column" }));
    await act(() => result.current.applyHints([{ cardId: "z", op: "upsert" }]));
    await waitFor(() => expect(projectBoard).toHaveBeenCalledTimes(3));
  });
});
