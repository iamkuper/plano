import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPage from "@/app/dashboard/page";
import ProjectsPage from "@/app/projects/page";
import TeamBoardPage from "@/app/team/page";
import Home from "@/app/page";
import { api } from "@/lib/api";
import { card, column, member, onboarding, user } from "./fixtures";
import { nav } from "./nav";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("socket.io-client", () => ({ io: vi.fn(() => ({ connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() })) }));
vi.mock("next/navigation", async () => {
  const { nav } = await import("./nav");
  return {
    useRouter: () => nav.router,
    usePathname: () => nav.path,
    useSearchParams: () => new URLSearchParams(nav.search),
    useParams: () => nav.params,
    redirect: vi.fn((to: string) => {
      throw new Error(`REDIRECT:${to}`);
    }),
  };
});

const day = (offset: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12).toISOString();
};

describe("home", () => {
  it("redirects to the dashboard", () => {
    expect(() => Home()).toThrow("REDIRECT:/dashboard");
  });
});

describe("dashboard", () => {
  const setup = (over: { mine?: unknown; team?: unknown; time?: unknown } = {}) => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    vi.spyOn(api, "projects").mockResolvedValue([{ id: "p1" }] as never);
    vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ closed: true }));
    const team = vi.spyOn(api, "teamBoard").mockImplementation((async (assignee?: string) => (assignee ? (over.mine ?? []) : (over.team ?? []))) as never);
    vi.spyOn(api, "timeReport").mockResolvedValue((over.time ?? []) as never);
    return team;
  };

  it("greets the person, counts their work and groups tasks by due date", async () => {
    setup({
      mine: [
        column({ title: "Бэклог", cards: [card({ id: "a", title: "Просроченная", dueDate: day(-2) }), card({ id: "b", number: 2, title: "Сегодняшняя", dueDate: day(0) }), card({ id: "c", number: 3, title: "На неделе", dueDate: day(0) }), card({ id: "d", number: 4, title: "Потом", dueDate: day(40) }), card({ id: "e", number: 5, title: "Без срока" })] }),
        column({ id: "done", title: "Готово", cards: [card({ id: "z", number: 9, title: "Сделана" })] }),
      ],
      team: [column({ title: "Бэклог", cards: [card({}), card({ id: "q", number: 2 })] }), column({ id: "done", title: "Готово", cards: [] })],
      time: [
        { id: "t1", minutes: 90, date: "2026-10-05", user: { id: "u1", name: "Иван Петров" }, card: { id: "a", number: 1, title: "Просроченная", project: { id: "p1", title: "Сайт" } } },
        { id: "t2", minutes: 30, date: "2026-10-06", user: { id: "u2", name: "Анна Смирнова" }, card: { id: "b", number: 2, title: "Сегодняшняя", project: { id: "p1", title: "Сайт" } } },
      ],
    });
    render(<DashboardPage />);
    expect(await screen.findByText("Здравствуйте, Иван")).toBeInTheDocument();
    expect((await screen.findAllByText("Просроченная")).length).toBeGreaterThan(0);
    for (const heading of ["Просрочено", "Сегодня", "Позже и без срока"]) expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    expect(screen.queryByText("Сделана")).toBeNull(); // last column = done
    expect(screen.getByText("Время за неделю")).toBeInTheDocument();
    expect(screen.getAllByText("1 ч 30 мин").length).toBeGreaterThan(0);
    expect(screen.getByText("2 открытых карточек в активных проектах")).toBeInTheDocument();
    expect(screen.getByText("Последние списания")).toBeInTheDocument();
  });

  it("shows empty states", async () => {
    setup();
    render(<DashboardPage />);
    expect(await screen.findByText("Открытых задач нет")).toBeInTheDocument();
    expect(screen.getByText("На этой неделе время ещё не списывали.")).toBeInTheDocument();
  });

  it("copes with failing requests", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    vi.spyOn(api, "projects").mockRejectedValue(new Error("x"));
    vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ closed: true }));
    vi.spyOn(api, "teamBoard").mockRejectedValue(new Error("x"));
    vi.spyOn(api, "timeReport").mockRejectedValue(new Error("x"));
    render(<DashboardPage />);
    expect(await screen.findByText("Открытых задач нет")).toBeInTheDocument();
  });

  it("opens a task in the card window and reloads when it changed", async () => {
    nav.path = "/dashboard";
    const team = setup({ mine: [column({ cards: [card({ id: "a", title: "Моя задача", dueDate: day(0) })] }), column({ id: "d", title: "Готово" })] });
    vi.spyOn(api, "card").mockRejectedValue(new Error("демо"));
    render(<DashboardPage />);
    await userEvent.click(await screen.findByText("Моя задача"));
    expect(nav.router.replace).toHaveBeenCalledWith("/dashboard?card=a", { scroll: false });
    expect(team).toHaveBeenCalled();
  });

  it("shows the onboarding checklist for a new owner", async () => {
    setup();
    vi.mocked(api.me);
    vi.spyOn(api, "onboarding").mockResolvedValue(onboarding());
    render(<DashboardPage />);
    expect(await screen.findByText("Начало работы")).toBeInTheDocument();
  });
});

