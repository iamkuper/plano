import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriorityBadge } from "@/components/priority-badge";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { HeaderSearch } from "@/components/header-search";
import { AttachmentGrid, MessageAttachments, formatSize, isImage } from "@/components/attachments";
import { MessageComposer, MessageText } from "@/components/message-composer";
import { NotificationBell } from "@/components/notification-bell";
import { CardTile } from "@/components/card-tile";
import { api, API_URL, setToken } from "@/lib/api";
import { useDebounced, useRealtime } from "@/lib/realtime";
import { onProjectsChanged } from "@/lib/projects-events";
import { onToast } from "@/lib/toast";
import { card } from "./fixtures";
import { nav } from "./nav";

vi.mock("socket.io-client", () => {
  const handlers = new Map<string, Set<() => void>>();
  const socket = {
    connected: true,
    on: vi.fn((event: string, fn: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: () => void) => handlers.get(event)?.delete(fn)),
    emit: vi.fn(),
    fire: (event: string) => handlers.get(event)?.forEach((fn) => fn()),
  };
  return { io: vi.fn(() => socket), __socket: socket };
});

describe("priority badge", () => {
  it("highlights only high priority", () => {
    const { rerender } = render(<PriorityBadge priority="HIGH" />);
    expect(screen.getByText("Высокий").className).toContain("text-danger");
    rerender(<PriorityBadge priority="LOW" />);
    expect(screen.getByText("Низкий").className).not.toContain("text-danger");
  });
});

