import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";
import ForgotPage from "@/app/forgot/page";
import ResetPage from "@/app/reset/[token]/page";
import InvitePage from "@/app/invite/[token]/page";
import MockPayPage from "@/app/billing/mock-pay/page";
import { api, getToken, setToken } from "@/lib/api";
import { nav } from "./nav";

const type = async (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text);

describe("login", () => {
  it("signs in and opens the dashboard", async () => {
    const login = vi.spyOn(api, "login").mockResolvedValue({ accessToken: "tok" });
    render(<LoginPage />);
    await type("Почта", "ivan@example.ru");
    await type("Пароль", "secret-123");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(login).toHaveBeenCalledWith("ivan@example.ru", "secret-123");
    expect(getToken()).toBe("tok");
  });

  it("shows the server's message when the password is wrong", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new Error("Неверная почта или пароль"));
    render(<LoginPage />);
    await type("Почта", "a@b.ru");
    await type("Пароль", "x");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByText("Неверная почта или пароль")).toBeInTheDocument();
    expect(nav.router.replace).not.toHaveBeenCalled();
  });

  it("links to registration and password recovery", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Создать рабочее пространство" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Забыли пароль?" })).toHaveAttribute("href", "/forgot");
  });
});

describe("registration", () => {
  it("creates the workspace and its first admin", async () => {
    const register = vi.spyOn(api, "register").mockResolvedValue({ accessToken: "new" });
    render(<RegisterPage />);
    await type("Название компании", "Ромашка");
    await type("Ваше имя", "Иван");
    await type("Почта", "ivan@romashka.ru");
    await type("Пароль", "password-123");
    await userEvent.click(screen.getByRole("button", { name: "Создать" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(register).toHaveBeenCalledWith("Ромашка", "Иван", "ivan@romashka.ru", "password-123");
    expect(getToken()).toBe("new");
  });

  it("explains a failure", async () => {
    vi.spyOn(api, "register").mockRejectedValue(new Error("Эта почта уже зарегистрирована"));
    render(<RegisterPage />);
    await userEvent.click(screen.getByRole("button", { name: "Создать" }));
    expect(await screen.findByText("Эта почта уже зарегистрирована")).toBeInTheDocument();
  });
});

describe("password recovery", () => {
  it("asks for the address and says the letter is on its way", async () => {
    const forgot = vi.spyOn(api, "forgotPassword").mockResolvedValue(undefined);
    render(<ForgotPage />);
    await type("Почта", "ivan@example.ru");
    await userEvent.click(screen.getByRole("button", { name: "Отправить ссылку" }));
    expect(await screen.findByText(/ушло письмо/)).toBeInTheDocument();
    expect(forgot).toHaveBeenCalledWith("ivan@example.ru");
    expect(screen.getByRole("link", { name: "Вернуться ко входу" })).toHaveAttribute("href", "/login");
  });

  it("shows an error from the server", async () => {
    vi.spyOn(api, "forgotPassword").mockRejectedValue(new Error("Укажите почту"));
    render(<ForgotPage />);
    await userEvent.click(screen.getByRole("button", { name: "Отправить ссылку" }));
    expect(await screen.findByText("Укажите почту")).toBeInTheDocument();
  });

  it("sets a new password and returns to the login page", async () => {
    nav.params = { token: "tok123" };
    const reset = vi.spyOn(api, "resetPassword").mockResolvedValue(undefined);
    render(<ResetPage />);
    await type("Пароль", "brand-new-pass-1");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить пароль" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/login"));
    expect(reset).toHaveBeenCalledWith("tok123", "brand-new-pass-1");
  });

  it("offers to ask again when the link is stale", async () => {
    nav.params = { token: "old" };
    vi.spyOn(api, "resetPassword").mockRejectedValue(new Error("Ссылка недействительна или устарела"));
    render(<ResetPage />);
    await userEvent.click(screen.getByRole("button", { name: "Сохранить пароль" }));
    expect(await screen.findByText(/Ссылка недействительна/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Запросить заново" })).toHaveAttribute("href", "/forgot");
  });
});

describe("invitation", () => {
  it("shows the company, takes name and password, and signs the person in", async () => {
    nav.params = { token: "inv1" };
    vi.spyOn(api, "invitationPreview").mockResolvedValue({ email: "guest@example.ru", workspaceName: "Ромашка" });
    const accept = vi.spyOn(api, "acceptInvite").mockResolvedValue({ accessToken: "joined" });
    render(<InvitePage />);
    expect(await screen.findByText("Присоединиться к «Ромашка»")).toBeInTheDocument();
    expect(screen.getByText("guest@example.ru")).toBeInTheDocument();
    await type("Ваше имя", "Гость");
    await type("Пароль", "password-123");
    await userEvent.click(screen.getByRole("button", { name: "Принять приглашение" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(accept).toHaveBeenCalledWith("inv1", "Гость", "password-123");
    expect(getToken()).toBe("joined");
  });

  it("explains an invalid link and shows form errors", async () => {
    nav.params = { token: "bad" };
    vi.spyOn(api, "invitationPreview").mockRejectedValue(new Error("Приглашение недействительно или устарело"));
    const { unmount } = render(<InvitePage />);
    expect(await screen.findByText("Приглашение недействительно")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ко входу" })).toHaveAttribute("href", "/login");
    unmount();

    vi.spyOn(api, "invitationPreview").mockResolvedValue({ email: "g@e.ru", workspaceName: "К" });
    vi.spyOn(api, "acceptInvite").mockRejectedValue(new Error("Пароль — не короче 8 символов"));
    render(<InvitePage />);
    await screen.findByText("Присоединиться к «К»");
    await userEvent.click(screen.getByRole("button", { name: "Принять приглашение" }));
    expect(await screen.findByText("Пароль — не короче 8 символов")).toBeInTheDocument();
  });
});

describe("test payment page", () => {
  it("approves or declines the order and goes back to billing", async () => {
    nav.search = "order=ord%201";
    const pay = vi.spyOn(api, "mockPay").mockResolvedValue(undefined);
    const { unmount } = render(<MockPayPage />);
    await userEvent.click(screen.getByRole("button", { name: "Оплатить" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/settings/billing?paid=1"));
    expect(pay).toHaveBeenCalledWith("ord 1", true);
    unmount();
    render(<MockPayPage />);
    await userEvent.click(screen.getByRole("button", { name: "Отклонить платёж" }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenLastCalledWith("/settings/billing?paid=0"));
    expect(pay).toHaveBeenLastCalledWith("ord 1", false);
  });

  it("shows the error when the payment can't be found", async () => {
    nav.search = "order=x";
    vi.spyOn(api, "mockPay").mockRejectedValue(new Error("Платёж не найден"));
    render(<MockPayPage />);
    await userEvent.click(screen.getByRole("button", { name: "Оплатить" }));
    expect(await screen.findByText("Платёж не найден")).toBeInTheDocument();
    setToken(null);
  });
});
