import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectOverview } from "@/components/project-overview";
import { RecurringDialog } from "@/components/recurring-dialog";
import { api } from "@/lib/api";
import { onProjectsChanged } from "@/lib/projects-events";
import { card, column, member, user } from "./fixtures";

const project = (over: object = {}) => ({
  id: "p1", title: "Сайт", status: "ACTIVE" as const, startDate: "2026-09-01T00:00:00Z", deadline: "2026-12-01T00:00:00Z", hoursBudget: 10, createdAt: "", updatedAt: "", openCards: 2, _count: { cards: 3 }, ...over,
});

describe("project overview", () => {
  const cols = [
    column({ id: "c1", title: "Бэклог", cards: [card({ id: "a", dueDate: "2000-01-01T00:00:00Z" }), card({ id: "b", number: 2 })] }),
    column({ id: "c2", title: "Готово", cards: [card({ id: "d", number: 3 })] }),
  ];

  it("summarises cards, progress, overdue and hours against the budget", async () => {
    vi.spyOn(api, "projectStats").mockResolvedValue({ hoursBudget: 10, loggedMinutes: 90 });
    render(<ProjectOverview project={project() as never} columns={cols} onChanged={() => {}} />);
    expect(screen.getByText("в 2 колонках")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("1 из 3 в «Готово»")).toBeInTheDocument();
    expect(screen.getByText("срок уже прошёл")).toBeInTheDocument();
    expect(await screen.findByText("из 10 ч бюджета")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("осталось — 8.5 ч")).toBeInTheDocument();
    expect(screen.getByText("В работе")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Изменить" })).toHaveAttribute("href", "/projects/p1/settings");
  });

  it("shows an overspend and an unset budget", async () => {
    const stats = vi.spyOn(api, "projectStats").mockResolvedValue({ hoursBudget: 1, loggedMinutes: 180 });
    const first = render(<ProjectOverview project={project({ hoursBudget: 1, startDate: null, deadline: null }) as never} columns={[column()]} onChanged={() => {}} />);
    expect(await screen.findByText("перерасход — 2 ч")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(1);
    first.unmount();
    stats.mockResolvedValue({ hoursBudget: null, loggedMinutes: 0 });
    render(<ProjectOverview project={project({ hoursBudget: null }) as never} columns={[]} onChanged={() => {}} />);
    expect(await screen.findByText("бюджет не задан")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("всё в срок")).toBeInTheDocument();
  });

  it("ignores a failed statistics request", async () => {
    vi.spyOn(api, "projectStats").mockRejectedValue(new Error("x"));
    render(<ProjectOverview project={project() as never} columns={cols} onChanged={() => {}} />);
    await waitFor(() => expect(api.projectStats).toHaveBeenCalled());
    expect(screen.getByText("бюджет не задан")).toBeInTheDocument();
    onProjectsChanged(() => {});
  });
});

describe("recurring task dialog", () => {
  const users = [user(), member()];
  const rule = { id: "r1", projectId: "p1", title: "Отчёт", description: "Описание", type: "SETUP" as const, priority: "HIGH" as const, estimateHours: 2, assigneeIds: ["u2"], checklist: ["а", "б"], frequency: "WEEKLY" as const, interval: 2, weekday: 3, monthDay: null, dueInDays: 4, nextRunAt: "2026-11-04T06:00:00.000Z", lastRunAt: null, active: true, createdAt: "" };

  it("creates a monthly rule with the form's values", async () => {
    const create = vi.spyOn(api, "createRecurring").mockResolvedValue(rule as never);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<RecurringDialog projectId="p1" users={users} onClose={onClose} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText("Название задачи"), "  Ежемесячный отчёт ");
    await userEvent.selectOptions(screen.getByLabelText("Тип"), "SETUP");
    await userEvent.selectOptions(screen.getByLabelText("Приоритет"), "HIGH");
    await userEvent.click(screen.getByRole("checkbox", { name: "Анна Смирнова" }));
    await userEvent.type(screen.getByLabelText("Чек-лист"), "собрать{enter}  {enter}отправить");
    await userEvent.clear(screen.getByLabelText("Число месяца"));
    await userEvent.type(screen.getByLabelText("Число месяца"), "28");
    await userEvent.type(screen.getByLabelText("Срок через, дней"), "3");
    fireEvent.change(screen.getByLabelText("Начиная с"), { target: { value: "2026-11-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Настроить повторение" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith("p1", expect.objectContaining({
      title: "Ежемесячный отчёт", type: "SETUP", priority: "HIGH", assigneeIds: ["u2"], checklist: ["собрать", "отправить"],
      frequency: "MONTHLY", interval: 1, weekday: null, monthDay: 28, dueInDays: 3, startDate: "2026-11-01", description: null,
    }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("switches fields with the frequency and describes the schedule", async () => {
    render(<RecurringDialog projectId="p1" users={users} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByLabelText("Число месяца")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Повторять"), "WEEKLY");
    expect(screen.queryByLabelText("Число месяца")).toBeNull();
    expect(screen.getByLabelText("День недели")).toBeInTheDocument();
    expect(screen.getByLabelText("Каждые, недель")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("День недели"), "3");
    expect(screen.getByText(/Каждую неделю, по средам/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Повторять"), "DAILY");
    expect(screen.getByLabelText("Каждые, дней")).toBeInTheDocument();
    expect(screen.getByText(/Каждый день/)).toBeInTheDocument();
  });

  it("edits an existing rule", async () => {
    const update = vi.spyOn(api, "updateRecurring").mockResolvedValue(rule as never);
    render(<RecurringDialog projectId="p1" users={users} rule={rule as never} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByLabelText("Название задачи")).toHaveValue("Отчёт");
    expect(screen.getByLabelText("Начиная с")).toHaveValue("2026-11-04");
    expect(screen.getByRole("checkbox", { name: "Анна Смирнова" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("checkbox", { name: "Анна Смирнова" })); // remove
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("r1", expect.objectContaining({ assigneeIds: [], frequency: "WEEKLY", weekday: 3, interval: 2, estimateHours: 2, dueInDays: 4 })));
  });

  it("starts from a prefill (a card turned into a rule)", () => {
    render(<RecurringDialog projectId="p1" users={users} prefill={{ title: "Из карточки", checklist: ["один"], dueInDays: 0 }} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByLabelText("Название задачи")).toHaveValue("Из карточки");
    expect(screen.getByLabelText("Чек-лист")).toHaveValue("один");
    expect(screen.getByLabelText("Срок через, дней")).toHaveValue(0);
  });

  it("needs a title, shows server errors, and can be cancelled", async () => {
    const create = vi.spyOn(api, "createRecurring").mockRejectedValue(new Error("На тарифе Free — не больше 3 повторяющихся задач"));
    const onClose = vi.fn();
    render(<RecurringDialog projectId="p1" users={users} onClose={onClose} onSaved={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Настроить повторение" }));
    expect(await screen.findByText("Укажите название задачи")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Название задачи"), "Отчёт");
    await userEvent.click(screen.getByRole("button", { name: "Настроить повторение" }));
    expect(await screen.findByText(/не больше 3 повторяющихся задач/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
  });
});
