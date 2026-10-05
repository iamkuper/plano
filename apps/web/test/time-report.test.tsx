import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "@/app/reports/time/page";
import { api } from "@/lib/api";
import { member, user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/tab-links", () => ({ HomeTabs: () => null }));

const ref = (id: string, name: string) => ({ id, name, avatarUrl: null });
const e = (id: string, minutes: number, who = ref("u1", "Иван Петров"), project = { id: "p1", title: "Сайт" }, note: string | null = null) => ({
  id, minutes, date: "2026-10-01T00:00:00Z", note, user: who,
  card: { id: "c" + id, number: 3, title: "Вёрстка", type: { name: "Задача" }, project },
});

function setup(entries: unknown[] | Error, me = user()) {
  vi.spyOn(api, "me").mockResolvedValue(me);
  vi.spyOn(api, "users").mockResolvedValue([user(), member()]);
  return entries instanceof Error ? vi.spyOn(api, "timeReport").mockRejectedValue(entries) : vi.spyOn(api, "timeReport").mockResolvedValue(entries as never);
}

describe("time report", () => {
  it("groups by employee, expands and exports", async () => {
    const report = setup([e("1", 90, undefined, undefined, "правки"), e("2", 60), e("3", 45, ref("u2", "Анна Смирнова"), { id: "p2", title: "Бот" })]);
    const create = vi.fn(() => "blob:x");
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    render(<Page />);
    expect(await screen.findByRole("button", { name: /Иван Петров/ })).toBeInTheDocument();
    expect(screen.getByText("3 ч 15 мин")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Иван Петров/ }));
    expect(screen.getByText(/— правки/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Иван Петров/ }));
    expect(screen.queryByText(/— правки/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Выгрузить в Excel/ }));
    expect(create).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Проекты" }));
    expect(await screen.findByRole("button", { name: /Бот/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Бот/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Прошлая" }));
    await userEvent.click(screen.getByRole("tab", { name: "Этот месяц" }));
    await userEvent.click(screen.getByRole("tab", { name: "Прошлый" }));
    await waitFor(() => expect(report.mock.calls.length).toBeGreaterThan(3));
    await userEvent.selectOptions(screen.getByLabelText("Сотрудник"), "u2");
    await waitFor(() => expect(report).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "u2"));
  });

  it("supports a custom period", async () => {
    const report = setup([]);
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
    await waitFor(() => expect(report).toHaveBeenLastCalledWith("2026-09-01", "2026-09-30", undefined));
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
