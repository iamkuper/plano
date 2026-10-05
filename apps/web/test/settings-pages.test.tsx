import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillingPage from "@/app/settings/billing/page";
import FieldsPage from "@/app/settings/fields/page";
import AuditPage from "@/app/settings/audit/page";
import PlatformPage from "@/app/platform/page";
import * as lib from "@/lib/api";
import { api } from "@/lib/api";
import { onToast } from "@/lib/toast";
import { billing, plans, user } from "./fixtures";
import { nav } from "./nav";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const asAdmin = () => vi.spyOn(api, "me").mockResolvedValue(user());
const asMember = () => vi.spyOn(api, "me").mockResolvedValue(user({ role: "MEMBER", permissions: [] }));
describe("billing page", () => {
  it("shows the trial, usage and the plans with the pay buttons", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    render(<BillingPage />);
    expect(await screen.findByText("Тариф Pro")).toBeInTheDocument();
    expect(screen.getByText(/Пробный период до 16 октября 2026/)).toBeInTheDocument();
    expect(screen.getByText("Платежи идут через тестовый режим: реальные деньги не списываются.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Пользователи" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Оплатить картой" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Оплатить по счёту" })).toHaveLength(2);
    expect(screen.getByText("Дополнительные поля карточек")).toBeInTheDocument();
    expect(screen.getByText("Диаграмма Ганта")).toBeInTheDocument();
    expect(screen.getByText("Платежей пока нет.")).toBeInTheDocument();
  });

  it("starts a card payment for the chosen plan, period and seats, then goes to the bank page", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    const checkout = vi.spyOn(api, "checkout").mockResolvedValue({ paymentUrl: "https://pay.test/1" });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, set href(v: string) { assign(v); } });
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    expect(screen.getAllByText(/К оплате 980 ₽ за месяц \(2 польз\.\)/)).toHaveLength(1);
    await userEvent.click(screen.getByRole("tab", { name: "Год" }));
    expect(screen.getByText(/К оплате 9\s?800 ₽ за год/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Больше мест" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Оплатить картой" })[0]);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.test/1"));
    expect(checkout).toHaveBeenCalledWith("PRO", "YEAR", 3);
  });

  it("keeps the seat count between the active users and the cap", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    const count = screen.getByLabelText("Количество пользователей");
    expect(screen.getByRole("button", { name: "Меньше мест" })).toBeDisabled(); // 2 active users
    fireEvent.change(count, { target: { value: "7" } });
    expect(count).toHaveValue("7");
    await userEvent.click(screen.getByRole("button", { name: "Меньше мест" }));
    expect(count).toHaveValue("6");
  });

  it("reports a payment that couldn't be started", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    vi.spyOn(api, "checkout").mockRejectedValue(new Error("Платёжный сервис недоступен"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    await userEvent.click(screen.getAllByRole("button", { name: "Оплатить картой" })[0]);
    await waitFor(() => expect(messages).toContain("Платёжный сервис недоступен"));
  });

  it("requests an invoice with the company details and downloads the PDF", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(billing({ invoicePdf: true, lastPayer: { payerName: "ООО «Ромашка»", payerInn: "7701234567", payerKpp: null, payerAddress: "Москва", payerEmail: "buh@romashka.ru" } }));
    const request = vi.spyOn(api, "requestInvoice").mockResolvedValue({ id: "pay1", invoiceNumber: 17, pdf: true } as never);
    const download = vi.spyOn(lib, "downloadInvoicePdf").mockResolvedValue(undefined);
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    await userEvent.click(screen.getAllByRole("button", { name: "Оплатить по счёту" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Организация или ИП")).toHaveValue("ООО «Ромашка»"); // prefilled from the last request
    await userEvent.click(within(dialog).getByRole("button", { name: "Запросить счёт" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ planId: "PRO", interval: "MONTH", seats: 2, payerInn: "7701234567", payerKpp: null })));
    await waitFor(() => expect(download).toHaveBeenCalledWith("pay1", 17));
    expect(messages.some((m) => m.includes("Счёт №17 скачан"))).toBe(true);
  });

  it("explains a refused invoice request and the e-mail-only delivery", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    vi.spyOn(api, "requestInvoice").mockRejectedValue(new Error("Укажите юридический адрес"));
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    await userEvent.click(screen.getAllByRole("button", { name: "Оплатить по счёту" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Пришлём счёт на эту почту/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Запросить счёт" }));
    expect(await within(dialog).findByText("Укажите юридический адрес")).toBeInTheDocument();
  });

  it("tells people without the right that only an admin can pay", async () => {
    asMember();
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    expect(screen.getByText(/Менять тариф может администратор/)).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "Оплатить картой" })) expect(b).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Перейти на бесплатный" })).toBeNull();
  });

  it("lets a trial move to Free", async () => {
    asAdmin();
    const load = vi.spyOn(api, "billing").mockResolvedValue(billing());
    const free = vi.spyOn(api, "switchToFree").mockResolvedValue(undefined);
    render(<BillingPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Перейти на бесплатный" }));
    expect(free).toHaveBeenCalled();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2)); // reloaded
  });

  it("shows the read-only state of a lapsed workspace with a way out", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(
      billing({ locked: true, subscription: { planId: "PRO", status: "LOCKED", interval: "MONTH", trialEndsAt: null, currentPeriodEnd: "2026-09-30T00:00:00.000Z", cancelAtPeriodEnd: false, cardMask: null, seats: 2 } }),
    );
    render(<BillingPage />);
    expect(await screen.findByText("Тариф Pro закончился")).toBeInTheDocument();
    expect(screen.getByText(/Данные доступны только для чтения, оплата открыта/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Перейти на бесплатный" })).toBeInTheDocument();
    expect(screen.queryByText("Текущий тариф")).toBeNull(); // nothing is "current" while locked
    expect(screen.getAllByRole("button", { name: "Оплатить картой" })).toHaveLength(2);
  });

  it("describes a paid plan and its payment history, with invoices", async () => {
    asAdmin();
    const paid = billing({
      subscription: { planId: "PRO", status: "ACTIVE", interval: "MONTH", trialEndsAt: null, currentPeriodEnd: "2026-11-02T00:00:00.000Z", cancelAtPeriodEnd: false, cardMask: null, seats: 2 },
      seatLimit: 2,
      payments: [
        { id: "p1", kind: "INITIAL", method: "CARD", invoiceNumber: null, payerName: null, failReason: null, planId: "PRO", interval: "MONTH", seats: 2, amount: 98000, status: "PAID", createdAt: "2026-10-02T00:00:00.000Z", paidAt: "2026-10-02T00:00:00.000Z" },
        { id: "p2", kind: "RENEWAL", method: "CARD", invoiceNumber: null, payerName: null, failReason: null, planId: "PRO", interval: "MONTH", seats: 2, amount: 98000, status: "FAILED", createdAt: "2026-10-03T00:00:00.000Z", paidAt: null },
        { id: "p3", kind: "INITIAL", method: "INVOICE", invoiceNumber: 5, payerName: "ООО «Ромашка»", failReason: null, planId: "BUSINESS", interval: "YEAR", seats: 1, amount: 990000, status: "PENDING", createdAt: "2026-10-04T00:00:00.000Z", paidAt: null },
        { id: "p4", kind: "SEATS", method: "INVOICE", invoiceNumber: 6, payerName: null, failReason: "Заменён новым счётом", planId: "PRO", interval: "MONTH", seats: 1, amount: 10000, status: "FAILED", createdAt: "2026-10-05T00:00:00.000Z", paidAt: null },
      ],
    });
    vi.spyOn(api, "billing").mockResolvedValue(paid);
    const download = vi.spyOn(lib, "downloadInvoicePdf").mockResolvedValue(undefined);
    const cancel = vi.spyOn(api, "cancelInvoice").mockResolvedValue(undefined);
    render(<BillingPage />);
    expect(await screen.findByText(/Оплачен до 2 ноября 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Автоматических списаний нет/)).toBeInTheDocument();
    expect(screen.getByText("Оплачен")).toBeInTheDocument();
    expect(screen.getByText("Не прошёл")).toBeInTheDocument();
    expect(screen.getByText("Ждём оплату по счёту")).toBeInTheDocument();
    expect(screen.getByText("Заменён новым счётом")).toBeInTheDocument();
    expect(screen.getByText(/докупка мест/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продлить картой" })).toBeInTheDocument(); // same plan, period and seats

    await userEvent.click(screen.getAllByRole("button", { name: /Скачать счёт/ })[0]);
    await waitFor(() => expect(download).toHaveBeenCalledWith("p3", 5));
    await userEvent.click(screen.getByRole("button", { name: "Отменить" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("p3"));
  });

  it("offers extra seats pro rata inside a paid period", async () => {
    asAdmin();
    const future = new Date(Date.now() + 20 * 86_400_000).toISOString();
    vi.spyOn(api, "billing").mockResolvedValue(
      billing({ subscription: { planId: "PRO", status: "ACTIVE", interval: "MONTH", trialEndsAt: null, currentPeriodEnd: future, cancelAtPeriodEnd: false, cardMask: null, seats: 2 }, seatLimit: 2 }),
    );
    const buy = vi.spyOn(api, "buySeats").mockResolvedValue({ paymentUrl: "https://pay.test/seats" });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, set href(v: string) { assign(v); } });
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    await userEvent.click(screen.getByRole("button", { name: "Больше мест" }));
    expect(screen.getByText(/Докупить 1 место до/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Докупить картой" }));
    await waitFor(() => expect(buy).toHaveBeenCalledWith(1));
    expect(assign).toHaveBeenCalledWith("https://pay.test/seats");
  });

  it("shows other states: past due, free", async () => {
    asAdmin();
    const base = billing();
    const sub = (over: object) => ({ ...base.subscription, status: "ACTIVE" as const, trialEndsAt: null, currentPeriodEnd: "2026-11-02T00:00:00.000Z", seats: 2, ...over });
    const spy = vi.spyOn(api, "billing");
    spy.mockResolvedValue(billing({ plan: plans[0], subscription: sub({ planId: "FREE", currentPeriodEnd: null, seats: null }) }));
    render(<BillingPage />);
    expect(await screen.findByText("Бесплатный тариф")).toBeInTheDocument();
  });

  it("returning from the bank announces the result and re-reads the plan", async () => {
    asAdmin();
    nav.search = "paid=1";
    const load = vi.spyOn(api, "billing").mockResolvedValue(billing());
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    expect(messages).toContain("Оплата получена, тариф обновится через несколько секунд");
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(1), { timeout: 3500 });
  });

  it("announces a failed return too", async () => {
    asAdmin();
    nav.search = "paid=0";
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<BillingPage />);
    await screen.findByText("Тариф Pro");
    expect(messages).toContain("Оплата не прошла. Попробуйте ещё раз");
  });
});

describe("custom fields page", () => {
  const fields = [
    { id: "f1", name: "Бюджет", type: "NUMBER" as const, options: [], position: 1 },
    { id: "f2", name: "Этап", type: "SELECT" as const, options: ["Идея", "Работа"], position: 2 },
  ];
  const business = () => vi.spyOn(api, "billing").mockResolvedValue(billing({ plan: plans[2] }));

  it("locks creation below Business but still lists the fields", async () => {
    asAdmin();
    vi.spyOn(api, "billing").mockResolvedValue(billing());
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    render(<FieldsPage />);
    expect(await screen.findByText("Бюджет")).toBeInTheDocument();
    expect(screen.getByText(/есть на тарифе Business/)).toBeInTheDocument();
    expect(screen.getByText("Список: Идея, Работа")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новое поле/ })).toBeNull();
    expect(screen.queryByLabelText("Удалить поле Бюджет")).toBeNull();
  });

  it("creates fields of every type, including a list with options", async () => {
    asAdmin();
    business();
    vi.spyOn(api, "fields").mockResolvedValue([]);
    const create = vi.spyOn(api, "createField").mockResolvedValue(fields[0]);
    render(<FieldsPage />);
    expect(await screen.findByText(/Полей пока нет/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /Новое поле/ }));
    const dialog = screen.getByRole("dialog", { name: "Новое поле" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать поле" }));
    expect(await within(dialog).findByText("Укажите название")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Название"), "Этап");
    await userEvent.selectOptions(within(dialog).getByLabelText("Тип"), "SELECT");
    await userEvent.type(within(dialog).getByLabelText("Варианты"), "Идея{enter}Работа{enter}{enter}Готово");
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать поле" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Этап", type: "SELECT", options: ["Идея", "Работа", "Готово"] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the server's complaint in the dialog", async () => {
    asAdmin();
    business();
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    vi.spyOn(api, "createField").mockRejectedValue(new Error("Поле с таким названием уже есть"));
    render(<FieldsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новое поле/ }));
    await userEvent.type(screen.getByLabelText("Название"), "Бюджет");
    await userEvent.click(screen.getByRole("button", { name: "Создать поле" }));
    expect(await screen.findByText("Поле с таким названием уже есть")).toBeInTheDocument();
  });

  it("renames a field (type is locked) and deletes it after confirmation", async () => {
    asAdmin();
    business();
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    const update = vi.spyOn(api, "updateField").mockResolvedValue(fields[1]);
    const remove = vi.spyOn(api, "deleteField").mockResolvedValue(undefined);
    render(<FieldsPage />);
    await userEvent.click(await screen.findByLabelText("Изменить поле Этап"));
    const dialog = screen.getByRole("dialog", { name: "Изменить поле" });
    expect(within(dialog).getByLabelText("Тип")).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText("Название"));
    await userEvent.type(within(dialog).getByLabelText("Название"), "Стадия");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("f2", { name: "Стадия", options: ["Идея", "Работа"] }));

    await userEvent.click(screen.getByLabelText("Удалить поле Бюджет"));
    expect(screen.getByText(/Значения этого поля во всех карточках тоже удалятся/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("f1"));
  });

  it("members can read but not manage", async () => {
    asMember();
    business();
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    render(<FieldsPage />);
    expect(await screen.findByText("Бюджет")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новое поле/ })).toBeNull();
  });
});

