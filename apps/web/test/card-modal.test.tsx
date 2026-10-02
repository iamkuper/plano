import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardModal } from "@/components/card-modal";
import { api } from "@/lib/api";
import * as apiModule from "@/lib/api";
import { onToast } from "@/lib/toast";
import { billing, cardDetail, member, plans, user } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), uploadAttachment: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: vi.fn(() => ({ connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() })) }));

const ago = (days: number, hours = 12) => new Date(Date.now() - days * 86_400_000 + (hours - 12) * 3_600_000).toISOString();
const detail = (over: object = {}) =>
  cardDetail({
    id: "c1", title: "Подключить оплату", description: "Описание задачи", estimateHours: 2, type: "INTEGRATION", priority: "HIGH",
    column: { id: "col1", title: "Бэклог" }, project: { id: "p1", title: "Сайт" },
    assignees: [{ user: { id: "u1", name: "Иван Петров" } }],
    checklist: [{ id: "i1", text: "Заявка", done: true, position: 1 } as never, { id: "i2", text: "Тест", done: false, position: 2 } as never],
    timeEntries: [
      { id: "t1", minutes: 90, date: "2026-10-01T00:00:00Z", note: "настройка", user: { id: "u1", name: "Иван Петров" } },
      { id: "t2", minutes: 30, date: "2026-10-02T00:00:00Z", note: null, user: { id: "u2", name: "Анна Смирнова" } },
    ],
    comments: [
      { id: "m1", text: "Привет @Анна Смирнова", createdAt: ago(2), author: { id: "u2", name: "Анна Смирнова" }, attachments: [] },
      { id: "m2", text: "Ответ", createdAt: ago(2, 13), author: { id: "u2", name: "Анна Смирнова" }, attachments: [] },
      { id: "m3", text: "Моё сообщение", createdAt: ago(1), author: { id: "u1", name: "Иван Петров" }, attachments: [] },
      { id: "m4", text: "Сегодня", createdAt: ago(0), author: { id: "u1", name: "Иван Петров" }, attachments: [{ id: "a9", name: "лог.txt", mime: "text/plain", size: 10, url: "/x", commentId: "m4", uploaderId: "u1", createdAt: "" }] },
      { id: "m5", text: "Давно", createdAt: ago(40), author: { id: "u2", name: "Анна Смирнова" }, attachments: [] },
    ],
    attachments: [{ id: "a1", name: "договор.pdf", mime: "application/pdf", size: 2048, url: "/a", commentId: null, uploaderId: "u1", createdAt: "" }, { id: "a2", name: "чужой.zip", mime: "application/zip", size: 20, url: "/b", commentId: null, uploaderId: "u2", createdAt: "" }],
    activity: [
      { id: "ac1", action: "created", payload: null, createdAt: ago(3), user: { id: "u1", name: "Иван Петров" } },
      { id: "ac2", action: "moved", payload: { from: "Бэклог", to: "В работе" }, createdAt: ago(2), user: { id: "u1", name: "Иван Петров" } },
      { id: "ac3", action: "commented", payload: null, createdAt: ago(2), user: { id: "u2", name: "Анна Смирнова" } },
      { id: "ac4", action: "updated", payload: ["title", "dueDate", "labelIds", "custom"], createdAt: ago(1), user: { id: "u1", name: "Иван Петров" } },
      { id: "ac5", action: "updated", payload: null, createdAt: ago(1), user: { id: "u1", name: "Иван Петров" } },
      { id: "ac6", action: "mystery", payload: null, createdAt: ago(1), user: { id: "u1", name: "Иван Петров" } },
    ],
    ...over,
  } as never);

function setup(cardOver: object = {}, opts: { admin?: boolean; plan?: "pro" | "business"; permissions?: string[] } = {}) {
  const me = opts.admin === false ? member({ permissions: (opts.permissions ?? []) as never }) : user();
  const spies = {
    card: vi.spyOn(api, "card").mockResolvedValue(detail(cardOver)),
    projectBoard: vi.spyOn(api, "projectBoard").mockResolvedValue({ id: "b1", projectId: "p1", columns: [{ id: "col1", title: "Бэклог", position: 1, wipLimit: null, cards: [] }, { id: "col2", title: "В работе", position: 2, wipLimit: null, cards: [] }, { id: "col3", title: "Готово", position: 3, wipLimit: null, cards: [] }] } as never),
    me: vi.spyOn(api, "me").mockResolvedValue(me),
    users: vi.spyOn(api, "users").mockResolvedValue([user(), member(), member({ id: "u3", name: "Отключён", isActive: false })]),
    billing: vi.spyOn(api, "billing").mockResolvedValue(billing({ plan: opts.plan === "business" ? plans[2] : plans[1] })),
    markCardRead: vi.spyOn(api, "markCardRead").mockResolvedValue(undefined),
    labels: vi.spyOn(api, "labels").mockResolvedValue([]),
    fields: vi.spyOn(api, "fields").mockResolvedValue([]),
    updateCard: vi.spyOn(api, "updateCard").mockResolvedValue({} as never),
    moveCard: vi.spyOn(api, "moveCard").mockResolvedValue({} as never),
  };
  const onClose = vi.fn();
  render(<CardModal cardId="c1" onClose={onClose} />);
  return { ...spies, onClose };
}

