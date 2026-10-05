import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardToolbar, plural } from "@/components/board-toolbar";
import { BulkBar } from "@/components/bulk-bar";
import { CardsList, CardsTable } from "@/components/cards-views";
import { DEFAULT_FILTERS } from "@/lib/card-filters";
import { api } from "@/lib/api";
import { onToast } from "@/lib/toast";
import { card, column, member, taskType, taskTypes, user } from "./fixtures";

describe("plural", () => {
  it("picks the Russian form", () => {
    const f = (n: number) => plural(n, "карточка", "карточки", "карточек");
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(f)).toEqual(["карточка", "карточки", "карточек", "карточек", "карточек", "карточка", "карточки", "карточек", "карточек"]);
  });
});

describe("board toolbar", () => {
  const users = [user(), member()];

  it("changes the date scope and counts cards", async () => {
    vi.spyOn(api, "labels").mockResolvedValue([]);
    const onChange = vi.fn();
    render(<BoardToolbar filters={DEFAULT_FILTERS} onChange={onChange} users={users} shown={3} />);
    await userEvent.click(screen.getByRole("tab", { name: "Просрочено" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, date: "overdue" });
    expect(screen.getByText("3 карточки")).toBeInTheDocument();
  });

  it("searches the board as you type", async () => {
    vi.spyOn(api, "labels").mockResolvedValue([]);
    const onChange = vi.fn();
    render(<BoardToolbar filters={DEFAULT_FILTERS} onChange={onChange} users={users} />);
    await userEvent.type(screen.getByLabelText("Найти карточку на доске"), "б");
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, q: "б" });
  });

  it("filters by person, label, type and priority, and shows removable chips", async () => {
    vi.spyOn(api, "labels").mockResolvedValue([{ id: "l1", name: "Срочно", color: "red" }]);
    vi.spyOn(api, "taskTypes").mockResolvedValue(taskTypes());
    const onChange = vi.fn();
    const { rerender } = render(<BoardToolbar filters={DEFAULT_FILTERS} onChange={onChange} users={users} />);
    await userEvent.click(screen.getByRole("button", { name: /Фильтр/ }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Анна Смирнова/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, assigneeIds: ["u2"] });
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /Срочно/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, labelIds: ["l1"] });
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /Ошибка/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, types: ["tt2"] });
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Высокий" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, priorities: ["HIGH"] });

    const active = { ...DEFAULT_FILTERS, assigneeIds: ["u2"], labelIds: ["l1"], types: ["tt2"], priorities: ["HIGH" as const] };
    rerender(<BoardToolbar filters={active} onChange={onChange} users={users} />);
    expect((await screen.findAllByText("Анна Смирнова")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Срочно").length).toBeGreaterThan(0);
    expect(screen.getByText("Приоритет высокий")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Убрать фильтр Анна Смирнова"));
    expect(onChange).toHaveBeenLastCalledWith({ ...active, assigneeIds: [] });
    await userEvent.click(screen.getByLabelText("Убрать фильтр Ошибка"));
    await userEvent.click(screen.getByLabelText("Убрать фильтр Срочно"));
    await userEvent.click(screen.getByLabelText("Убрать фильтр Приоритет высокий"));
    await userEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...active, assigneeIds: [], types: [], priorities: [], labelIds: [] });
    // toggling off a chosen value
    await userEvent.click(screen.getByRole("button", { name: /Фильтр/ }));
    await userEvent.click(screen.getAllByRole("menuitemcheckbox", { name: /Анна Смирнова/ })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ ...active, assigneeIds: [] });
  });

  it("sorts", async () => {
    vi.spyOn(api, "labels").mockResolvedValue([]);
    const onChange = vi.fn();
    render(<BoardToolbar filters={DEFAULT_FILTERS} onChange={onChange} users={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /Сортировка/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "По сроку" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, sort: "due" });
  });

  it("names the active sort on its button", () => {
    vi.spyOn(api, "labels").mockResolvedValue([]);
    render(<BoardToolbar filters={{ ...DEFAULT_FILTERS, sort: "priority" }} onChange={() => {}} users={[]} />);
    expect(screen.getByRole("button", { name: /По приоритету/ })).toBeInTheDocument();
  });
});

