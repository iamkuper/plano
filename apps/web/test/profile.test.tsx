import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfilePage from "@/app/profile/page";
import { api } from "@/lib/api";
import * as image from "@/lib/image";
import { onToast } from "@/lib/toast";
import { user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const me = (over: object = {}) => user({ name: "Иван Петров", roleName: "Администратор", ...over });
const setup = (over: object = {}) => vi.spyOn(api, "me").mockResolvedValue(me(over));

describe("profile", () => {
  it("shows placeholders, then the sections", async () => {
    setup();
    const { container } = render(<ProfilePage />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(await screen.findByText("Фото")).toBeInTheDocument();
    expect(screen.getByText("Пароль")).toBeInTheDocument();
    expect(screen.getByText(/Роль: Администратор/)).toBeInTheDocument();
  });

  it("saves name, e-mail and the e-mail preference", async () => {
    setup();
    const update = vi.spyOn(api, "updateMe").mockResolvedValue(me({ name: "Пётр" }));
    render(<ProfilePage />);
    const name = await screen.findByLabelText("Имя");
    const save = screen.getAllByRole("button", { name: "Сохранить" })[0];
    expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, "Пётр");
    await userEvent.click(screen.getByRole("checkbox", { name: "Дублировать уведомления на почту" }));
    await userEvent.click(save);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ name: "Пётр", email: "ivan@example.ru", emailNotifications: false }));
  });

  it("validates before sending and shows server errors", async () => {
    setup();
    const update = vi.spyOn(api, "updateMe").mockRejectedValue(new Error("Эта почта уже занята другим сотрудником"));
    render(<ProfilePage />);
    const name = await screen.findByLabelText("Имя");
    const email = screen.getByLabelText("Почта для входа");
    await userEvent.clear(name);
    await userEvent.clear(email);
    await userEvent.type(email, "bad");
    fireEvent.submit(email.closest("form")!);
    expect(await screen.findByText("Укажите имя")).toBeInTheDocument();
    expect(screen.getByText("Укажите почту в формате name@company.ru")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    await userEvent.type(name, "Иван");
    await userEvent.clear(email);
    await userEvent.type(email, "taken@example.ru");
    await userEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    expect(await screen.findByText("Эта почта уже занята другим сотрудником")).toBeInTheDocument();
  });

  it("changes the password after checks, and clears the form", async () => {
    setup();
    const change = vi.spyOn(api, "changePassword").mockResolvedValue(undefined);
    render(<ProfilePage />);
    await screen.findByLabelText("Текущий пароль");
    expect(screen.getByRole("button", { name: "Изменить пароль" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Новый пароль"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Изменить пароль" }));
    expect(await screen.findByText("Введите текущий пароль")).toBeInTheDocument();
    expect(screen.getAllByText("Не короче 8 символов").length).toBeGreaterThan(0);
    expect(screen.getByText("Пароли не совпадают")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Текущий пароль"), "old-password");
    await userEvent.clear(screen.getByLabelText("Новый пароль"));
    await userEvent.type(screen.getByLabelText("Новый пароль"), "new-password-1");
    await userEvent.type(screen.getByLabelText("Повторите новый"), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Изменить пароль" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith("old-password", "new-password-1"));
    await waitFor(() => expect(screen.getByLabelText("Текущий пароль")).toHaveValue(""));
  });

  it("shows a wrong current password under that field", async () => {
    setup();
    vi.spyOn(api, "changePassword").mockRejectedValue(new Error("Текущий пароль указан неверно"));
    render(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Текущий пароль"), "wrong");
    await userEvent.type(screen.getByLabelText("Новый пароль"), "new-password-1");
    await userEvent.type(screen.getByLabelText("Повторите новый"), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Изменить пароль" }));
    expect(await screen.findByText("Текущий пароль указан неверно")).toBeInTheDocument();
  });

  it("uploads a photo (cropped), replaces and removes it", async () => {
    setup();
    vi.spyOn(image, "imageToAvatarDataUrl").mockResolvedValue("data:image/jpeg;base64,AAAA");
    const set = vi.spyOn(api, "setAvatar").mockResolvedValueOnce(me({ avatarUrl: "data:image/jpeg;base64,AAAA" })).mockResolvedValue(me());
    const { container } = render(<ProfilePage />);
    await screen.findByRole("button", { name: "Загрузить фото" });
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "me.png", { type: "image/png" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA"));
    expect(await screen.findByRole("button", { name: "Заменить фото" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(set).toHaveBeenLastCalledWith(null));
    expect(await screen.findByRole("button", { name: "Загрузить фото" })).toBeInTheDocument();
  });

  it("accepts a dropped photo and reports bad files", async () => {
    setup();
    const crop = vi.spyOn(image, "imageToAvatarDataUrl").mockRejectedValue(new Error("Выберите файл изображения: JPG, PNG или WebP"));
    render(<ProfilePage />);
    const zone = (await screen.findByRole("button", { name: "Загрузить фото" })).closest("div[class*='flex items-center gap-4']")!;
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "doc.txt", { type: "text/plain" })] } });
    expect(await screen.findByText("Выберите файл изображения: JPG, PNG или WebP")).toBeInTheDocument();
    expect(crop).toHaveBeenCalled();
    fireEvent.drop(zone, { dataTransfer: { files: [] } }); // nothing to do
  });

  it("reports a failed photo removal", async () => {
    setup({ avatarUrl: "data:image/png;base64,AA" });
    vi.spyOn(api, "setAvatar").mockRejectedValue(new Error("Сервер недоступен"));
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Удалить" }));
    expect(await screen.findByText("Сервер недоступен")).toBeInTheDocument();
  });

  it("brings the onboarding checklist back", async () => {
    setup();
    const reopen = vi.spyOn(api, "onboardingReopen").mockResolvedValue(undefined);
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Показать начало работы" }));
    expect(reopen).toHaveBeenCalled();
    await waitFor(() => expect(messages).toContain("Подсказки вернулись на главную"));
    expect(within(screen.getByText("Начало работы").closest("section")!).getByRole("button")).toBeInTheDocument();
  });

  it("reveals the calendar link on request, copies it and replaces it after confirmation", async () => {
    setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const feed = vi.spyOn(api, "calendarFeed").mockResolvedValue({ url: "https://api.example.com/calendar/aaa/plano.ics" });
    const reset = vi.spyOn(api, "resetCalendarFeed").mockResolvedValue({ url: "https://api.example.com/calendar/bbb/plano.ics" });
    render(<ProfilePage />);
    expect(feed).not.toHaveBeenCalled(); // viewing the profile creates nothing
    await userEvent.click(await screen.findByRole("button", { name: "Показать ссылку на календарь" }));
    expect(await screen.findByLabelText("Адрес календаря")).toHaveValue("https://api.example.com/calendar/aaa/plano.ics");
    const card = screen.getByLabelText("Адрес календаря").closest("section")!;
    await userEvent.click(within(card).getByRole("button", { name: "Копировать" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://api.example.com/calendar/aaa/plano.ics"));
    await userEvent.click(within(card).getByRole("button", { name: "Создать новую ссылку" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Создать новую ссылку" }));
    await waitFor(() => expect(reset).toHaveBeenCalled());
    expect(await screen.findByDisplayValue("https://api.example.com/calendar/bbb/plano.ics")).toBeInTheDocument();
  });

  it("reports a calendar link that couldn't be loaded", async () => {
    setup();
    vi.spyOn(api, "calendarFeed").mockRejectedValue(new Error("Сервер недоступен"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Показать ссылку на календарь" }));
    await waitFor(() => expect(messages).toContain("Сервер недоступен"));
  });
});
