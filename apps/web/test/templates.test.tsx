import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TemplatesPage from "@/app/settings/templates/page";
import TemplateEditorPage from "@/app/settings/templates/[id]/page";
import { api } from "@/lib/api";
import { member, user } from "./fixtures";
import { nav } from "./nav";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const admin = () => vi.spyOn(api, "me").mockResolvedValue(user());
const detail = {
  id: "t1", name: "Типовой", columns: ["Бэклог", "Готово"],
  cards: [
    { id: "k1", title: "Бриф", typeId: "tt2", estimateHours: 3, checklist: ["встреча", "цели"], description: "Описание", position: 1 },
    { id: "k2", title: "Запуск", typeId: "tt1", estimateHours: null, checklist: [], description: null, position: 2 },
  ],
};

describe("templates list", () => {
  it("lists templates with stages and card counts", async () => {
    admin();
    vi.spyOn(api, "settings").mockResolvedValue({ workspaceName: "К", cardPrefix: "TSK", defaultColumns: ["А"] } as never);
    vi.spyOn(api, "templates").mockResolvedValue([{ id: "t1", name: "Типовой", columns: ["Бэклог", "Готово"], _count: { cards: 7 } }, { id: "t2", name: "Пустой", columns: ["А"], _count: { cards: 1 } }] as never);
    render(<TemplatesPage />);
    expect(await screen.findByText("Типовой")).toBeInTheDocument();
    expect(screen.getByText("7 карточек")).toBeInTheDocument();
    expect(screen.getByText("1 карточка")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Типовой/ })).toHaveAttribute("href", "/settings/templates/t1");
    expect(await screen.findByRole("link", { name: /Новый шаблон/ })).toHaveAttribute("href", "/settings/templates/new");
  });

  it("explains an empty list and hides creation from those without the right", async () => {
    vi.spyOn(api, "me").mockResolvedValue(member({ permissions: [] }));
    vi.spyOn(api, "templates").mockRejectedValue(new Error("x"));
    render(<TemplatesPage />);
    expect(await screen.findByText("Шаблонов пока нет")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Новый шаблон/ })).toBeNull();
  });
});

