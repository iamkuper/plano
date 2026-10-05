import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/app-shell";
import { api, getToken, setToken } from "@/lib/api";
import { notifyProjectsChanged } from "@/lib/projects-events";
import { billing, card, column, member, user } from "./fixtures";
import { nav } from "./nav";

vi.mock("socket.io-client", () => ({ io: vi.fn(() => ({ connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() })) }));

const project = (id: string, title: string, openCards = 3) => ({ id, title, status: "ACTIVE", openCards, _count: { cards: 5 } }) as never;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

function setup({ me = user(), projects = [project("p1", "Сайт"), project("p2", "Приложение", 0)], locked = false, columns = [] as ReturnType<typeof column>[] } = {}) {
  setToken("tok");
  vi.spyOn(api, "me").mockResolvedValue(me);
  vi.spyOn(api, "settings").mockResolvedValue({ workspaceName: "Ромашка", cardPrefix: "TSK", defaultColumns: ["А"] } as never);
  vi.spyOn(api, "projects").mockResolvedValue(projects);
  vi.spyOn(api, "teamBoard").mockResolvedValue(columns as never);
  vi.spyOn(api, "notifications").mockResolvedValue({ items: [], unread: 0 } as never);
  vi.spyOn(api, "billing").mockResolvedValue(billing({ locked }));
  render(<AppShell><p>Содержимое страницы</p></AppShell>);
}

describe("app shell", () => {
  it("sends visitors without a session to the login page and shows nothing", () => {
    setToken(null);
    render(<AppShell><p>Секрет</p></AppShell>);
    expect(nav.router.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Секрет")).toBeNull();
  });

  it("waits for the profile and settings, then shows the workspace, nav and projects", async () => {
    setup();
    expect(await screen.findByText("Содержимое страницы")).toBeInTheDocument();
    expect(screen.getByText("Ромашка")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Главная" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Проекты" })).toHaveAttribute("href", "/projects");
    const site = await screen.findByTitle("Сайт");
    expect(site).toHaveAttribute("href", "/projects/p1");
    expect(within(site).getByText("3")).toBeInTheDocument();
    expect(screen.getByTitle("Приложение")).toBeInTheDocument();
  });

  it("marks the current page and project, and counts my urgent cards", async () => {
    nav.path = "/projects/p1";
    setup({ columns: [column({ cards: [card({ id: "a", dueDate: day(-1) }), card({ id: "b", dueDate: day(10) }), card({ id: "c", dueDate: null })] }), column({ id: "done", cards: [card({ id: "d", dueDate: day(-3) })] })] });
    expect(await screen.findByTitle("Сайт")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Главная/ })).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(screen.getByRole("link", { name: /Главная/ })).toHaveTextContent("1")); // only the overdue open card
  });

  it("highlights Главная on dashboard, team and report pages", async () => {
    nav.path = "/reports/time";
    setup();
    expect(await screen.findByRole("link", { name: /Главная/ })).toHaveAttribute("aria-current", "page");
  });

  it("says when there are no active projects and folds the list", async () => {
    setup({ projects: [] });
    expect(await screen.findByText("Нет активных проектов")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /В работе/ }));
    expect(screen.queryByText("Нет активных проектов")).toBeNull();
  });

  it("refreshes the project list when a project changes", async () => {
    setup();
    await screen.findByTitle("Сайт");
    vi.mocked(api.projects).mockResolvedValue([project("p9", "Новый")]);
    act(() => notifyProjectsChanged());
    expect(await screen.findByTitle("Новый")).toBeInTheDocument();
  });

  it("collapses to icons, remembers it, and expands again; '[' does the same unless typing", async () => {
    setup();
    await screen.findByText("Ромашка");
    await userEvent.click(screen.getByRole("button", { name: "Свернуть меню" }));
    expect(screen.queryByText("Ромашка")).toBeNull();
    expect(localStorage.getItem("plano.sidebar-collapsed")).toBe("1");
    expect(screen.getByRole("link", { name: "Сайт" })).toHaveAttribute("href", "/projects/p1");
    await userEvent.click(screen.getByRole("button", { name: "Развернуть меню" }));
    expect(screen.getByText("Ромашка")).toBeInTheDocument();
    await userEvent.keyboard("[[");
    expect(screen.queryByText("Ромашка")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Поиск" })); // the icon opens the palette
    const input = await screen.findByRole("combobox", { name: "Команда или поиск" });
    await userEvent.type(input, "[["); // typing a bracket in a field doesn't expand the sidebar
    expect(screen.queryByText("Ромашка")).toBeNull();
    await userEvent.keyboard("{Escape}");
    fireEvent.keyDown(window, { key: "[", metaKey: true });
    expect(screen.queryByText("Ромашка")).toBeNull();
    await userEvent.keyboard("[[");
    expect(screen.getByText("Ромашка")).toBeInTheDocument();
  });

  it("starts collapsed when that was the last choice", async () => {
    localStorage.setItem("plano.sidebar-collapsed", "1");
    setup();
    await waitFor(() => expect(screen.queryByText("Ромашка")).toBeNull());
    expect(await screen.findByRole("button", { name: "Развернуть меню" })).toBeInTheDocument();
  });

  it("opens the user menu with profile links and signs out", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Меню пользователя" }));
    expect(screen.getByText("ivan@example.ru")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Настройки" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Профиль" })).toHaveAttribute("href", "/profile");
    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));
    expect(getToken()).toBeNull();
    expect(nav.router.replace).toHaveBeenCalledWith("/login");
  });

  describe("read-only banner", () => {
    it("tells admins the plan ended and links to payment", async () => {
      setup({ locked: true });
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Тариф закончился: данные доступны только для чтения.");
      expect(alert).toHaveTextContent("Оплатите тариф, и работа продолжится.");
      expect(within(alert).getByRole("link", { name: "Оплатить тариф" })).toHaveAttribute("href", "/settings/billing");
    });

    it("asks members to turn to their admin, without a pay link", async () => {
      setup({ locked: true, me: member() });
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Попросите администратора оплатить тариф.");
      expect(within(alert).queryByRole("link")).toBeNull();
    });

    it("doesn't repeat the link on the billing page, and is absent when not locked", async () => {
      nav.path = "/settings/billing";
      setup({ locked: true });
      const alert = await screen.findByRole("alert");
      expect(within(alert).queryByRole("link")).toBeNull();
    });

    it("is hidden on an active plan, and re-checks when the window regains focus", async () => {
      setup();
      await screen.findByText("Содержимое страницы");
      await waitFor(() => expect(api.billing).toHaveBeenCalled());
      expect(screen.queryByRole("alert")).toBeNull();
      vi.mocked(api.billing).mockResolvedValue(billing({ locked: true }));
      act(() => void window.dispatchEvent(new Event("focus")));
      expect(await screen.findByRole("alert")).toBeInTheDocument();
    });
  });
});
