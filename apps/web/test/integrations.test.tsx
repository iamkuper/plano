import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiTokenDto, WebhookDto } from "@plano/shared";
import IntegrationsPage from "@/app/settings/integrations/page";
import { api } from "@/lib/api";
import { user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const token = (over: Partial<ApiTokenDto> = {}): ApiTokenDto => ({ id: "k1", name: "Скрипт отчётов", hint: "ab12cd", lastUsedAt: null, createdAt: "2026-10-01T10:00:00.000Z", ...over });
const hook = (over: Partial<WebhookDto> = {}): WebhookDto => ({ id: "w1", url: "https://example.com/hook", events: [], isActive: true, createdAt: "2026-10-01T10:00:00.000Z", lastDelivery: null, ...over });

function setup(opts: { tokens?: ApiTokenDto[]; hooks?: WebhookDto[]; me?: ReturnType<typeof user> } = {}) {
  vi.spyOn(api, "me").mockResolvedValue(opts.me ?? user());
  return {
    tokens: vi.spyOn(api, "apiTokens").mockResolvedValue(opts.tokens ?? []),
    hooks: vi.spyOn(api, "webhooks").mockResolvedValue(opts.hooks ?? []),
  };
}

describe("API tokens", () => {
  it("lists tokens with their use, and links to the documentation", async () => {
    setup({ tokens: [token(), token({ id: "k2", name: "CI", lastUsedAt: "2026-10-04T10:00:00.000Z" })] });
    render(<IntegrationsPage />);
    expect(await screen.findByText("Скрипт отчётов")).toBeInTheDocument();
    expect(screen.getByText(/…ab12cd · создан .* · не использовался/)).toBeInTheDocument();
    expect(screen.getByText(/…ab12cd · создан .* · использован/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "документация API" })).toHaveAttribute("href", "/docs/api");
  });

  it("invites you to create the first token", async () => {
    setup();
    render(<IntegrationsPage />);
    expect(await screen.findByText("Токенов нет")).toBeInTheDocument();
  });

  it("creates a token and shows it once", async () => {
    const { tokens } = setup();
    const create = vi.spyOn(api, "createApiToken").mockResolvedValue({ ...token({ id: "k9", name: "Новый" }), token: "eyJ.secret.token" });
    render(<IntegrationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новый токен/ }));
    await userEvent.click(screen.getByRole("button", { name: "Создать токен" }));
    expect(await screen.findByText("Укажите название токена")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Название"), "  Новый ");
    await userEvent.click(screen.getByRole("button", { name: "Создать токен" }));
    expect(create).toHaveBeenCalledWith("Новый");
    expect(await screen.findByTestId("secret")).toHaveTextContent("eyJ.secret.token");
    expect(tokens).toHaveBeenCalledTimes(2); // reloaded
    await userEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(screen.queryByTestId("secret")).toBeNull();
  });

  it("shows the server's complaint", async () => {
    setup();
    vi.spyOn(api, "createApiToken").mockRejectedValue(new Error("Можно создать не больше 20 токенов"));
    render(<IntegrationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новый токен/ }));
    await userEvent.type(screen.getByLabelText("Название"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Создать токен" }));
    expect(await screen.findByText("Можно создать не больше 20 токенов")).toBeInTheDocument();
  });

  it("revokes a token after confirmation", async () => {
    const { tokens } = setup({ tokens: [token()] });
    const del = vi.spyOn(api, "deleteApiToken").mockResolvedValue(undefined);
    render(<IntegrationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Отозвать токен Скрипт отчётов" }));
    await userEvent.click(screen.getByRole("button", { name: "Отозвать" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("k1"));
    await waitFor(() => expect(tokens).toHaveBeenCalledTimes(2));
  });
});

describe("webhooks", () => {
  it("says who manages them when you lack the right", async () => {
    const { hooks } = setup({ me: user({ role: "MEMBER", permissions: [] }) });
    render(<IntegrationsPage />);
    expect(await screen.findByText(/Вебхуки настраивают сотрудники с правом/)).toBeInTheDocument();
    expect(hooks).not.toHaveBeenCalled();
  });

  it("lists addresses with their events and the latest delivery", async () => {
    setup({
      hooks: [
        hook({ events: ["card.created", "comment.created"], lastDelivery: { ok: true, statusCode: 200, createdAt: "2026-10-05T10:00:00.000Z" } }),
        hook({ id: "w2", url: "https://b.example.com/x", isActive: false, lastDelivery: { ok: false, statusCode: 500, createdAt: "2026-10-05T10:00:00.000Z" } }),
      ],
    });
    render(<IntegrationsPage />);
    expect(await screen.findByText("https://example.com/hook")).toBeInTheDocument();
    expect(screen.getByText(/Карточка создана, Новый комментарий/)).toBeInTheDocument();
    expect(screen.getByText(/последняя отправка/)).toBeInTheDocument();
    expect(screen.getByText(/Все события/)).toHaveTextContent("Все события · отключён");
    expect(screen.getByText(/ошибка отправки/)).toHaveClass("text-danger");
  });

  it("creates a webhook with chosen events and shows its secret once", async () => {
    const { hooks } = setup();
    const create = vi.spyOn(api, "createWebhook").mockResolvedValue({ ...hook(), secret: "whsec_abc" });
    render(<IntegrationsPage />);
    expect(await screen.findByText("Вебхуков нет")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Новый вебхук/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Адрес"), "https://example.com/hook");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Карточка перемещена" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(create).toHaveBeenCalledWith({ url: "https://example.com/hook", events: ["card.moved"] });
    expect(await screen.findByTestId("secret")).toHaveTextContent("whsec_abc");
    expect(hooks).toHaveBeenCalledTimes(2);
  });

  it("shows why saving failed, and edits an existing webhook", async () => {
    setup({ hooks: [hook({ events: ["card.moved"] })] });
    const update = vi.spyOn(api, "updateWebhook").mockRejectedValueOnce(new Error("Нужен публичный адрес https://")).mockResolvedValue(hook());
    render(<IntegrationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Изменить вебхук https://example.com/hook" }));
    const dialog = screen.getByRole("dialog");
    const url = within(dialog).getByLabelText("Адрес");
    await userEvent.clear(url);
    await userEvent.type(url, "https://new.example.com");
    expect(within(dialog).getByRole("checkbox", { name: "Карточка перемещена" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Нужен публичный адрес https://")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(update).toHaveBeenLastCalledWith("w1", { url: "https://new.example.com", events: ["card.moved"] });
  });

  it("sends a test event and reports the result", async () => {
    setup({ hooks: [hook()] });
    const test = vi.spyOn(api, "testWebhook").mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    render(<IntegrationsPage />);
    const button = await screen.findByRole("button", { name: "Отправить тест на https://example.com/hook" });
    await userEvent.click(button);
    await waitFor(() => expect(test).toHaveBeenCalledWith("w1"));
    await userEvent.click(button);
    await waitFor(() => expect(test).toHaveBeenCalledTimes(2));
  });

  it("shows the delivery log", async () => {
    setup({ hooks: [hook()] });
    vi.spyOn(api, "webhookDeliveries").mockResolvedValue([
      { id: "d1", event: "card.moved", ok: true, statusCode: 200, error: null, attempts: 1, createdAt: "2026-10-05T10:00:00.000Z" },
      { id: "d2", event: "card.created", ok: false, statusCode: 500, error: "HTTP 500", attempts: 3, createdAt: "2026-10-05T09:00:00.000Z" },
    ]);
    render(<IntegrationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Отправки на https://example.com/hook" }));
    expect(await screen.findByText("доставлено 200")).toBeInTheDocument();
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
    expect(screen.getByText(/3 попытки/)).toBeInTheDocument();
  });

  it("says when nothing was sent yet", async () => {
    setup({ hooks: [hook()] });
    vi.spyOn(api, "webhookDeliveries").mockResolvedValue([]);
    render(<IntegrationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Отправки на https://example.com/hook" }));
    expect(await screen.findByText("Пока ничего не отправлялось")).toBeInTheDocument();
  });

  it("creates a new secret after confirmation, and removes a webhook", async () => {
    const { hooks } = setup({ hooks: [hook()] });
    const rotate = vi.spyOn(api, "rotateWebhookSecret").mockResolvedValue({ secret: "whsec_new" });
    const del = vi.spyOn(api, "deleteWebhook").mockResolvedValue(undefined);
    render(<IntegrationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Новый секрет для https://example.com/hook" }));
    await userEvent.click(screen.getByRole("button", { name: "Создать секрет" }));
    expect(await screen.findByTestId("secret")).toHaveTextContent("whsec_new");
    expect(rotate).toHaveBeenCalledWith("w1");
    await userEvent.click(screen.getByRole("button", { name: "Готово" }));

    await userEvent.click(screen.getByRole("button", { name: "Удалить вебхук https://example.com/hook" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("w1"));
    await waitFor(() => expect(hooks).toHaveBeenCalledTimes(2));
  });
});
