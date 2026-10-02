import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "@/app/projects/[id]/settings/page";
import { api } from "@/lib/api";
import { card, column, member, user } from "./fixtures";
import { nav } from "./nav";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/recurring-dialog", () => ({
  RecurringDialog: (p: { onClose: () => void; onSaved: () => void; rule?: { title: string } }) => (
    <div>
      dialog {p.rule?.title ?? "new"}
      <button onClick={() => { p.onSaved(); p.onClose(); }}>dlg-save</button>
    </div>
  ),
}));

const proj = (over = {}) => ({ id: "p1", title: "Сайт", status: "ACTIVE", startDate: "2026-10-01T00:00:00Z", deadline: null, hoursBudget: 40, board: { id: "b1" }, ...over });
const rule = (over = {}) => ({ id: "r1", title: "Отчёт", active: true, assigneeIds: ["u1"], nextRunAt: "2026-10-20T06:00:00Z", frequency: "WEEKLY", interval: 1, weekdays: [1], ...over });

function setup(opts: { me?: ReturnType<typeof user>; project?: object; cols?: ReturnType<typeof column>[]; rules?: object[] } = {}) {
  vi.spyOn(api, "me").mockResolvedValue(opts.me ?? user());
  vi.spyOn(api, "project").mockResolvedValue((opts.project ?? proj()) as never);
  vi.spyOn(api, "projectBoard").mockResolvedValue({ id: "b1", columns: opts.cols ?? [column({ id: "a", title: "Бэклог", position: 1 }), column({ id: "b", title: "Готово", position: 2, cards: [card()] })] } as never);
  vi.spyOn(api, "users").mockResolvedValue([user(), member({ isActive: false })]);
  vi.spyOn(api, "recurring").mockResolvedValue((opts.rules ?? []) as never);
}