describe("bulk bar", () => {
  const columns = [column({ id: "c1", title: "Бэклог" }), column({ id: "c2", title: "Готово" })];
  const setup = (props: Partial<React.ComponentProps<typeof BulkBar>> = {}, admin = true) => {
    vi.spyOn(api, "me").mockResolvedValue(admin ? user() : user({ role: "MEMBER", permissions: [] }));
    const onDone = vi.fn();
    const onClear = vi.fn();
    const bulk = vi.spyOn(api, "bulkCards").mockResolvedValue({ count: 2 });
    render(<BulkBar ids={["a", "b"]} columns={columns} users={[user(), member()]} onDone={onDone} onClear={onClear} {...props} />);
    return { onDone, onClear, bulk };
  };

  it("moves the selection to a column", async () => {
    const { bulk, onDone } = setup();
    expect(screen.getByText("Выбрано 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Перенести/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Готово" }));
    await waitFor(() => expect(bulk).toHaveBeenCalledWith(["a", "b"], "move", { columnId: "c2" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("assigns, unassigns, sets priority and due date, or removes the date", async () => {
    const { bulk } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Исполнитель/ }));
    await userEvent.click(screen.getAllByRole("menuitem", { name: /Анна Смирнова/ })[0]);
    await waitFor(() => expect(bulk).toHaveBeenLastCalledWith(["a", "b"], "assign", { userIds: ["u2"] }));
    await userEvent.click(screen.getByRole("button", { name: /Исполнитель/ }));
    await userEvent.click(screen.getAllByRole("menuitem", { name: /Анна Смирнова/ })[1]);
    await waitFor(() => expect(bulk).toHaveBeenLastCalledWith(["a", "b"], "unassign", { userIds: ["u2"] }));
    await userEvent.click(screen.getByRole("button", { name: /Приоритет/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Высокий" }));
    await waitFor(() => expect(bulk).toHaveBeenLastCalledWith(["a", "b"], "priority", { priority: "HIGH" }));

    await userEvent.click(screen.getByRole("button", { name: /Срок/ }));
    expect(screen.getByRole("button", { name: "Поставить" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Новый срок"), { target: { value: "2026-12-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Поставить" }));
    await waitFor(() => expect(bulk).toHaveBeenLastCalledWith(["a", "b"], "due", { dueDate: "2026-12-01" }));
    await userEvent.click(screen.getByRole("button", { name: /Срок/ }));
    await userEvent.click(screen.getByRole("button", { name: "Убрать срок" }));
    await waitFor(() => expect(bulk).toHaveBeenLastCalledWith(["a", "b"], "due", { dueDate: null }));
  });

  it("deletes only after confirmation, and only for people who may", async () => {
    const { bulk, onClear } = setup({ ids: ["a"] });
    await userEvent.click(await screen.findByRole("button", { name: /Удалить/ }));
    expect(screen.getByRole("alertdialog", { name: "Удалить 1 карточку?" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: /Удалить 1 карточку/ }));
    await waitFor(() => expect(bulk).toHaveBeenCalledWith(["a"], "delete", {}));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it("hides delete without the right, clears with Esc or the button, and reports failures", async () => {
    const { onClear } = setup({}, false);
    await waitFor(() => expect(api.me).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Удалить/ })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByLabelText("Снять выделение"));
    expect(onClear).toHaveBeenCalledTimes(2);
    vi.mocked(api.bulkCards).mockRejectedValue(new Error("Тариф закончился"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    await userEvent.click(screen.getByRole("button", { name: /Приоритет/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Низкий" }));
    await waitFor(() => expect(messages).toContain("Тариф закончился"));
  });
});

describe("table and list views", () => {
  const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const cols = [
    column({ id: "c1", title: "Бэклог", cards: [
      card({ id: "a", title: "Бриф", dueDate: "2000-01-01T00:00:00Z", assignees: [{ user: { id: "u1", name: "Иван" } }], priority: "HIGH", checklist: [{ id: "i", text: "x", done: true }, { id: "j", text: "y", done: false }] }),
      card({ id: "b", number: 2, title: "План", dueDate: tomorrow, type: taskType({ id: "tt2", name: "Ошибка", color: "red" }), priority: "LOW" }),
    ] }),
    column({ id: "c2", title: "Готово", cards: [card({ id: "d", number: 3, title: "Сдано", columnId: "c2", checklist: [{ id: "k", text: "x", done: true }] })] }),
  ];

  it("lists every card with status, priority, people, due date and progress", async () => {
    const onOpen = vi.fn();
    render(<CardsTable columns={cols} filters={DEFAULT_FILTERS} onOpenCard={onOpen} />);
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("Бриф")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByText("План"));
    expect(onOpen).toHaveBeenCalledWith("b");
  });

  it("selects rows with checkboxes, 'select all', and by clicking once a selection exists", async () => {
    const onToggle = vi.fn();
    const onAll = vi.fn();
    const { rerender } = render(<CardsTable columns={cols} filters={DEFAULT_FILTERS} onOpenCard={() => {}} selected={new Set()} onToggleSelect={onToggle} onSelectAll={onAll} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Выбрать все" }));
    expect(onAll).toHaveBeenCalledWith(["a", "b", "d"], true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Выбрать TSK-1" }));
    expect(onToggle).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByText("План"), { shiftKey: true });
    expect(onToggle).toHaveBeenCalledWith("b");
    rerender(<CardsTable columns={cols} filters={DEFAULT_FILTERS} onOpenCard={() => {}} selected={new Set(["a", "b", "d"])} onToggleSelect={onToggle} onSelectAll={onAll} />);
    expect(screen.getByRole("checkbox", { name: "Выбрать все" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByText("Сдано"));
    expect(onToggle).toHaveBeenCalledWith("d"); // selection mode: click toggles
  });

  it("says when there are no cards", () => {
    render(<CardsTable columns={[column()]} filters={DEFAULT_FILTERS} onOpenCard={() => {}} />);
    expect(screen.getByText("Карточек пока нет")).toBeInTheDocument();
  });

  it("groups cards by column in the list view and applies the filters", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(<CardsList columns={cols} filters={DEFAULT_FILTERS} onOpenCard={onOpen} />);
    expect(screen.getByRole("heading", { name: "Бэклог" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Готово" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Бриф"));
    expect(onOpen).toHaveBeenCalledWith("a");
    rerender(<CardsList columns={cols} filters={{ ...DEFAULT_FILTERS, q: "сдано" }} onOpenCard={onOpen} />);
    expect(screen.queryByText("Бриф")).toBeNull();
    expect(screen.getByText("Пусто")).toBeInTheDocument();
  });
});
