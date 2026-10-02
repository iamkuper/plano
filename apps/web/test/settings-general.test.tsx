import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/settings/page";
import { api } from "@/lib/api";
import { onToast } from "@/lib/toast";
import { member, user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const settings = { workspaceName: "Ромашка", cardPrefix: "TSK", defaultColumns: ["Бэклог", "В работе", "Готово"] };
const setup = (admin = true) => {
  vi.spyOn(api, "me").mockResolvedValue(admin ? user() : member());
  vi.spyOn(api, "settings").mockResolvedValue(settings as never);
  return vi.spyOn(api, "updateSettings").mockImplementation(async (patch) => ({ ...settings, ...patch }) as never);
};

describe("workspace settings", () => {
  it("renames the workspace", async () => {
    const update = setup();
    render(<SettingsPage />);
    const name = await screen.findByLabelText("Название");
    expect(within(name.closest("section")!).getByRole("button", { name: "Сохранить" })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, "Василёк");
    await userEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ workspaceName: "Василёк" }));
  });

  it("rejects an empty name before asking the server", async () => {
    const update = setup();
    render(<SettingsPage />);
    const name = await screen.findByLabelText("Название");
    await userEvent.clear(name);
    await userEvent.type(name, " ");
    await userEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    expect(await screen.findByText("Укажите название")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("changes the key prefix, uppercases it and previews it", async () => {
    const update = setup();
    render(<SettingsPage />);
    const prefix = await screen.findByLabelText("Префикс");
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "abc");
    expect(screen.getByText("ABC-12")).toBeInTheDocument();
    const card = prefix.closest("section")!;
    await userEvent.click(within(card).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ cardPrefix: "ABC" }));
  });

  it("refuses an invalid prefix", async () => {
    const update = setup();
    render(<SettingsPage />);
    const prefix = await screen.findByLabelText("Префикс");
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "a-b");
    await userEvent.click(within(prefix.closest("section")!).getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText(/От 1 до 6 букв или цифр/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("edits default stages: rename, reorder, remove, add, undo and save", async () => {
    const update = setup();
    render(<SettingsPage />);
    await screen.findByLabelText("Этап 1");
    expect(screen.getAllByTitle("Выше")[0]).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Этап 2"));
    await userEvent.type(screen.getByLabelText("Этап 2"), "Делаем");
    await userEvent.click(screen.getAllByTitle("Выше")[1]);
    expect(screen.getByLabelText("Этап 1")).toHaveValue("Делаем");
    await userEvent.click(screen.getAllByTitle("Ниже")[0]);
    await userEvent.click(screen.getAllByTitle("Убрать этап")[2]);
    expect(screen.queryByLabelText("Этап 3")).toBeNull();
    await userEvent.type(screen.getByLabelText("Новый этап"), "Проверка{enter}");
    expect(screen.getByLabelText("Этап 3")).toHaveValue("Проверка");
    await userEvent.click(screen.getByRole("button", { name: "Отменить изменения" }));
    expect(screen.getByLabelText("Этап 1")).toHaveValue("Бэклог");
    await userEvent.type(screen.getByLabelText("Новый этап"), "Приёмка{enter}");
    const section = screen.getByLabelText("Этап 1").closest("section")!;
    await userEvent.click(within(section).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ defaultColumns: ["Бэклог", "В работе", "Готово", "Приёмка"] }));
  });

  it("keeps at least one stage and ignores blank additions", async () => {
    setup();
    render(<SettingsPage />);
    await screen.findByLabelText("Этап 1");
    await userEvent.click(screen.getAllByTitle("Убрать этап")[0]);
    await userEvent.click(screen.getAllByTitle("Убрать этап")[0]);
    expect(screen.getByTitle("Нужен хотя бы один этап")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Добавить/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Этап 1"), "{backspace}".repeat(20));
    const section = screen.getByLabelText("Этап 1").closest("section")!;
    await userEvent.click(within(section).getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Нужен хотя бы один этап", { selector: "p" })).toBeInTheDocument();
  });

  it("shows server errors from saving", async () => {
    const update = setup();
    update.mockRejectedValue(new Error("Тариф закончился"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<SettingsPage />);
    const name = await screen.findByLabelText("Название");
    await userEvent.clear(name);
    await userEvent.type(name, "Новое");
    await userEvent.click(screen.getAllByRole("button", { name: "Сохранить" })[0]);
    expect(await screen.findByText("Тариф закончился")).toBeInTheDocument();
  });

  it("is read-only for members", async () => {
    setup(false);
    render(<SettingsPage />);
    expect(await screen.findByText(/Менять общие настройки может администратор/)).toBeInTheDocument();
    expect(screen.getByLabelText("Название")).toBeDisabled();
    expect(screen.getByLabelText("Префикс")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    expect(screen.queryByLabelText("Новый этап")).toBeNull();
  });

  it("shows placeholders while loading", () => {
    vi.spyOn(api, "me").mockReturnValue(new Promise(() => {}));
    vi.spyOn(api, "settings").mockReturnValue(new Promise(() => {}));
    const { container } = render(<SettingsPage />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });
});