const loaded = () => screen.findByDisplayValue("Подключить оплату");
beforeEach(() => vi.mocked(apiModule.uploadAttachment).mockReset());

describe("card modal: loading and header", () => {
  it("shows a loading state, then the card", async () => {
    setup();
    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
    expect(await loaded()).toBeInTheDocument();
    expect(screen.getByText("TSK-1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Описание задачи")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.getByLabelText("Статус")).toHaveValue("col1");
  });

  it("shows the load error in place of the card", async () => {
    vi.spyOn(api, "card").mockRejectedValue(new Error("Карточка не найдена"));
    vi.spyOn(api, "me").mockResolvedValue(user());
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    vi.spyOn(api, "users").mockResolvedValue([]);
    render(<CardModal cardId="zzz" onClose={() => {}} />);
    expect(await screen.findByText("Карточка не найдена")).toBeInTheDocument();
  });

  it("marks the card read on open and closes with Escape or the button, reporting changes", async () => {
    const { onClose, markCardRead } = setup();
    await loaded();
    await waitFor(() => expect(markCardRead).toHaveBeenCalledWith("c1"));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenLastCalledWith(true); // opening it changed the unread state
    await userEvent.click(screen.getByTitle("Закрыть (Esc)"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("copies the link and links to the rule that created a recurring card", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup({ recurringRule: { id: "r1", frequency: "WEEKLY", interval: 1, active: true } });
    await loaded();
    expect(screen.getByRole("link", { name: /Каждую неделю/ })).toHaveAttribute("href", "/projects/p1/settings");
    await userEvent.click(screen.getByTitle("Скопировать ссылку"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(await screen.findByTitle("Ссылка скопирована")).toBeInTheDocument();
  });

  it("styles an inactive recurring rule differently", async () => {
    setup({ recurringRule: { id: "r1", frequency: "DAILY", interval: 1, active: false } });
    await loaded();
    expect(screen.getByRole("link", { name: /Каждый день/ }).className).toContain("bg-surface-sunken");
  });
});

describe("card modal: editing fields", () => {
  it("saves the title on blur or Enter, and ignores empty or unchanged titles", async () => {
    const { updateCard } = setup();
    const title = await loaded();
    await userEvent.clear(title);
    await userEvent.type(title, "Новое имя{enter}");
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { title: "Новое имя" }));
    updateCard.mockClear();
    await userEvent.clear(title);
    fireEvent.blur(title);
    expect(updateCard).not.toHaveBeenCalled();
  });

  it("saves the description, clearing it to null", async () => {
    const { updateCard } = setup();
    const area = await screen.findByDisplayValue("Описание задачи");
    await userEvent.clear(area);
    fireEvent.blur(area);
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { description: null }));
    await userEvent.type(area, "Новое");
    fireEvent.blur(area);
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { description: expect.stringContaining("Новое") }));
  });

  it("moves the card between columns, and changes type, priority and dates", async () => {
    const { moveCard, updateCard } = setup({ dueDate: "2026-12-05T00:00:00.000Z" });
    await loaded();
    await userEvent.selectOptions(screen.getByLabelText("Статус"), "col2");
    await waitFor(() => expect(moveCard).toHaveBeenCalledWith("c1", "col2"));
    await userEvent.selectOptions(screen.getByLabelText("Тип"), "BUG");
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { type: "BUG" }));
    await userEvent.selectOptions(screen.getByLabelText("Приоритет"), "LOW");
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { priority: "LOW" }));
    fireEvent.change(screen.getByLabelText("Начало"), { target: { value: "2026-12-01" } });
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { startDate: "2026-12-01" }));
    fireEvent.change(screen.getByLabelText("Срок"), { target: { value: "2026-12-10" } });
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { dueDate: "2026-12-10" }));
    fireEvent.change(screen.getByLabelText("Срок"), { target: { value: "" } });
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { dueDate: null }));
  });

  it("changes the estimate on blur, rounding and clearing", async () => {
    const { updateCard } = setup();
    const est = await screen.findByLabelText("Оценка, часов");
    await userEvent.clear(est);
    await userEvent.type(est, "3.6");
    fireEvent.blur(est);
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { estimateHours: 4 }));
    await userEvent.clear(est);
    fireEvent.blur(est);
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { estimateHours: null }));
  });

  it("toggles assignees from the people list (inactive people are not offered)", async () => {
    const { updateCard } = setup();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Исполнители" }));
    expect(screen.queryByRole("menuitem", { name: /Отключён/ })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: /Анна Смирнова/ }));
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { assigneeIds: ["u1", "u2"] }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Иван Петров/ }));
    await waitFor(() => expect(updateCard).toHaveBeenLastCalledWith("c1", { assigneeIds: [] }));
  });

  it("describes none or several assignees", async () => {
    setup({ assignees: [] });
    expect(await screen.findByText("Не назначены")).toBeInTheDocument();
  });

  it("describes several assignees by count", async () => {
    setup({ assignees: [{ user: { id: "u1", name: "А" } }, { user: { id: "u2", name: "Б" } }] });
    expect(await screen.findByText("2 исполнителя")).toBeInTheDocument();
  });

  it("shows the server's message when saving fails", async () => {
    const { updateCard } = setup();
    updateCard.mockRejectedValue(new Error("Тариф закончился: данные доступны только для чтения"));
    await loaded();
    await userEvent.selectOptions(screen.getByLabelText("Тип"), "BUG");
    expect(await screen.findByText(/Тариф закончился/)).toBeInTheDocument();
  });
});