describe("template editor", () => {
  it("creates a template with stages and cards", async () => {
    admin();
    const create = vi.spyOn(api, "createTemplate").mockResolvedValue({ id: "new1" });
    render(<TemplateEditorPage params={{ id: "new" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Создать шаблон" }));
    expect(await screen.findByText("Укажите название шаблона")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Название шаблона"), "Магазин");
    await userEvent.type(screen.getByLabelText("Новый этап"), "Приёмка{enter}");
    await userEvent.click(screen.getByRole("button", { name: /Карточка/ }));
    await userEvent.click(screen.getByRole("button", { name: "Создать шаблон" }));
    expect(await screen.findByText("У каждой карточки должно быть название")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Название"), "Бриф");
    await userEvent.selectOptions(screen.getByLabelText("Тип"), "tt2");
    await userEvent.type(screen.getByLabelText("Оценка, ч"), "3");
    await userEvent.type(screen.getByLabelText("Описание"), " текст ");
    await userEvent.type(screen.getByLabelText("Чек-лист"), "а{enter}{enter}б");
    await userEvent.click(screen.getByRole("button", { name: "Создать шаблон" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      name: "Магазин", columns: ["Бэклог", "В работе", "На проверке", "Готово", "Приёмка"],
      cards: [{ title: "Бриф", typeId: "tt2", estimateHours: 3, description: "текст", checklist: ["а", "б"] }],
    }));
    expect(nav.router.replace).toHaveBeenCalledWith("/settings/templates/new1");
  });

  it("reorders and removes stages, needing at least one", async () => {
    admin();
    render(<TemplateEditorPage params={{ id: "new" }} />);
    await screen.findByLabelText("Этап 1");
    await userEvent.click(screen.getAllByTitle("Ниже")[0]);
    expect(screen.getByLabelText("Этап 1")).toHaveValue("В работе");
    await userEvent.click(screen.getAllByTitle("Выше")[1]);
    expect(screen.getByLabelText("Этап 1")).toHaveValue("Бэклог");
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getAllByTitle("Убрать этап")[0]);
    expect(screen.getByTitle("Нужен хотя бы один этап")).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Этап 1"));
    await userEvent.type(screen.getByLabelText("Название шаблона"), "Х");
    await userEvent.click(screen.getByRole("button", { name: "Создать шаблон" }));
    expect(await screen.findByText("Нужен хотя бы один этап", { selector: "p" })).toBeInTheDocument();
  });

  it("edits an existing template: dirty tracking, card reordering and saving", async () => {
    admin();
    vi.spyOn(api, "template").mockResolvedValue(detail as never);
    const save = vi.spyOn(api, "saveTemplate").mockResolvedValue({} as never);
    render(<TemplateEditorPage params={{ id: "t1" }} />);
    expect(await screen.findByDisplayValue("Типовой")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Сохранить" });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText("3 ч, 2 пункта")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Бриф"));
    expect(screen.getByLabelText("Чек-лист")).toHaveValue("встреча\nцели");
    await userEvent.click(screen.getAllByTitle("Ниже")[screen.getAllByTitle("Ниже").length - 2]); // move the first card down
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);
    await waitFor(() => expect(save).toHaveBeenCalledWith("t1", expect.objectContaining({ cards: [expect.objectContaining({ title: "Запуск" }), expect.objectContaining({ title: "Бриф", checklist: ["встреча", "цели"] })] })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled());
  });

  it("collapses a card editor and removes a card", async () => {
    admin();
    vi.spyOn(api, "template").mockResolvedValue(detail as never);
    render(<TemplateEditorPage params={{ id: "t1" }} />);
    await screen.findByDisplayValue("Типовой");
    await userEvent.click(screen.getByText("Бриф"));
    expect(screen.getByLabelText("Оценка, ч")).toBeInTheDocument();
    await userEvent.click(screen.getAllByLabelText("Свернуть")[0]);
    expect(screen.queryByLabelText("Оценка, ч")).toBeNull();
    fireEvent.click(screen.getAllByTitle("Убрать карточку")[0]);
    expect(screen.queryByText("Бриф")).toBeNull();
    fireEvent.click(screen.getAllByTitle("Убрать карточку")[0]);
    expect(screen.getByText(/Карточек нет/)).toBeInTheDocument();
  });

  it("shows a save error", async () => {
    admin();
    vi.spyOn(api, "template").mockResolvedValue(detail as never);
    vi.spyOn(api, "saveTemplate").mockRejectedValue(new Error("Нет права: «Создавать и менять шаблоны»"));
    render(<TemplateEditorPage params={{ id: "t1" }} />);
    const name = await screen.findByDisplayValue("Типовой");
    await userEvent.type(name, "!");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText(/Нет права/)).toBeInTheDocument();
  });

  it("deletes after confirmation, and reports a refusal", async () => {
    admin();
    vi.spyOn(api, "template").mockResolvedValue(detail as never);
    const del = vi.spyOn(api, "deleteTemplate").mockRejectedValueOnce(new Error("Нельзя")).mockResolvedValue(undefined);
    render(<TemplateEditorPage params={{ id: "t1" }} />);
    await screen.findByDisplayValue("Типовой");
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить шаблон" }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить шаблон" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/settings/templates"));
  });

  it("is read-only for people without the right, and shows a load error", async () => {
    vi.spyOn(api, "me").mockResolvedValue(member({ permissions: [] }));
    vi.spyOn(api, "template").mockResolvedValue(detail as never);
    const first = render(<TemplateEditorPage params={{ id: "t1" }} />);
    expect(await screen.findByText("Редактировать шаблоны может администратор.")).toBeInTheDocument();
    expect(screen.getByLabelText("Название шаблона")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    first.unmount();
    admin();
    vi.spyOn(api, "template").mockRejectedValue(new Error("Шаблон не найден"));
    render(<TemplateEditorPage params={{ id: "zzz" }} />);
    expect(await screen.findByText("Шаблон не найден")).toBeInTheDocument();
  });
});