describe("project settings", () => {
  it("saves details, validates and resets", async () => {
    setup();
    const update = vi.spyOn(api, "updateProject").mockResolvedValue({} as never);
    render(<Page params={{ id: "p1" }} />);
    const title = await screen.findByLabelText("Название");
    const save = screen.getAllByRole("button", { name: "Сохранить" })[0];
    expect(save).toBeDisabled();
    await userEvent.clear(title);
    await userEvent.click(save);
    expect(await screen.findByText("Укажите название проекта")).toBeInTheDocument();
    await userEvent.type(title, "Новый");
    await userEvent.type(screen.getByLabelText("Дедлайн"), "2026-09-01");
    await userEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    expect(await screen.findByText("Дедлайн раньше даты старта")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Отменить изменения" }));
    expect(screen.getByLabelText("Название")).toHaveValue("Сайт");
    await userEvent.clear(screen.getByLabelText("Бюджет, часов"));
    await userEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith("p1", expect.objectContaining({ hoursBudget: null, title: "Сайт" })));
  });

  it("shows server error on save", async () => {
    setup();
    vi.spyOn(api, "updateProject").mockRejectedValue(new Error("Отказано"));
    render(<Page params={{ id: "p1" }} />);
    await userEvent.selectOptions(await screen.findByLabelText("Статус"), "ON_HOLD");
    await userEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    expect(await screen.findByText("Отказано")).toBeInTheDocument();
  });

  it("warns users without the edit right", async () => {
    setup({ me: member({ permissions: [] }) });
    render(<Page params={{ id: "p1" }} />);
    expect(await screen.findByText(/Менять проект может сотрудник/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить проект" })).toBeDisabled();
    expect(screen.getByText(/Нет права удалять проекты/)).toBeInTheDocument();
  });

  it("edits stages: rename, limit, move, add, delete", async () => {
    setup({ cols: [column({ id: "a", title: "Бэклог", position: 1 }), column({ id: "b", title: "Готово", position: 2, cards: [card()] }), column({ id: "c", title: "Архив", position: 3 })] });
    const update = vi.spyOn(api, "updateColumn").mockResolvedValue(column());
    const add = vi.spyOn(api, "addColumn").mockResolvedValue(column());
    const del = vi.spyOn(api, "deleteColumn").mockResolvedValue(undefined as never);
    render(<Page params={{ id: "p1" }} />);
    const first = await screen.findByLabelText("Название этапа 1");
    await userEvent.clear(first);
    await userEvent.type(first, "Очередь{enter}");
    await waitFor(() => expect(update).toHaveBeenCalledWith("a", { title: "Очередь" }));
    const second = screen.getByLabelText("Название этапа 2");
    await userEvent.clear(second);
    fireEvent.blur(second);
    expect(second).toHaveValue("Готово");
    const limit = screen.getByLabelText("Лимит карточек этапа Бэклог");
    await userEvent.type(limit, "5");
    fireEvent.blur(limit);
    await waitFor(() => expect(update).toHaveBeenCalledWith("a", { wipLimit: 5 }));
    await userEvent.click(screen.getAllByTitle("Ниже")[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith("b", { position: 1 }));
    await userEvent.click(screen.getByTitle("Сначала перенесите карточки из этапа"));
    await userEvent.click(screen.getAllByTitle("Удалить этап")[0]);
    await waitFor(() => expect(del).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /Добавить этап/ }));
    await userEvent.type(screen.getByLabelText("Новый этап"), "Тест{enter}");
    await waitFor(() => expect(add).toHaveBeenCalledWith("b1", "Тест"));
  });

  it("manages recurring rules", async () => {
    setup({ rules: [rule(), rule({ id: "r2", title: "Пауза", active: false, assigneeIds: [] })] });
    const run = vi.spyOn(api, "runRecurring").mockResolvedValue(undefined as never);
    const toggle = vi.spyOn(api, "toggleRecurring").mockResolvedValue(undefined as never);
    const remove = vi.spyOn(api, "deleteRecurring").mockResolvedValue(undefined as never);
    render(<Page params={{ id: "p1" }} />);
    expect(await screen.findByText("Отчёт")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Создать сейчас" })[0]);
    await waitFor(() => expect(run).toHaveBeenCalledWith("r1"));
    await userEvent.click(screen.getByRole("button", { name: "Пауза" }));
    await waitFor(() => expect(toggle).toHaveBeenCalledWith("r1", false));
    await userEvent.click(screen.getByRole("button", { name: "Включить" }));
    await waitFor(() => expect(toggle).toHaveBeenCalledWith("r2", true));
    await userEvent.click(screen.getByRole("button", { name: /Новое правило/ }));
    expect(screen.getByText("dialog new")).toBeInTheDocument();
    await userEvent.click(screen.getByText("dlg-save"));
    await userEvent.click(screen.getByText("Отчёт"));
    expect(screen.getByText("dialog Отчёт")).toBeInTheDocument();
    await userEvent.click(screen.getByText("dlg-save"));
    await userEvent.click(screen.getAllByTitle("Удалить правило")[0]);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Удалить правило" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("r1"));
  });

  it("shows an empty rule hint and tolerates rule errors", async () => {
    setup();
    vi.spyOn(api, "recurring").mockRejectedValue(new Error("x"));
    render(<Page params={{ id: "p1" }} />);
    expect(await screen.findByText(/Правил нет/)).toBeInTheDocument();
  });

  it("saves the project as a template", async () => {
    setup();
    const create = vi.spyOn(api, "templateFromProject").mockResolvedValue({ id: "t9" });
    render(<Page params={{ id: "p1" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Создать шаблон" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("p1", "Сайт"));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/settings/templates/t9"));
  });

  it("survives a template error", async () => {
    setup();
    vi.spyOn(api, "templateFromProject").mockRejectedValue(new Error("нет"));
    render(<Page params={{ id: "p1" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Создать шаблон" }));
    await waitFor(() => expect(nav.router.push).not.toHaveBeenCalled());
  });

  it("archives, restores and deletes", async () => {
    setup();
    const update = vi.spyOn(api, "updateProject").mockResolvedValue({} as never);
    const del = vi.spyOn(api, "deleteProject").mockResolvedValue(undefined as never);
    render(<Page params={{ id: "p1" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "В архив" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("p1", { status: "ARCHIVED" }));
    await userEvent.click(screen.getByRole("button", { name: "Удалить проект" }));
    const dlg = await screen.findByRole("alertdialog");
    await userEvent.click(within(dlg).getByRole("button", { name: "Удалить проект" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/projects"));
    expect(del).toHaveBeenCalledWith("p1");
  });

  it("restores an archived project and keeps the dialog on delete failure", async () => {
    setup({ project: proj({ status: "ARCHIVED" }) });
    const update = vi.spyOn(api, "updateProject").mockResolvedValue({} as never);
    vi.spyOn(api, "deleteProject").mockRejectedValue(new Error("нельзя"));
    render(<Page params={{ id: "p1" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Вернуть" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("p1", { status: "ACTIVE" }));
    await userEvent.click(screen.getByRole("button", { name: "Удалить проект" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Удалить проект" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(nav.router.replace).not.toHaveBeenCalled();
  });
});
