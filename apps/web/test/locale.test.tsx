import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { chooseBrowserLocale, currentLocale } from "@plano/shared";
import userEvent from "@testing-library/user-event";
import { LanguageSwitch, LocaleGate } from "@/components/locale-gate";
import ProfilePage from "@/app/profile/page";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";
import { api } from "@/lib/api";
import { describeRecurrence } from "@/lib/recurrence";
import { useAuth } from "@/lib/use-auth";
import { setToken } from "@/lib/api";
import { toast } from "@/lib/toast";
import { user } from "./fixtures";
import { nav } from "./nav";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

// window.location.reload cannot be spied on directly in jsdom.
function stubReload() {
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  return reload;
}

describe("locale gate and switch", () => {
  it("draws nothing until the language is known, then the page, and sets <html lang>", async () => {
    render(<LocaleGate><p>контент</p></LocaleGate>);
    expect(await screen.findByText("контент")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("switches the language and reloads", async () => {
    const reload = stubReload();
    render(<LanguageSwitch />);
    expect(screen.getByRole("button", { name: "Русский" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Русский" })); // already current: nothing happens
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(reload).toHaveBeenCalled();
    expect(currentLocale()).toBe("en");
    expect(localStorage.getItem("plano.locale")).toBe("en");
  });
});

describe("pages in English", () => {
  it("sign-in and sign-up speak English, and sign-up sends the language", async () => {
    chooseBrowserLocale("en");
    const { unmount } = render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    unmount();
    const register = vi.spyOn(api, "register").mockResolvedValue({ accessToken: "tok" });
    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText("Company name"), "Acme");
    await userEvent.type(screen.getByLabelText("Your name"), "Ann");
    await userEvent.type(screen.getByLabelText("Email"), "ann@acme.test");
    await userEvent.type(screen.getByLabelText("Password"), "password-123");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(register).toHaveBeenCalledWith("Acme", "Ann", "ann@acme.test", "password-123"));
  });

  it("describes schedules in English", () => {
    chooseBrowserLocale("en");
    expect(describeRecurrence({ frequency: "DAILY", interval: 1 })).toBe("Every day");
    expect(describeRecurrence({ frequency: "WEEKLY", interval: 2, weekday: 1 })).toBe("Every 2 weeks, on Mondays");
    expect(describeRecurrence({ frequency: "MONTHLY", interval: 1, monthDay: 5 })).toBe("Every month, on day 5");
  });
});

describe("profile language", () => {
  it("saves the language on the account, then reloads", async () => {
    const reload = stubReload();
    vi.spyOn(api, "me").mockResolvedValue(user({ locale: "ru" }));
    const update = vi.spyOn(api, "updateMe").mockResolvedValue(user({ locale: "en" }));
    render(<ProfilePage />);
    await userEvent.selectOptions(await screen.findByLabelText("Язык интерфейса"), "en");
    await waitFor(() => expect(update).toHaveBeenCalledWith({ locale: "en" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(currentLocale()).toBe("en");
  });

  it("keeps the language when saving fails", async () => {
    const seen: string[] = [];
    const { onToast } = await import("@/lib/toast");
    onToast((x) => seen.push(x.message));
    vi.spyOn(api, "me").mockResolvedValue(user({ locale: "ru" }));
    vi.spyOn(api, "updateMe").mockRejectedValue(new Error("Нет связи"));
    render(<ProfilePage />);
    await userEvent.selectOptions(await screen.findByLabelText("Язык интерфейса"), "en");
    await waitFor(() => expect(seen).toContain("Нет связи"));
    expect(currentLocale()).toBe("ru");
    void toast;
  });
});

describe("account language wins", () => {
  it("switches this browser to the language saved on the account", async () => {
    const reload = stubReload();
    setToken("tok");
    vi.spyOn(api, "me").mockResolvedValue(user({ locale: "en" }));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(result.current).toBeNull();
    expect(currentLocale()).toBe("en");
    void nav;
  });

  it("does nothing when they already match", async () => {
    const reload = stubReload();
    setToken("tok");
    vi.spyOn(api, "me").mockResolvedValue(user({ locale: "ru" }));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("requests carry the language", () => {
  it("sends X-Locale", async () => {
    chooseBrowserLocale("en");
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await api.me();
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ "X-Locale": "en" });
  });
});