describe("card tile", () => {
  const richCard = card({
    title: "Подключить оплату", type: "INTEGRATION", priority: "HIGH", dueDate: "2000-01-01T00:00:00.000Z",
    assignees: [{ user: { id: "u1", name: "Иван" } }], labels: [{ label: { id: "l1", name: "Срочно", color: "red" } }],
    checklist: [{ id: "i1", text: "а", done: true }, { id: "i2", text: "б", done: false }],
    _count: { comments: 3, attachments: 2 }, recurringRuleId: "r1", unreadComments: 1,
  });

  it("shows the key, title, people, labels and every signal", () => {
    render(<CardTile card={richCard} onOpen={() => {}} showProject />);
    for (const t of ["TSK-1", "Подключить оплату", "Срочно", "Интеграция", "Срочно", "1/2", "2", "3", "Проект"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(screen.getByTitle("Срок прошёл")).toHaveClass("text-danger");
    expect(screen.getByTitle("Повторяющаяся задача")).toBeInTheDocument();
    expect(screen.getByTitle("Новых сообщений: 1")).toBeInTheDocument();
    expect(screen.getByTitle("Высокий приоритет")).toBeInTheDocument();
  });

  it("marks today's due date and a finished checklist", () => {
    const today = new Date();
    const iso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString();
    render(<CardTile card={card({ dueDate: iso, checklist: [{ id: "i", text: "x", done: true }], _count: { comments: 2 } })} onOpen={() => {}} />);
    expect(screen.getByText("Сегодня")).toBeInTheDocument();
    expect(screen.getByTitle("Подзадачи")).toHaveClass("text-success");
    expect(screen.getByTitle("Сообщения")).toBeInTheDocument();
  });

  it("opens on click or Enter/Space, and toggles selection with modifiers or when selecting", async () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const { rerender } = render(<CardTile card={card()} onOpen={onOpen} onToggleSelect={onToggle} />);
    const tile = screen.getByRole("button", { name: /Первая карточка/, pressed: false });
    await userEvent.click(tile);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.keyDown(tile, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(3);
    fireEvent.click(tile, { shiftKey: true });
    fireEvent.click(tile, { ctrlKey: true });
    await userEvent.click(screen.getByRole("checkbox", { name: "Выбрать TSK-1" }));
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenCalledTimes(3);
    rerender(<CardTile card={card()} onOpen={onOpen} onToggleSelect={onToggle} selecting selected />);
    await userEvent.click(screen.getByRole("button", { name: /Первая карточка/, pressed: true }));
    expect(onToggle).toHaveBeenCalledTimes(4);
  });
});

describe("search in the header", () => {
  it("finds cards after a pause and opens the first with Enter", async () => {
    const search = vi.spyOn(api, "searchCards").mockResolvedValue([card({ id: "c9", title: "Бриф клиента", project: { id: "p7", title: "Сайт" } })]);
    render(<HeaderSearch />);
    const input = screen.getByPlaceholderText("Поиск");
    await userEvent.type(input, "бриф");
    expect(await screen.findByText("Бриф клиента")).toBeInTheDocument();
    expect(screen.getByText("TSK-1, Сайт")).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith("бриф");
    await userEvent.keyboard("{Enter}");
    expect(nav.router.push).toHaveBeenCalledWith("/projects/p7?card=c9");
    expect(input).toHaveValue("");
  });

  it("opens a result by click, says when nothing is found, clears on Escape and focuses on ⌘K", async () => {
    const search = vi.spyOn(api, "searchCards").mockResolvedValue([]);
    render(<HeaderSearch />);
    const input = screen.getByPlaceholderText("Поиск");
    await userEvent.type(input, "нет такого");
    expect(await screen.findByText("Ничего не найдено")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("");
    input.blur();
    await new Promise((r) => setTimeout(r, 200)); // the list closes shortly after blur
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(input).toHaveFocus();

    search.mockResolvedValue([card({ id: "c1", project: { id: "p1", title: "П" } })]);
    await userEvent.type(input, "x");
    await userEvent.click(await screen.findByText("Первая карточка"));
    expect(nav.router.push).toHaveBeenCalledWith("/projects/p1?card=c1");
  });

  it("ignores failed lookups and empty queries", async () => {
    const search = vi.spyOn(api, "searchCards").mockRejectedValue(new Error("x"));
    render(<HeaderSearch />);
    await userEvent.type(screen.getByPlaceholderText("Поиск"), " ");
    await new Promise((r) => setTimeout(r, 300));
    expect(search).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText("Поиск"), "ab");
    await waitFor(() => expect(search).toHaveBeenCalled());
  });
});

describe("new project dialog", () => {
  const templates = [{ id: "t1", name: "Типовой", _count: { cards: 7 } }];

  it("creates a project from the first template and opens its board", async () => {
    vi.spyOn(api, "templates").mockResolvedValue(templates as never);
    const create = vi.spyOn(api, "createProject").mockResolvedValue({ id: "np1" });
    const changed = vi.fn();
    onProjectsChanged(changed);
    const onClose = vi.fn();
    render(<NewProjectDialog onClose={onClose} />);
    expect(await screen.findByRole("option", { name: "Типовой (7 карточек)" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Название"), "  Сайт  ");
    fireEvent.change(screen.getByLabelText("Дедлайн"), { target: { value: "2026-12-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Создать проект" }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/projects/np1"));
    expect(create).toHaveBeenCalledWith({ title: "Сайт", templateId: "t1", deadline: "2026-12-01" });
    expect(changed).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("allows no template, needs a title, and shows server errors", async () => {
    vi.spyOn(api, "templates").mockRejectedValue(new Error("x"));
    const create = vi.spyOn(api, "createProject").mockRejectedValue(new Error("На тарифе Free — не больше 3 проектов"));
    render(<NewProjectDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Создать проект" }));
    expect(await screen.findByText("Укажите название проекта")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Название"), "Новый");
    await userEvent.click(screen.getByRole("button", { name: "Создать проект" }));
    expect(await screen.findByText(/не больше 3 проектов/)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({ title: "Новый", templateId: undefined, deadline: undefined });
    expect(nav.router.push).not.toHaveBeenCalled();
  });
});

describe("attachments", () => {
  const png = { id: "a1", name: "снимок.png", mime: "image/png", size: 2048, url: "/attachments/a1/file?sig=1", commentId: null, uploaderId: "u1", createdAt: "" };
  const xls = { ...png, id: "a2", name: "отчёт.xlsx", mime: "application/vnd.ms-excel", size: 3 * 1024 * 1024, commentId: "m1" };
  const zip = { ...png, id: "a3", name: "архив.zip", mime: "application/zip", size: 10 };
  const pdf = { ...png, id: "a4", name: "договор.pdf", mime: "application/pdf", size: 900 };
  const other = { ...png, id: "a5", name: "данные.bin", mime: "application/octet-stream", size: 5 };

  it("formats sizes and recognises images", () => {
    expect([formatSize(500), formatSize(2048), formatSize(1.5 * 1024 * 1024)]).toEqual(["500 Б", "2 КБ", "1,5 МБ"]);
    expect(isImage(png)).toBe(true);
    expect(isImage(pdf)).toBe(false);
  });

  it("shows thumbnails and file tiles with signed links, and deletes where allowed", async () => {
    const onDelete = vi.fn();
    render(<AttachmentGrid items={[png, xls, zip, pdf, other]} canDelete={(a) => a.id !== "a2"} onDelete={onDelete} />);
    expect(screen.getByAltText("снимок.png")).toHaveAttribute("src", `${API_URL}/attachments/a1/file?sig=1`);
    expect(screen.getByText("3,0 МБ, из обсуждения")).toBeInTheDocument();
    expect(screen.getAllByTitle("Удалить файл")).toHaveLength(4);
    await userEvent.click(screen.getAllByTitle("Удалить файл")[0]);
    expect(onDelete).toHaveBeenCalledWith(png);
  });

  it("lays attachments out inside a message", () => {
    const { container, rerender } = render(<MessageAttachments items={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<MessageAttachments items={[png, xls]} mine />);
    expect(screen.getByAltText("снимок.png")).toBeInTheDocument();
    expect(screen.getByText("отчёт.xlsx").closest("a")!.className).toContain("bg-white/15");
    rerender(<MessageAttachments items={[pdf]} />);
    expect(screen.getByText("договор.pdf").closest("a")!.className).toContain("bg-surface-soft");
  });
});

describe("message composer", () => {
  const people = [{ id: "u1", name: "Анна Смирнова" }, { id: "u2", name: "Иван Петров" }];

  it("sends on Enter, keeps Shift+Enter for new lines, and clears", async () => {
    const onSend = vi.fn();
    render(<MessageComposer users={people} onSend={onSend} />);
    const box = screen.getByLabelText("Сообщение");
    expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
    await userEvent.type(box, "привет{Shift>}{Enter}{/Shift}мир");
    expect(box).toHaveValue("привет\nмир");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("привет\nмир", [], []);
    expect(box).toHaveValue("");
  });

  it("offers people after @, picks with the keyboard or the mouse, and sends only the ids still in the text", async () => {
    const onSend = vi.fn();
    render(<MessageComposer users={people} onSend={onSend} />);
    const box = screen.getByLabelText("Сообщение");
    await userEvent.type(box, "эй @анн");
    const list = await screen.findByRole("listbox", { name: "Упомянуть" });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(box).toHaveValue("эй @Анна Смирнова ");
    await userEvent.type(box, "и @ив");
    await userEvent.click(await screen.findByRole("option", { name: /Иван Петров/ }));
    await userEvent.clear(box);
    await userEvent.type(box, "@Иван Петров ок");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("@Иван Петров ок", ["u2"], []);
  });

  it("moves through suggestions with arrows and closes them with Escape", async () => {
    render(<MessageComposer users={people} onSend={() => {}} />);
    const box = screen.getByLabelText("Сообщение");
    await userEvent.type(box, "@");
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true"); // wraps
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("uploads files, shows progress, sends the attachment ids, and removes or reports failures", async () => {
    const onSend = vi.fn();
    let progress!: (n: number) => void;
    const onUpload = vi.fn((file: File, cb: (n: number) => void) => {
      progress = cb;
      return Promise.resolve({ id: `att-${file.name}`, name: file.name } as never);
    });
    const { container } = render(<MessageComposer users={[]} onSend={onSend} onUpload={onUpload} />);
    const file = new File(["x"], "скрин.png", { type: "image/png" });
    await userEvent.upload(container.querySelector("input[type=file]")!, file);
    await waitFor(() => expect(screen.getByText("скрин.png")).toBeInTheDocument());
    act(() => progress(40));
    await waitFor(() => expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled()); // attachment alone is enough
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(onSend).toHaveBeenCalledWith("", [], ["att-скрин.png"]);

    await userEvent.upload(container.querySelector("input[type=file]")!, new File(["y"], "второй.txt"));
    await userEvent.click(await screen.findByLabelText("Убрать второй.txt"));
    expect(screen.queryByText("второй.txt")).toBeNull();

    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    onUpload.mockRejectedValueOnce(new Error("«big.zip» больше 20 МБ"));
    await userEvent.upload(container.querySelector("input[type=file]")!, new File(["z"], "big.zip"));
    await waitFor(() => expect(messages).toContain("«big.zip» больше 20 МБ"));
    expect(screen.queryByText("big.zip")).toBeNull();
  });

  it("turns pasted screenshots into attachments, only when uploads are enabled", async () => {
    const onUpload = vi.fn(async (file: File) => ({ id: "p1", name: file.name }) as never);
    const { rerender } = render(<MessageComposer users={[]} onSend={() => {}} onUpload={onUpload} />);
    fireEvent.paste(screen.getByLabelText("Сообщение"), { clipboardData: { files: [new File(["x"], "paste.png", { type: "image/png" })] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    rerender(<MessageComposer users={[]} onSend={() => {}} />);
    fireEvent.paste(screen.getByLabelText("Сообщение"), { clipboardData: { files: [new File(["x"], "paste.png")] } });
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Прикрепить файл")).toBeNull();
  });

  it("MessageText highlights known @names only", () => {
    const { container, rerender } = render(<MessageText text="Привет @Анна Смирнова и @Неизвестный" users={people} />);
    expect(container.querySelectorAll("span.font-medium")).toHaveLength(1);
    expect(container.querySelector("span.font-medium")).toHaveTextContent("@Анна Смирнова");
    rerender(<MessageText text="Мой @Иван Петров" users={people} mine />);
    expect(container.querySelector("span.font-medium")!.className).toContain("text-white");
    rerender(<MessageText text="без людей" users={[]} />);
    expect(container).toHaveTextContent("без людей");
  });
});

describe("notification bell", () => {
  const items = [
    { id: "n1", type: "ASSIGNED" as const, text: null, readAt: null, createdAt: new Date().toISOString(), actor: { id: "u2", name: "Анна" }, card: { id: "c1", number: 1, title: "Бриф", projectId: "p1" } },
    { id: "n2", type: "COMMENTED" as const, text: "Готово", readAt: "2026-10-01T00:00:00.000Z", createdAt: new Date().toISOString(), actor: { id: "u2", name: "Анна" }, card: { id: "c1", number: 1, title: "Бриф", projectId: "p1" } },
    { id: "n3", type: "DUE_SOON" as const, text: null, readAt: null, createdAt: new Date().toISOString(), actor: null, card: { id: "c2", number: 2, title: "Отчёт", projectId: "p1" } },
    { id: "n4", type: "OVERDUE" as const, text: null, readAt: null, createdAt: new Date().toISOString(), actor: null, card: { id: "c3", number: 3, title: "Акт", projectId: "p1" } },
    { id: "n5", type: "MENTIONED" as const, text: "см. выше", readAt: null, createdAt: new Date().toISOString(), actor: { id: "u3", name: "Пётр" }, card: { id: "c4", number: 4, title: "План", projectId: "p2" } },
  ];

  it("counts unread, lists every kind of notification and opens the card", async () => {
    setToken("tok");
    const list = vi.spyOn(api, "notifications").mockResolvedValue({ items, unread: 12 } as never);
    const read = vi.spyOn(api, "markNotificationsRead").mockResolvedValue(undefined);
    render(<NotificationBell />);
    const bell = await screen.findByLabelText("Уведомления: 12 новых");
    expect(screen.getByText("9+")).toBeInTheDocument();
    await userEvent.click(bell);
    expect(screen.getByText(/назначил\(а\) вас на/)).toBeInTheDocument();
    expect(screen.getByText(/написал\(а\) в/)).toBeInTheDocument();
    expect(screen.getByText(/Срок скоро наступит:/)).toBeInTheDocument();
    expect(screen.getByText(/Срок истёк:/)).toBeInTheDocument();
    expect(screen.getByText(/упомянул\(а\) вас в/)).toBeInTheDocument();
    expect(screen.getByText("Готово")).toBeInTheDocument();
    await userEvent.click(screen.getByText(/TSK-4 План/));
    expect(read).toHaveBeenCalledWith(["n5"]);
    expect(nav.router.push).toHaveBeenCalledWith("/projects/p2?card=c4");
    list.mockResolvedValue({ items: [], unread: 0 } as never);
  });

  it("marks everything read, shows the empty state and works in the compact sidebar", async () => {
    vi.spyOn(api, "notifications").mockResolvedValue({ items, unread: 3 } as never);
    const read = vi.spyOn(api, "markNotificationsRead").mockResolvedValue(undefined);
    const { unmount } = render(<NotificationBell compact />);
    await userEvent.click(await screen.findByLabelText("Уведомления: 3 новых"));
    await userEvent.click(screen.getByRole("button", { name: "Прочитать все" }));
    expect(read).toHaveBeenCalledWith();
    unmount();
    vi.spyOn(api, "notifications").mockResolvedValue({ items: [], unread: 0 } as never);
    render(<NotificationBell />);
    await userEvent.click(await screen.findByLabelText("Уведомления"));
    expect(screen.getByText("Пока ничего нового")).toBeInTheDocument();
  });

  it("refreshes when the server says notifications changed", async () => {
    setToken("tok");
    const list = vi.spyOn(api, "notifications").mockResolvedValue({ items: [], unread: 0 } as never);
    render(<NotificationBell />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    list.mockResolvedValue({ items, unread: 2 } as never);
    const { __socket } = (await import("socket.io-client")) as unknown as { __socket: { fire(e: string): void } };
    act(() => __socket.fire("notifications:changed"));
    expect(await screen.findByLabelText("Уведомления: 2 новых")).toBeInTheDocument();
  });
});

describe("realtime hook", () => {
  it("does nothing without a session, then joins rooms and routes events", async () => {
    const { __socket } = (await import("socket.io-client")) as unknown as { __socket: { emit: ReturnType<typeof vi.fn>; fire(e: string): void; on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> } };
    const handler = vi.fn();
    function Probe({ room }: { room: string | string[] | null }) {
      useRealtime(room, { "board:changed": handler });
      return null;
    }
    const idle = render(<Probe room="project:p1" />);
    expect(__socket.emit).not.toHaveBeenCalled();
    idle.unmount();

    setToken("tok");
    const { rerender, unmount } = render(<Probe room={["project:b", "project:a"]} />);
    expect(__socket.emit).toHaveBeenCalledWith("join", "project:a");
    expect(__socket.emit).toHaveBeenCalledWith("join", "project:b");
    act(() => __socket.fire("board:changed"));
    expect(handler).toHaveBeenCalledTimes(1);
    rerender(<Probe room={null} />);
    expect(__socket.emit).toHaveBeenCalledWith("leave", "project:a");
    unmount();
    act(() => __socket.fire("board:changed"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps a room until its last subscriber leaves, and rejoins after reconnecting", async () => {
    setToken("tok");
    const { __socket } = (await import("socket.io-client")) as unknown as { __socket: { emit: ReturnType<typeof vi.fn>; fire(e: string): void } };
    __socket.emit.mockClear();
    function Probe() {
      useRealtime("card:c1", {});
      return null;
    }
    const one = render(<Probe />);
    const two = render(<Probe />);
    one.unmount();
    expect(__socket.emit).not.toHaveBeenCalledWith("leave", "card:c1");
    two.unmount();
    expect(__socket.emit).toHaveBeenCalledWith("leave", "card:c1");
  });

  it("debounces bursts into one call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    function Probe() {
      const run = useDebounced(fn, 100);
      return <button onClick={run}>go</button>;
    }
    const { unmount } = render(<Probe />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText("go"));
    act(() => vi.advanceTimersByTime(150));
    expect(fn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("go"));
    unmount(); // pending call is cancelled
    act(() => vi.advanceTimersByTime(150));
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
