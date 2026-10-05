import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "@/app/reports/time/page";
import { api } from "@/lib/api";
import { onToast } from "@/lib/toast";
import { member, user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/tab-links", () => ({ HomeTabs: () => null }));

const ref = (id: string, name: string) => ({ id, name, avatarUrl: null });
const e = (id: string, minutes: number, who = ref("u1", "Иван Петров"), project = { id: "p1", title: "Сайт" }, note: string | null = null) => ({
  id, minutes, date: "2026-10-01T00:00:00Z", note, user: who,
  card: { id: "c" + id, number: 3, title: "Вёрстка", project },
});

type Row = ReturnType<typeof e>;

// A stand-in for the server: totals and groups are counted, entries come per group.
function setup(entries: Row[] | Error, me = user()) {
  vi.spyOn(api, "me").mockResolvedValue(me);
  vi.spyOn(api, "users").mockResolvedValue([user(), member()]);
  if (entries instanceof Error) {
    vi.spyOn(api, "timeEntries").mockRejectedValue(entries);
    return { summary: vi.spyOn(api, "timeSummary").mockRejectedValue(entries), entries: vi.spyOn(api, "timeEntries") };
  }
  const summary = vi.spyOn(api, "timeSummary").mockImplementation((async (_from: string, _to: string, groupBy: "user" | "project") => {
    const keyOf = (r: Row) => (groupBy === "user" ? r.user.id : r.card.project.id);
    const keys = [...new Set(entries.map(keyOf))];
    return {
      totalMinutes: entries.reduce((n, r) => n + r.minutes, 0),
      entries: entries.length,
      people: new Set(entries.map((r) => r.user.id)).size,
      projects: new Set(entries.map((r) => r.card.project.id)).size,
      groups: keys.map((k) => {
        const own = entries.filter((r) => keyOf(r) === k);
        return { key: k, label: groupBy === "user" ? own[0].user.name : own[0].card.project.title, user: groupBy === "user" ? own[0].user : null, minutes: own.reduce((n, r) => n + r.minutes, 0), entries: own.length };
      }),
    };
  }) as never);
  const page = vi.spyOn(api, "timeEntries").mockImplementation((async (_f: string, _t: string, o: { groupBy?: "user" | "project"; key?: string; offset?: number; limit?: number } = {}) => {
    const own = entries.filter((r) => !o.key || (o.groupBy === "project" ? r.card.project.id : r.user.id) === o.key);
    return { total: own.length, items: own.slice(o.offset ?? 0, (o.offset ?? 0) + (o.limit ?? 100)) };
  }) as never);
  return { summary, entries: page };
}

describe("time report", () => {
  it("groups by employee from the server's totals, loads entries when a group opens, and exports", async () => {
    const { summary, entries } = setup([e("1", 90, undefined, undefined, "правки"), e("2", 60), e("3", 45, ref("u2", "Анна Смирнова"), { id: "p2", title: "Бот" })]);
    const create = vi.fn(() => "blob:x");
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    render(<Page />);
    expect(await screen.findByRole("button", { name: /Иван Петров/ })).toBeInTheDocument();
    expect(screen.getByText("3 ч 15 мин")).toBeInTheDocument();
    expect(entries).not.toHaveBeenCalled(); // nothing but totals until a group is opened
    await userEvent.click(screen.getByRole("button", { name: /Иван Петров/ }));
    expect(await screen.findByText(/— правки/)).toBeInTheDocument();
    expect(entries).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ groupBy: "user", key: "u1" }));
    await userEvent.click(screen.getByRole("button", { name: /Иван Петров/ }));
    expect(screen.queryByText(/— правки/)).toBeNull();

    // the file is built by the server from all entries of the period
    const fetchMock = vi.fn(async () => new Response("csv"));
    vi.stubGlobal("fetch", fetchMock);
    await userEvent.click(screen.getByRole("button", { name: /Выгрузить в Excel/ }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain("/reports/time/export.csv?from=");

    await userEvent.click(screen.getByRole("tab", { name: "Проекты" }));
    expect(await screen.findByRole("button", { name: /Бот/ })).toBeInTheDocument();
    expect(summary).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "project", undefined);
    await userEvent.click(screen.getByRole("button", { name: /Бот/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Прошлая" }));
    await userEvent.click(screen.getByRole("tab", { name: "Этот месяц" }));
    await userEvent.click(screen.getByRole("tab", { name: "Прошлый" }));
    await waitFor(() => expect(summary.mock.calls.length).toBeGreaterThan(3));
    await userEvent.selectOptions(screen.getByLabelText("Сотрудник"), "u2");
    await waitFor(() => expect(summary).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "project", "u2"));
  });

  it("pages through the entries of a big group", async () => {
    const many = Array.from({ length: 130 }, (_, i) => e(String(i + 1), 10));
    const { entries } = setup(many);
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: /Иван Петров/ }));
    expect(await screen.findByRole("button", { name: "Показано 100 из 130. Показать ещё" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Показано 100 из 130. Показать ещё" }));
    await waitFor(() => expect(entries).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ offset: 100 })));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Показать ещё/ })).toBeNull());
  });

  it("reports a failed page of entries and keeps the group closed", async () => {
    const { entries } = setup([e("1", 30)]);
    entries.mockRejectedValue(new Error("Сервер недоступен"));
    const messages: string[] = [];
    onToast((m) => messages.push(m.message));
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: /Иван Петров/ }));
    await waitFor(() => expect(messages).toContain("Сервер недоступен"));
    expect(screen.getByRole("button", { name: /Иван Петров/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("supports a custom period", async () => {
    const { summary } = setup([]);
    render(<Page />);
    expect(await screen.findByText("За этот период время не списано")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Выгрузить в Excel/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("tab", { name: "Период" }));
    const from = screen.getByLabelText("С");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-09-01");
    const to = screen.getByLabelText("По");
    await userEvent.clear(to);
    await userEvent.type(to, "2026-09-30");
    await waitFor(() => expect(summary).toHaveBeenLastCalledWith("2026-09-01", "2026-09-30", "user", undefined));
  });

  it("shows minutes only, hours only and the error", async () => {
    setup([e("1", 30), e("2", 60, ref("u2", "Анна"))]);
    const { unmount } = render(<Page />);
    expect(await screen.findByText("30 мин")).toBeInTheDocument();
    expect(screen.getByText("1 ч")).toBeInTheDocument();
    unmount();
    setup(new Error("Нет доступа"));
    render(<Page />);
    expect(await screen.findByText("Нет доступа")).toBeInTheDocument();
  });

  it("hides the employee filter without the right", async () => {
    setup([], member({ permissions: [] }));
    render(<Page />);
    await screen.findByText("За этот период время не списано");
    expect(screen.queryByLabelText("Сотрудник")).toBeNull();
  });
});