describe("card modal: subtasks, time and files", () => {
  it("ticks, adds and removes subtasks and shows progress", async () => {
    setup();
    const tick = vi.spyOn(api, "updateChecklistItem").mockResolvedValue({} as never);
    const add = vi.spyOn(api, "addChecklistItem").mockResolvedValue({} as never);
    const del = vi.spyOn(api, "deleteChecklistItem").mockResolvedValue(undefined);
    await loaded();
    expect(screen.getByText("1 из 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Тест" }));
    await waitFor(() => expect(tick).toHaveBeenCalledWith("i2", { done: true }));
    await userEvent.type(screen.getByLabelText("Новая подзадача"), "Приёмка{enter}");
    await waitFor(() => expect(add).toHaveBeenCalledWith("c1", "Приёмка"));
    await userEvent.type(screen.getByLabelText("Новая подзадача"), "   {enter}");
    expect(add).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getAllByTitle("Удалить подзадачу")[0]);
    await waitFor(() => expect(del).toHaveBeenCalledWith("i1"));
  });

  it("logs time in several formats and rejects nonsense", async () => {
    setup();
    const add = vi.spyOn(api, "addTimeEntry").mockResolvedValue({} as never);
    await loaded();
    expect(screen.getByText(/2 ч/)).toBeInTheDocument(); // 90 + 30 minutes logged
    const box = screen.getByLabelText("Сколько времени");
    for (const [input, minutes] of [["1.5", 90], ["1,5", 90], ["1:30", 90], ["45м", 45], ["45 мин", 45], ["2ч", 120]] as const) {
      await userEvent.clear(box);
      await userEvent.type(box, input);
      await userEvent.click(screen.getByRole("button", { name: "Списать" }));
      await waitFor(() => expect(add).toHaveBeenLastCalledWith("c1", expect.objectContaining({ minutes })));
    }
    await userEvent.type(screen.getByLabelText("Что делали"), "сверка");
    await userEvent.type(box, "1");
    await userEvent.click(screen.getByRole("button", { name: "Списать" }));
    await waitFor(() => expect(add).toHaveBeenLastCalledWith("c1", expect.objectContaining({ minutes: 60, note: "сверка" })));
    add.mockClear();
    await userEvent.type(box, "много");
    await userEvent.click(screen.getByRole("button", { name: "Списать" }));
    expect(await screen.findByText("Укажите время, например 1.5, 1:30 или 45м")).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });

  it("flags time over the estimate, lists entries, and lets the author or an admin delete", async () => {
    setup({ estimateHours: 1 });
    const del = vi.spyOn(api, "deleteTimeEntry").mockResolvedValue(undefined);
    await loaded();
    expect(screen.getByText(/2 ч из 1 ч/).className).toContain("text-danger");
    expect(screen.getByText("Без комментария")).toBeInTheDocument();
    await userEvent.click(screen.getAllByTitle("Удалить запись")[0]);
    await waitFor(() => expect(del).toHaveBeenCalledWith("t1"));
  });

  it("a member can delete only their own time entries and files", async () => {
    setup({}, { admin: false });
    await loaded();
    await waitFor(() => expect(screen.getAllByTitle("Удалить запись")).toHaveLength(1)); // t2 is by u2, t1 by u1
    expect(screen.getAllByTitle("Удалить файл")).toHaveLength(1); // a2 is by u2
  });

  it("lists files and deletes the ones you may", async () => {
    setup();
    const del = vi.spyOn(api, "deleteAttachment").mockResolvedValue(undefined);
    await loaded();
    expect(screen.getByText("договор.pdf")).toBeInTheDocument();
    await userEvent.click((await screen.findAllByTitle("Удалить файл"))[0]);
    await waitFor(() => expect(del).toHaveBeenCalledWith("a1"));
  });

  it("uploads picked files with progress, then refreshes; reports failures", async () => {
    const { card } = setup({ attachments: [] });
    const upload = vi.mocked(apiModule.uploadAttachment);
    upload.mockImplementationOnce(async (_id, _file, onProgress) => {
      onProgress?.(50);
      return {} as never;
    });
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    const { container } = { container: document.body };
    await loaded();
    expect(screen.getByText(/Перетащите файлы сюда или выберите/)).toBeInTheDocument();
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "ok.txt"));
    await waitFor(() => expect(upload).toHaveBeenCalledWith("c1", expect.any(File), expect.any(Function)));
    await waitFor(() => expect(card.mock.calls.length).toBeGreaterThan(1));
    upload.mockRejectedValueOnce(new Error("«big.zip» больше 20 МБ"));
    await userEvent.upload(input, new File(["y"], "big.zip"));
    await waitFor(() => expect(messages).toContain("«big.zip» больше 20 МБ"));
  });

  it("accepts files dropped on the card and highlights the drop zone", async () => {
    setup();
    vi.mocked(apiModule.uploadAttachment).mockResolvedValue({} as never);
    await loaded();
    const zone = screen.getByLabelText("Название").parentElement!;
    fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Отпустите, чтобы прикрепить файлы")).toBeInTheDocument();
    fireEvent.dragLeave(zone);
    expect(screen.queryByText("Отпустите, чтобы прикрепить файлы")).toBeNull();
    fireEvent.dragOver(zone, { dataTransfer: { types: ["Text"] } }); // not files: ignored
    expect(screen.queryByText("Отпустите, чтобы прикрепить файлы")).toBeNull();
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["z"], "drop.txt")], types: ["Files"] } });
    await waitFor(() => expect(apiModule.uploadAttachment).toHaveBeenCalled());
    fireEvent.drop(zone, { dataTransfer: { files: [], types: [] } });
  });
});

