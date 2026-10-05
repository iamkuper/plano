import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentDto } from "@plano/shared";
import AgentsPage from "@/app/settings/agents/page";
import { Avatar } from "@/components/avatar";
import { api } from "@/lib/api";
import { member, user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const agent = (over: Partial<AgentDto> = {}): AgentDto => ({
  id: "a1", name: "Мария-бот", avatarUrl: null, roleId: "r1", roleName: "Участник", isActive: true, provider: "ANTHROPIC", model: "claude-sonnet-5-5", baseUrl: null,
  keyHint: "…1234", instructions: "Пиши кратко", enabled: true, overSeat: false, lastRun: null, ...over,
});
const roles = [{ id: "r1", name: "Участник", permissions: [], isDefault: true, _count: { users: 1 } }];

function setup(list: AgentDto[], me = user()) {
  vi.spyOn(api, "me").mockResolvedValue(me);
  vi.spyOn(api, "roles").mockResolvedValue(roles as never);
  return vi.spyOn(api, "agents").mockResolvedValue(list);
}

describe("agents page", () => {
  it("invites you to connect the first agent", async () => {
    setup([]);
    render(<AgentsPage />);
    expect(await screen.findByText("Агентов пока нет")).toBeInTheDocument();
    expect(screen.getByText(/занимает одно место тарифа/)).toBeInTheDocument();
  });

  it("lists agents with their state", async () => {
    setup([
      agent({ lastRun: { id: "r", status: "DONE", trigger: "ASSIGNED", error: null, steps: 2, inputTokens: 10, outputTokens: 5, createdAt: "2026-10-05T10:00:00.000Z", card: { id: "c1", number: 1, title: "Отчёт", projectId: "p1" } } }),
      agent({ id: "a2", name: "Выключенный", enabled: false, provider: "OPENAI", model: "gpt-4o" }),
      agent({ id: "a3", name: "Без места", overSeat: true }),
      agent({ id: "a4", name: "Старый", isActive: false }),
    ]);
    render(<AgentsPage />);
    expect(await screen.findByText("Мария-бот")).toBeInTheDocument();
    expect(screen.getByText(/Anthropic \(Claude\) · claude-sonnet-5-5 · последний запуск .*: готово/)).toBeInTheDocument();
    expect(screen.getByText("выключен")).toBeInTheDocument();
    expect(screen.getByText("нет оплаченного места")).toBeInTheDocument();
    expect(screen.getByText("удалён")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить агента Старый" })).toBeNull();
  });

  it("validates, checks the connection and connects a new agent", async () => {
    setup([]);
    const test = vi.spyOn(api, "testAgent").mockResolvedValue({ ok: true, reply: "OK" });
    const create = vi.spyOn(api, "createAgent").mockResolvedValue(agent());
    render(<AgentsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новый агент/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Подключить" }));
    expect(await within(dialog).findByText("Укажите имя агента")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Имя"), "Тестер");
    await userEvent.click(within(dialog).getByRole("button", { name: "Подключить" }));
    expect(await within(dialog).findByText("Укажите ключ API")).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText("Провайдер"), "OPENAI_COMPATIBLE");
    expect(within(dialog).getByLabelText("Модель")).toHaveValue(""); // no suggestion for a custom server
    await userEvent.type(within(dialog).getByLabelText("Модель"), "deepseek-chat");
    await userEvent.type(within(dialog).getByLabelText("Адрес API"), "https://api.deepseek.com/v1");
    await userEvent.type(within(dialog).getByLabelText("Ключ API"), "sk-123");
    await userEvent.type(within(dialog).getByLabelText("Инструкция"), "Проверяй задачи");
    await userEvent.click(within(dialog).getByRole("button", { name: "Проверить подключение" }));
    expect(await within(dialog).findByText(/Подключение работает. Ответ модели: OK/)).toBeInTheDocument();
    expect(test).toHaveBeenCalledWith({ agentId: undefined, provider: "OPENAI_COMPATIBLE", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-123" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Подключить" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Тестер", provider: "OPENAI_COMPATIBLE", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-123", instructions: "Проверяй задачи", roleId: "r1", enabled: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows why a connection check failed, and server errors on save", async () => {
    setup([]);
    vi.spyOn(api, "testAgent").mockRejectedValue(new Error("Модель не ответила: 401: Incorrect API key"));
    vi.spyOn(api, "createAgent").mockRejectedValue(new Error("Платный тариф: места закончились"));
    render(<AgentsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новый агент/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Имя"), "Бот");
    await userEvent.type(within(dialog).getByLabelText("Ключ API"), "bad");
    await userEvent.click(within(dialog).getByRole("button", { name: "Проверить подключение" }));
    expect(await within(dialog).findByText(/Incorrect API key/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Подключить" }));
    expect(await within(dialog).findByText("Платный тариф: места закончились")).toBeInTheDocument();
  });

  it("edits an agent without resending the stored key", async () => {
    setup([agent()]);
    const update = vi.spyOn(api, "updateAgent").mockResolvedValue(agent());
    const test = vi.spyOn(api, "testAgent").mockResolvedValue({ ok: true, reply: "OK" });
    render(<AgentsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Изменить агента Мария-бот" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Сейчас сохранён ключ …1234/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Инструкция")).toHaveValue("Пиши кратко");
    await userEvent.click(within(dialog).getByRole("button", { name: "Проверить подключение" }));
    await waitFor(() => expect(test).toHaveBeenCalledWith(expect.objectContaining({ agentId: "a1", apiKey: undefined })));
    const name = within(dialog).getByLabelText("Имя");
    await userEvent.clear(name);
    await userEvent.type(name, "Мария");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("a1", expect.not.objectContaining({ apiKey: expect.anything() })));
    expect(update.mock.calls[0][1]).toMatchObject({ name: "Мария", provider: "ANTHROPIC", baseUrl: null, enabled: true });
  });

  it("shows the run history with errors", async () => {
    setup([agent()]);
    const run = (over: object) => ({ id: "x", status: "DONE", trigger: "MENTIONED", error: null, steps: 1, inputTokens: 100, outputTokens: 20, createdAt: "2026-10-05T10:00:00.000Z", card: { id: "c1", number: 1, title: "Отчёт", projectId: "p1" }, ...over });
    vi.spyOn(api, "agentRuns").mockResolvedValue([run({}), run({ id: "y", status: "FAILED", error: "401: Incorrect API key", trigger: "ASSIGNED" }), run({ id: "z", status: "SKIPPED", error: "нет оплаченного места", trigger: "COMMENTED", inputTokens: 0 })] as never);
    render(<AgentsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Запуски агента «Мария-бот»" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/упомянули · готово · токены: 100 → 20/)).toBeInTheDocument();
    expect(within(dialog).getByText("401: Incorrect API key")).toBeInTheDocument();
    expect(within(dialog).getByText(/новое сообщение · пропущено$/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link", { name: "Отчёт" })[0]).toHaveAttribute("href", "/projects/p1?card=c1");
  });

  it("says when there are no runs", async () => {
    setup([agent()]);
    vi.spyOn(api, "agentRuns").mockRejectedValue(new Error("x"));
    render(<AgentsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Запуски агента «Мария-бот»" }));
    expect(await screen.findByText(/Запусков пока не было/)).toBeInTheDocument();
  });

  it("removes an agent after confirmation", async () => {
    setup([agent()]);
    const del = vi.spyOn(api, "deleteAgent").mockResolvedValue(undefined);
    render(<AgentsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Удалить агента Мария-бот" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("a1"));
  });

  it("is read-only for people without the right", async () => {
    const list = setup([], member({ permissions: [] }));
    render(<AgentsPage />);
    expect(await screen.findByText(/Агентов настраивает администратор/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новый агент/ })).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
});

describe("avatar of an agent", () => {
  it("is a robot instead of initials", () => {
    const { container } = render(<><Avatar user={{ id: "a", name: "Бот", kind: "AGENT" }} /><Avatar user={{ id: "b", name: "Иван Петров" }} /></>);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("ИП")).toBeInTheDocument();
    expect(screen.queryByText("Б")).toBeNull();
  });
});