describe("projects list", () => {
  const projects = [
    { id: "p1", title: "Сайт", status: "ACTIVE", deadline: "2000-01-01T00:00:00.000Z", _count: { cards: 7 } },
    { id: "p2", title: "Приложение", status: "ON_HOLD", deadline: null, _count: { cards: 0 } },
    { id: "p3", title: "Старый", status: "DONE", deadline: "2000-01-01T00:00:00.000Z", _count: { cards: 2 } },
  ] as never;

  it("lists projects with status, count and deadline, marking overdue active ones", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    const list = vi.spyOn(api, "projects").mockResolvedValue(projects);
    render(<ProjectsPage />);
    expect(await screen.findByText("Сайт")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith("ACTIVE");
    expect(screen.getByRole("link", { name: /Сайт/ })).toHaveAttribute("href", "/projects/p1");
    expect(screen.getByText("В работе", { selector: "span.inline-flex" })).toBeInTheDocument();
    expect(screen.getAllByText(/2000/)[0].className).toContain("text-danger");
    expect(screen.getAllByText(/2000/)[1].className).not.toContain("text-danger"); // finished project
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("filters by status and offers creation to those who may", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    const list = vi.spyOn(api, "projects").mockResolvedValue([]);
    vi.spyOn(api, "templates").mockResolvedValue([]);
    render(<ProjectsPage />);
    expect(await screen.findByText("Нет проектов в работе")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Архив" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith("ARCHIVED"));
    expect(await screen.findByText("Здесь пусто")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Все" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(undefined));
    await userEvent.click(screen.getAllByRole("button", { name: /Новый проект/ })[0]);
    expect(screen.getByRole("dialog", { name: "Новый проект" })).toBeInTheDocument();
  });

  it("hides creation without the right and survives a failed load", async () => {
    vi.spyOn(api, "me").mockResolvedValue(member({ permissions: [] }));
    vi.spyOn(api, "projects").mockRejectedValue(new Error("x"));
    render(<ProjectsPage />);
    expect(await screen.findByText("Нет проектов в работе")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новый проект/ })).toBeNull();
  });

  it("opens the creation dialog straight away for ?new=1", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    vi.spyOn(api, "projects").mockResolvedValue([]);
    vi.spyOn(api, "templates").mockResolvedValue([]);
    window.history.pushState({}, "", "/projects?new=1");
    render(<ProjectsPage />);
    expect(await screen.findByRole("dialog", { name: "Новый проект" })).toBeInTheDocument();
    window.history.pushState({}, "", "/");
  });
});

describe("team board", () => {
  const cols = [
    column({ title: "Бэклог", cards: [card({ id: "a", title: "Задача А", assignees: [{ user: { id: "u1", name: "Иван" } }] }), card({ id: "b", number: 2, title: "Задача Б" })] }),
    column({ id: "done", title: "Готово", cards: [] }),
  ];
  const setup = () => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    vi.spyOn(api, "users").mockResolvedValue([user(), member()]);
    vi.spyOn(api, "labels").mockResolvedValue([]);
    vi.spyOn(api, "projects").mockResolvedValue([{ id: "p1" }] as never);
    return vi.spyOn(api, "teamBoard").mockResolvedValue(cols as never);
  };

  it("shows everyone's cards grouped by stage, with the count and project", async () => {
    const board = setup();
    render(<TeamBoardPage />);
    expect(await screen.findByText("Задача А")).toBeInTheDocument();
    expect(board).toHaveBeenCalledWith(undefined);
    expect(screen.getAllByText("Проект").length).toBeGreaterThan(0);
    expect(screen.getByText("2 карточки")).toBeInTheDocument();
    expect(within(screen.getByRole("tablist", { name: "Чьи задачи" })).getByRole("tab", { name: "Все" })).toHaveAttribute("aria-selected", "true");
  });

  it("narrows to my cards with ?mine=1 and switches views", async () => {
    nav.search = "mine=1";
    const board = setup();
    render(<TeamBoardPage />);
    await waitFor(() => expect(board).toHaveBeenCalledWith("u1"));
    const whose = within(screen.getByRole("tablist", { name: "Чьи задачи" }));
    await userEvent.click(whose.getByRole("tab", { name: "Все" }));
    expect(nav.router.replace).toHaveBeenCalledWith("/team");
    await userEvent.click(whose.getByRole("tab", { name: "Мои" }));
    expect(nav.router.replace).toHaveBeenCalledWith("/team?mine=1");
  });

  it("filters by text and says when there are no active projects", async () => {
    setup();
    render(<TeamBoardPage />);
    await screen.findByText("Задача А");
    await userEvent.type(screen.getByLabelText("Найти карточку на доске"), "Б");
    await waitFor(() => expect(screen.queryByText("Задача А")).toBeNull());
    expect(screen.getByText("Задача Б")).toBeInTheDocument();
  });

  it("explains an empty team board", async () => {
    setup();
    vi.spyOn(api, "teamBoard").mockResolvedValue([]);
    render(<TeamBoardPage />);
    expect(await screen.findByText("Активных проектов пока нет.")).toBeInTheDocument();
  });

  it("opens a card in the window", async () => {
    nav.path = "/team";
    setup();
    vi.spyOn(api, "card").mockRejectedValue(new Error("x"));
    render(<TeamBoardPage />);
    await userEvent.click(await screen.findByText("Задача А"));
    expect(nav.router.replace).toHaveBeenCalledWith("/team?card=a", { scroll: false });
  });
});