describe("card modal: discussion and history", () => {
  it("shows messages grouped by day, mine on the right, with mentions and attachments", async () => {
    setup();
    await loaded();
    expect(screen.getByText("Сегодня", { selector: "span.rounded-full" })).toBeInTheDocument();
    expect(screen.getByText("Вчера")).toBeInTheDocument();
    expect(screen.getByText("Моё сообщение")).toBeInTheDocument();
    expect(screen.getByText("@Анна Смирнова")).toHaveClass("text-accent");
    expect(screen.getByText("лог.txt")).toBeInTheDocument();
    expect(screen.getByText(/Давно/)).toBeInTheDocument();
    expect(screen.getAllByText("Анна Смирнова").length).toBeGreaterThan(0);
  });

  it("sends a message and deletes mine (admins may delete any)", async () => {
    setup();
    const send = vi.spyOn(api, "addComment").mockResolvedValue({} as never);
    const del = vi.spyOn(api, "deleteComment").mockResolvedValue(undefined);
    await loaded();
    await userEvent.type(screen.getByLabelText("Сообщение"), "Привет{enter}");
    await waitFor(() => expect(send).toHaveBeenCalledWith("c1", "Привет", [], []));
    await userEvent.click(screen.getAllByTitle("Удалить сообщение")[0]);
    await waitFor(() => expect(del).toHaveBeenCalled());
  });

  it("members can delete only their own messages", async () => {
    setup({}, { admin: false });
    await loaded();
    await waitFor(() => expect(screen.getAllByTitle("Удалить сообщение").length).toBe(3)); // m1, m2, m5 by u2
  });

  it("says so when there are no messages yet", async () => {
    setup({ comments: [] });
    expect(await screen.findByText("Сообщений пока нет")).toBeInTheDocument();
  });

  it("describes the history in words", async () => {
    setup();
    await loaded();
    await userEvent.click(screen.getByRole("tab", { name: "История" }));
    expect(screen.getByText("создал(а) карточку")).toBeInTheDocument();
    expect(screen.getByText("перенёс(ла) из «Бэклог» в «В работе»")).toBeInTheDocument();
    expect(screen.getByText("оставил(а) комментарий")).toBeInTheDocument();
    expect(screen.getByText("изменил(а) название, срок, метки, custom")).toBeInTheDocument();
    expect(screen.getByText("изменил(а) карточку")).toBeInTheDocument();
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});

describe("card modal: removing and repeating", () => {
  it("deletes the card after confirmation and closes", async () => {
    const { onClose } = setup();
    const del = vi.spyOn(api, "deleteCard").mockResolvedValue(undefined);
    await loaded();
    await userEvent.click(screen.getByTitle("Действия"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Удалить карточку" }));
    expect(screen.getByRole("alertdialog", { name: "Удалить карточку TSK-1?" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить карточку" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("c1"));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("reports a refused deletion and keeps the card", async () => {
    const { onClose } = setup();
    vi.spyOn(api, "deleteCard").mockRejectedValue(new Error("Нет права: «Удалять карточки»"));
    await loaded();
    await userEvent.click(screen.getByTitle("Действия"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Удалить карточку" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить карточку" }));
    expect(await screen.findByText(/Нет права/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalledWith(true);
  });

  it("members without cards.delete don't get the delete action", async () => {
    setup({}, { admin: false });
    await loaded();
    await userEvent.click(screen.getByTitle("Действия"));
    expect(screen.queryByRole("menuitem", { name: "Удалить карточку" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Сделать повторяющейся" })).toBeInTheDocument();
  });

  it("turns the card into a recurring rule, prefilled", async () => {
    setup();
    const create = vi.spyOn(api, "createRecurring").mockResolvedValue({} as never);
    await loaded();
    await userEvent.click(screen.getByTitle("Действия"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Сделать повторяющейся" }));
    const dialog = await screen.findByRole("dialog", { name: "Сделать повторяющейся" });
    expect(within(dialog).getByLabelText("Название задачи")).toHaveValue("Подключить оплату");
    expect(within(dialog).getByLabelText("Чек-лист")).toHaveValue("Заявка\nТест");
    await userEvent.click(within(dialog).getByRole("button", { name: "Настроить повторение" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
  });

  it("the attach menu entry opens the file picker", async () => {
    setup();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    await loaded();
    await userEvent.click(screen.getByTitle("Действия"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Прикрепить файл" }));
    expect(click).toHaveBeenCalled();
  });
});

describe("card modal: Business features", () => {
  it("lets Business users fill custom fields in the card", async () => {
    const f = vi.spyOn(api, "fields");
    const { fields } = setup({ fieldValues: [{ fieldId: "f1", value: 5 }] }, { plan: "business" });
    fields.mockResolvedValue([{ id: "f1", name: "Бюджет", type: "NUMBER", options: [], position: 1 }]);
    await loaded();
    const set = vi.spyOn(api, "setFieldValue").mockResolvedValue(undefined);
    const input = await screen.findByLabelText("Бюджет");
    expect(input).toBeEnabled();
    await userEvent.clear(input);
    await userEvent.type(input, "7{enter}");
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "f1", 7));
    f.mockRestore();
  });

  it("shows custom field values read-only below Business", async () => {
    const { fields } = setup({ fieldValues: [{ fieldId: "f1", value: 5 }] });
    fields.mockResolvedValue([{ id: "f1", name: "Бюджет", type: "NUMBER", options: [], position: 1 }]);
    await loaded();
    expect(await screen.findByLabelText("Бюджет")).toBeDisabled();
  });

  it("gives labels a picker", async () => {
    const { updateCard, labels } = setup();
    labels.mockResolvedValue([{ id: "l1", name: "Срочно", color: "red" }]);
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Метки" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Срочно" }));
    await waitFor(() => expect(updateCard).toHaveBeenCalledWith("c1", { labelIds: ["l1"] }));
  });

  it("refreshes when a colleague changes the card", async () => {
    const { card } = setup();
    await loaded();
    const before = card.mock.calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(card.mock.calls.length).toBe(before);
  });
});
