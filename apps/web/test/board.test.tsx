import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board, BoardSkeleton, ColumnShell, ProjectFunnel } from "@/components/board";
import { DEFAULT_FILTERS } from "@/lib/card-filters";
import { api } from "@/lib/api";
import { card, column } from "./fixtures";

const makeState = (over: Record<string, unknown> = {}) => {
  const state = {
    board: null,
    error: null,
    reload: vi.fn(),
    setColumns: vi.fn(),
    guard: vi.fn((p: Promise<unknown>) => p),
    actions: { toggleItem: vi.fn(), addItem: vi.fn(), deleteCard: vi.fn(), addCard: vi.fn(async () => {}) },
    ...over,
  };
  return state as never;
};

const cols = [
  column({ id: "c1", title: "Бэклог", wipLimit: 1, cards: [card({ id: "a", title: "Первая", position: 1, columnId: "c1" }), card({ id: "b", number: 2, title: "Вторая", position: 2, columnId: "c1" })] }),
  column({ id: "c2", title: "В работе", cards: [card({ id: "d", number: 3, title: "Третья", position: 5, columnId: "c2" })] }),
  column({ id: "c3", title: "Готово", cards: [] }),
];

describe("column shell and funnel", () => {
  it("flags a column over its WIP limit", () => {
    render(<ColumnShell title="Работа" color="#123" count={4} wipLimit={3}>x</ColumnShell>);
    expect(screen.getByText("4 из 3")).toBeInTheDocument();
    expect(screen.getByTitle("Лимит 3")).toHaveClass("text-danger");
  });

  it("offers add and menu actions only when given", async () => {
    const onAdd = vi.fn();
    const onMenu = vi.fn();
    const { rerender } = render(<ColumnShell title="К" color="#123" count={0}>x</ColumnShell>);
    expect(screen.queryByTitle("Добавить карточку")).toBeNull();
    rerender(<ColumnShell title="К" color="#123" count={0} highlighted onAdd={onAdd} menu={[{ label: "Правка", onClick: onMenu }]}>x</ColumnShell>);
    await userEvent.click(screen.getByTitle("Добавить карточку"));
    expect(onAdd).toHaveBeenCalled();
    await userEvent.click(screen.getByTitle("Действия"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Правка" }));
    expect(onMenu).toHaveBeenCalled();
  });

  it("the funnel sums up progress and hides on an empty board", () => {
    const { container, rerender } = render(<ProjectFunnel columns={[column({ cards: [] })]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ProjectFunnel columns={cols} />);
    expect(screen.getByText("0 из 3 готово")).toBeInTheDocument();
    expect(screen.getByTitle(/Бэклог: 2/)).toBeInTheDocument();
    render(<BoardSkeleton />);
    expect(screen.getByLabelText("Загрузка доски")).toBeInTheDocument();
  });
});

describe("kanban board", () => {
  const renderBoard = (over: Partial<React.ComponentProps<typeof Board>> = {}, state = makeState()) =>
    render(<Board boardId="b1" columns={cols} state={state} filters={DEFAULT_FILTERS} onOpenCard={() => {}} {...over} />) && state;

  it("shows a lane per column with its cards, and opens a card", async () => {
    const onOpen = vi.fn();
    renderBoard({ onOpenCard: onOpen });
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["Бэклог", "В работе", "Готово"]);
    await userEvent.click(screen.getByText("Третья"));
    expect(onOpen).toHaveBeenCalledWith("d");
    expect(screen.getByText("2 из 1")).toBeInTheDocument(); // Backlog is over its limit
  });

  it("hides cards that don't match the filters", () => {
    renderBoard({ filters: { ...DEFAULT_FILTERS, q: "перв" } });
    expect(screen.getByText("Первая")).toBeInTheDocument();
    expect(screen.queryByText("Вторая")).toBeNull();
  });

  it("adds a card with Enter, ignores blanks, and closes on Escape or an empty blur", async () => {
    const state = makeState();
    renderBoard({}, state);
    await userEvent.click(within(screen.getByRole("region", { name: "В работе" })).getByTitle("Добавить карточку"));
    const box = screen.getByLabelText("Название карточки");
    await userEvent.type(box, "   {Enter}");
    expect(state.actions.addCard).not.toHaveBeenCalled();
    await userEvent.type(box, "Новая задача{Enter}");
    await waitFor(() => expect(state.actions.addCard).toHaveBeenCalledWith("c2", "Новая задача"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Название карточки")).toBeNull();
    await userEvent.click(within(screen.getByRole("region", { name: "В работе" })).getByTitle("Добавить карточку"));
    fireEvent.blur(screen.getByLabelText("Название карточки"));
    expect(screen.queryByLabelText("Название карточки")).toBeNull();
  });

  it("renames a column and sets its limit", async () => {
    const state = makeState();
    renderBoard({}, state);
    const lane = screen.getByRole("region", { name: "В работе" });
    await userEvent.click(within(lane).getByTitle("Действия"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Переименовать и задать лимит" }));
    const name = screen.getByLabelText("Название колонки");
    await userEvent.clear(name);
    await userEvent.type(name, "Делаем");
    await userEvent.type(screen.getByLabelText("Лимит карточек"), "3");
    const update = vi.spyOn(api, "updateColumn").mockResolvedValue(column());
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(update).toHaveBeenCalledWith("c2", { title: "Делаем", wipLimit: 3 });
    expect(state.setColumns).toHaveBeenCalled();

    await userEvent.click(within(lane).getByTitle("Действия"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Переименовать и задать лимит" }));
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByLabelText("Название колонки")).toBeNull();
  });

  it("adds a column", async () => {
    const state = makeState();
    const add = vi.spyOn(api, "addColumn").mockResolvedValue(column({ id: "c9", title: "Тест" }));
    renderBoard({}, state);
    await userEvent.click(screen.getByRole("button", { name: /Колонка/ }));
    await userEvent.type(screen.getByLabelText("Название колонки"), "Тест{Enter}");
    await waitFor(() => expect(add).toHaveBeenCalledWith("b1", "Тест"));
    expect(state.setColumns).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Колонка/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Колонка/ })).toBeInTheDocument();
  });

  it("drags a card to another column and saves the new position", () => {
    const state = makeState();
    const move = vi.spyOn(api, "moveCard").mockResolvedValue(card());
    renderBoard({}, state);
    const dragged = screen.getByText("Первая").closest("[draggable]")!;
    fireEvent.dragStart(dragged);
    fireEvent.dragOver(screen.getByRole("region", { name: "Готово" }));
    fireEvent.drop(screen.getByRole("region", { name: "Готово" }));
    expect(move).toHaveBeenCalledWith("a", "c3", 1);
    expect(state.setColumns).toHaveBeenCalled();
    const update = vi.mocked(state.setColumns).mock.calls[0][0] as (c: typeof cols) => typeof cols;
    const next = update(cols);
    expect(next[0].cards.map((c) => c.id)).toEqual(["b"]);
    expect(next[2].cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("drops between cards: the position is the average of the neighbours", () => {
    const state = makeState();
    const move = vi.spyOn(api, "moveCard").mockResolvedValue(card());
    renderBoard({}, state);
    fireEvent.dragStart(screen.getByText("Первая").closest("[draggable]")!);
    fireEvent.drop(screen.getByText("Третья").closest("[draggable]")!); // onto the only card of column 2
    expect(move).toHaveBeenCalledWith("a", "c2", 4); // before position 5, after nothing → 5 - 1
  });

  it("moves to the end when a filter or sort is on, and ignores same-column drops then", () => {
    const move = vi.spyOn(api, "moveCard").mockResolvedValue(card());
    const { unmount } = render(<Board boardId="b1" columns={cols} state={makeState()} filters={{ ...DEFAULT_FILTERS, sort: "due" }} onOpenCard={() => {}} />);
    fireEvent.dragStart(screen.getByText("Первая").closest("[draggable]")!);
    fireEvent.drop(screen.getByRole("region", { name: "В работе" }));
    expect(move).toHaveBeenCalledWith("a", "c2", 6);
    move.mockClear();
    fireEvent.dragStart(screen.getByText("Вторая").closest("[draggable]")!);
    fireEvent.drop(screen.getByRole("region", { name: "Бэклог" }));
    expect(move).not.toHaveBeenCalled();
    unmount();
  });

  it("ends a drag cleanly when dropped nowhere or released", () => {
    const move = vi.spyOn(api, "moveCard");
    renderBoard();
    const dragged = screen.getByText("Первая").closest("[draggable]")!;
    fireEvent.dragStart(dragged);
    fireEvent.dragEnd(dragged);
    fireEvent.drop(screen.getByRole("region", { name: "Готово" })); // nothing is being dragged
    expect(move).not.toHaveBeenCalled();
  });

  it("selection mode toggles cards instead of opening them", async () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    renderBoard({ selected: new Set(["a"]), onToggleSelect: onToggle, onOpenCard: onOpen });
    await userEvent.click(screen.getByText("Вторая"));
    expect(onToggle).toHaveBeenCalledWith("b");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