describe("audit page", () => {
  const entry = (id: string, summary: string, user: { id: string; name: string } | null = { id: "u1", name: "Иван" }) => ({ id, action: "project.create", summary, entityId: null, createdAt: "2026-10-02T12:30:00.000Z", user });

  it("lists entries, loads more and filters by group", async () => {
    const audit = vi.spyOn(api, "audit");
    audit.mockResolvedValueOnce({ items: [entry("a", "Создан проект «Сайт»"), entry("b", "Рестарт", null)], next: "b" });
    render(<AuditPage />);
    expect(await screen.findByText("Создан проект «Сайт»")).toBeInTheDocument();
    expect(screen.getByText("Система")).toBeInTheDocument();
    audit.mockResolvedValueOnce({ items: [entry("c", "Удалена роль «Х»")], next: null });
    await userEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
    expect(await screen.findByText("Удалена роль «Х»")).toBeInTheDocument();
    expect(audit).toHaveBeenLastCalledWith("b", undefined);
    expect(screen.queryByRole("button", { name: "Показать ещё" })).toBeNull();

    audit.mockResolvedValueOnce({ items: [entry("d", "Создана роль «Р»")], next: null });
    await userEvent.click(screen.getByRole("tab", { name: "Роли" }));
    expect(await screen.findByText("Создана роль «Р»")).toBeInTheDocument();
    expect(audit).toHaveBeenLastCalledWith(undefined, "role");
  });

  it("offers the upgrade when the plan has no journal", async () => {
    vi.spyOn(api, "audit").mockRejectedValue(new Error("Эта возможность доступна на тарифе Business. Перейдите на него"));
    render(<AuditPage />);
    expect(await screen.findByText("Журнал действий есть на тарифе Business")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Посмотреть тарифы" })).toHaveAttribute("href", "/settings/billing");
  });

  it("shows other errors and the empty state", async () => {
    const audit = vi.spyOn(api, "audit").mockRejectedValue(new Error("Сервер недоступен"));
    const first = render(<AuditPage />);
    expect(await screen.findByText("Сервер недоступен")).toBeInTheDocument();
    first.unmount();
    audit.mockResolvedValue({ items: [], next: null });
    render(<AuditPage />);
    expect(await screen.findByText("Записей пока нет")).toBeInTheDocument();
  });
});

describe("platform back-office", () => {
  const stats = { workspaces: 12, users: 40, newWorkspaces7d: 3, newWorkspaces30d: 9, states: { trial: 5, paid: 4, free: 2, locked: 1, past_due: 0 }, mrrKopecks: 245000, paid30dKopecks: 490000, paidCount30d: 5, failedPayments7d: 2 };
  const row = (id: string, name: string, state: "trial" | "paid" | "free" | "locked" | "past_due" = "trial") => ({
    id, name, createdAt: "2026-09-20T00:00:00.000Z", owner: { email: `${id}@x.ru`, name: "Владелец" }, users: 3, projects: 2, cards: 14, planId: "PRO", state,
    trialEndsAt: "2026-10-10T00:00:00.000Z", currentPeriodEnd: null, lastPayment: null,
  });
  const detail = {
    id: "w1", name: "Ромашка", createdAt: "2026-09-20T00:00:00.000Z", state: "trial" as const, storageBytes: 5 * 1024 * 1024,
    subscription: { planId: "PRO", status: "TRIALING", interval: "MONTH", trialEndsAt: "2026-10-10T00:00:00.000Z", currentPeriodEnd: null, cardMask: null, cancelAtPeriodEnd: false },
    users: [{ id: "u1", name: "Иван", email: "i@x.ru", role: "ADMIN", isActive: true, createdAt: "2026-09-20T00:00:00.000Z" }, { id: "u2", name: "Анна", email: "a@x.ru", role: "MEMBER", isActive: false, createdAt: "2026-09-21T00:00:00.000Z" }],
    payments: [{ id: "p1", kind: "RENEWAL", planId: "PRO", seats: 2, amount: 98000, status: "PAID", createdAt: "2026-10-01T00:00:00.000Z", paidAt: "2026-10-01T00:00:00.000Z" }],
    auditLog: [{ id: "e1", action: "project.create", summary: "Создан проект «Сайт»", createdAt: "2026-10-01T00:00:00.000Z" }],
    _count: { projects: 2, cards: 14 },
  };

  it("shows totals and the list of companies", async () => {
    vi.spyOn(api, "platformStats").mockResolvedValue(stats);
    vi.spyOn(api, "platformWorkspaces").mockResolvedValue({ items: [row("w1", "Ромашка"), row("w2", "Василёк", "paid")], next: null });
    render(<PlatformPage />);
    expect(await screen.findByText("Ромашка")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("2 450 ₽")).toBeInTheDocument();
    expect(screen.getByText(/за 30 дней получено 4\s?900 ₽/)).toBeInTheDocument();
    expect(screen.getAllByText("Пробный").length).toBeGreaterThan(0);
    expect(screen.getByText("Оплачен, PRO")).toBeInTheDocument();
  });

  it("searches, filters by state and pages", async () => {
    vi.spyOn(api, "platformStats").mockResolvedValue(stats);
    const list = vi.spyOn(api, "platformWorkspaces").mockResolvedValue({ items: [row("w1", "Ромашка")], next: "w1" });
    render(<PlatformPage />);
    await screen.findByText("Ромашка");
    await userEvent.type(screen.getByLabelText("Поиск"), "роз");
    await waitFor(() => expect(list).toHaveBeenCalledWith({ q: "роз", state: "", cursor: undefined }));
    await userEvent.click(screen.getByRole("tab", { name: "Заблокирован" }));
    await waitFor(() => expect(list).toHaveBeenCalledWith({ q: "роз", state: "locked", cursor: undefined }));
    list.mockResolvedValue({ items: [row("w9", "Следующая")], next: null });
    await userEvent.click(await screen.findByRole("button", { name: "Показать ещё" }));
    expect(await screen.findByText("Следующая")).toBeInTheDocument();
  });

  it("opens a company and changes its subscription", async () => {
    vi.spyOn(api, "platformStats").mockResolvedValue(stats);
    vi.spyOn(api, "platformWorkspaces").mockResolvedValue({ items: [row("w1", "Ромашка")], next: null });
    vi.spyOn(api, "platformWorkspace").mockResolvedValue(detail);
    const change = vi.spyOn(api, "platformChangeSubscription").mockResolvedValue({ ...detail, state: "paid" });
    render(<PlatformPage />);
    await userEvent.click(await screen.findByText("Ромашка"));
    const dialog = await screen.findByRole("dialog", { name: "Ромашка" });
    expect(within(dialog).getByText("2 / 14")).toBeInTheDocument();
    expect(within(dialog).getByText("5 МБ")).toBeInTheDocument();
    expect(within(dialog).getByText(/Анна/)).toBeInTheDocument();
    expect(within(dialog).getByText(/отключён/)).toBeInTheDocument();
    expect(within(dialog).getByText(/980 ₽/)).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText("Тариф"), "BUSINESS");
    await userEvent.clear(within(dialog).getByLabelText("Дней"));
    await userEvent.type(within(dialog).getByLabelText("Дней"), "45");
    await userEvent.click(within(dialog).getByRole("button", { name: "Выдать тариф" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith("w1", { action: "grant", planId: "BUSINESS", seats: 1, days: 45 }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Продлить пробный" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith("w1", { action: "extend-trial", days: 45 }));
    const seats = within(dialog).getByLabelText("Мест");
    fireEvent.change(seats, { target: { value: "5" } });
    const seatsButton = within(dialog).getByRole("button", { name: "Изменить места" });
    await waitFor(() => expect(seatsButton).toBeEnabled()); // the previous change is done
    await userEvent.click(seatsButton);
    await waitFor(() => expect(change).toHaveBeenCalledWith("w1", { action: "seats", seats: 5 }));
    await userEvent.click(within(dialog).getByRole("button", { name: "На Free" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Заблокировать" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith("w1", { action: "lock" }));
  });

  it("sends anyone who isn't allowed back to the dashboard", async () => {
    vi.spyOn(api, "platformStats").mockRejectedValue(new Error("Not Found"));
    vi.spyOn(api, "platformWorkspaces").mockRejectedValue(new Error("Not Found"));
    render(<PlatformPage />);
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/dashboard"));
  });
});
