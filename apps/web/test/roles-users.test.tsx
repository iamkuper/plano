import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RolesPage from "@/app/settings/roles/page";
import UsersPage from "@/app/settings/users/page";
import { api } from "@/lib/api";
import { onToast } from "@/lib/toast";
import { member, user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const role = (id: string, name: string, over: object = {}) => ({ id, name, permissions: [] as string[], isDefault: false, _count: { users: 0 }, ...over }) as never;

describe("roles and permissions", () => {
  const roles = [role("r1", "Менеджер", { permissions: ["projects.create"], isDefault: true, _count: { users: 3 } }), role("r2", "Подрядчик", { _count: { users: 1 } })];
  const setup = (admin = true, list = roles) => {
    vi.spyOn(api, "me").mockResolvedValue(admin ? user() : member());
    return vi.spyOn(api, "roles").mockResolvedValue(list);
  };

  it("shows the permission matrix with roles as columns", async () => {
    setup();
    render(<RolesPage />);
    expect(await screen.findByText("Менеджер")).toBeInTheDocument();
    expect(screen.getByLabelText("Создавать проекты — Менеджер")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Создавать проекты — Подрядчик")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Роль по умолчанию")).toBeInTheDocument();
    expect(screen.getByText("Управлять тарифом и оплатой")).toBeInTheDocument();
    expect(screen.getByText("Смотреть журнал действий")).toBeInTheDocument();
    expect(screen.getByText("3 сотр.")).toBeInTheDocument();
    expect(screen.getByText("1 сотрудник")).toBeInTheDocument();
  });

  it("collects changes and saves them at once, or discards them", async () => {
    setup();
    const update = vi.spyOn(api, "updateRole").mockResolvedValue(roles[0]);
    render(<RolesPage />);
    await screen.findByText("Менеджер");
    const save = screen.getByRole("button", { name: "Сохранить" });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Создавать проекты — Подрядчик"));
    await userEvent.click(screen.getByLabelText("Создавать проекты — Менеджер"));
    expect(save).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(screen.getByLabelText("Создавать проекты — Менеджер")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByLabelText("Создавать проекты — Подрядчик"));
    await userEvent.click(screen.getByLabelText("Создавать проекты — Менеджер"));
    await userEvent.click(save);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenCalledWith("r1", { permissions: [] });
    expect(update).toHaveBeenCalledWith("r2", { permissions: ["projects.create"] });
  });

  it("reports a failed save", async () => {
    setup();
    vi.spyOn(api, "updateRole").mockRejectedValue(new Error("Нет прав"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<RolesPage />);
    await screen.findByText("Менеджер");
    await userEvent.click(screen.getByLabelText("Менять и удалять метки — Подрядчик"));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(messages).toContain("Нет прав"));
  });

  it("creates and renames roles", async () => {
    setup();
    const create = vi.spyOn(api, "createRole").mockResolvedValue(roles[0]);
    const rename = vi.spyOn(api, "updateRole").mockResolvedValue(roles[1]);
    render(<RolesPage />);
    await screen.findByText("Менеджер");
    await userEvent.click(screen.getByRole("button", { name: /Новая роль/ }));
    let dialog = screen.getByRole("dialog", { name: "Новая роль" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать роль" }));
    expect(await within(dialog).findByText("Укажите название")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Название"), "Наблюдатель");
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать роль" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Наблюдатель" }));

    const menus = screen.getAllByTitle("Действия");
    await userEvent.click(menus[1]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Переименовать" }));
    dialog = await screen.findByRole("dialog", { name: "Переименовать роль" });
    await userEvent.clear(within(dialog).getByLabelText("Название"));
    await userEvent.type(within(dialog).getByLabelText("Название"), "Фрилансер");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith("r2", { name: "Фрилансер" }));
  });

  it("shows a naming conflict in the dialog", async () => {
    setup();
    vi.spyOn(api, "createRole").mockRejectedValue(new Error("Роль с таким названием уже есть"));
    render(<RolesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новая роль/ }));
    await userEvent.type(screen.getByLabelText("Название"), "Менеджер");
    await userEvent.click(screen.getByRole("button", { name: "Создать роль" }));
    expect(await screen.findByText("Роль с таким названием уже есть")).toBeInTheDocument();
  });

  it("makes a role the default and deletes one, moving its people", async () => {
    setup();
    const upd = vi.spyOn(api, "updateRole").mockResolvedValue(roles[1]);
    const del = vi.spyOn(api, "deleteRole").mockResolvedValue(undefined);
    render(<RolesPage />);
    await screen.findByText("Менеджер");
    const menus = screen.getAllByTitle("Действия");
    expect(menus).toHaveLength(2);
    await userEvent.click(menus[1]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Сделать ролью по умолчанию" }));
    await waitFor(() => expect(upd).toHaveBeenCalledWith("r2", { isDefault: true }));
    await userEvent.click(screen.getAllByTitle("Действия")[1]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Удалить роль" }));
    expect(screen.getByText(/1 сотр\. получат роль «Менеджер»/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить роль" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("r2"));
  });

  it("the default role can only be renamed, and an empty team is explained", async () => {
    setup();
    render(<RolesPage />);
    await screen.findByText("Менеджер");
    await userEvent.click(screen.getAllByTitle("Действия")[0]);
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("explains when there are no roles, and is read-only for members", async () => {
    setup(false, []);
    render(<RolesPage />);
    expect(await screen.findByText(/Ролей пока нет/)).toBeInTheDocument();
    expect(screen.getByText("Роли и права меняет администратор.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Новая роль/ })).toBeNull();
  });

  it("members see the matrix without controls", async () => {
    setup(false);
    render(<RolesPage />);
    await screen.findByText("Менеджер");
    expect(screen.getByLabelText("Создавать проекты — Менеджер")).toBeDisabled();
    expect(screen.queryByTitle("Действия")).toBeNull();
  });
});

describe("staff page", () => {
  const people = [user(), member(), member({ id: "u3", name: "Пётр Иванов", email: "p@example.ru", isActive: false, roleId: "r1", roleName: "Менеджер" })];
  const roles = [role("r1", "Менеджер", { isDefault: true })];
  const setup = (admin = true) => {
    vi.spyOn(api, "me").mockResolvedValue(admin ? user() : member());
    vi.spyOn(api, "users").mockResolvedValue(people);
    vi.spyOn(api, "roles").mockResolvedValue(roles);
    return vi.spyOn(api, "invitations").mockResolvedValue([{ id: "i1", email: "guest@example.ru", role: "MEMBER", roleId: "r1", expiresAt: "2026-10-20T00:00:00Z", createdAt: "" }]);
  };

  it("lists people with role and status; admins can act on others but not themselves", async () => {
    setup();
    render(<UsersPage />);
    expect(await screen.findByText("Анна Смирнова")).toBeInTheDocument();
    expect(screen.getByText("(вы)")).toBeInTheDocument();
    expect(screen.getByText("Отключён")).toBeInTheDocument();
    expect(screen.getAllByText("Активен")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Сбросить пароль" })).toHaveLength(2);
    expect(screen.getByLabelText("Роль: Анна Смирнова")).toBeInTheDocument();
    expect(screen.queryByLabelText("Роль: Иван Петров")).toBeNull();
  });

  it("changes roles and switches people on and off", async () => {
    setup();
    const upd = vi.spyOn(api, "updateUser").mockResolvedValue(people[1]);
    render(<UsersPage />);
    await screen.findByText("Анна Смирнова");
    await userEvent.selectOptions(screen.getByLabelText("Роль: Анна Смирнова"), "ADMIN");
    await waitFor(() => expect(upd).toHaveBeenCalledWith("u2", { role: "ADMIN" }));
    await userEvent.selectOptions(screen.getByLabelText("Роль: Анна Смирнова"), "r1");
    await waitFor(() => expect(upd).toHaveBeenCalledWith("u2", { role: "MEMBER", roleId: "r1" }));
    await userEvent.click(screen.getByRole("button", { name: "Отключить" }));
    await waitFor(() => expect(upd).toHaveBeenCalledWith("u2", { isActive: false }));
    await userEvent.click(screen.getByRole("button", { name: "Включить" }));
    await waitFor(() => expect(upd).toHaveBeenCalledWith("u3", { isActive: true }));
  });

  it("shows why a change was refused", async () => {
    setup();
    vi.spyOn(api, "updateUser").mockRejectedValue(new Error("На тарифе Free — не больше 3 пользователей"));
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Включить" }));
    expect(await screen.findByText(/не больше 3 пользователей/)).toBeInTheDocument();
  });

  it("resets a password to a generated one and copies it", async () => {
    setup();
    const reset = vi.spyOn(api, "resetUserPassword").mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<UsersPage />);
    await screen.findByText("Анна Смирнова");
    await userEvent.click(screen.getAllByRole("button", { name: "Сбросить пароль" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Новый пароль" });
    const field = within(dialog).getByLabelText("Временный пароль");
    expect((field as HTMLInputElement).value.length).toBeGreaterThanOrEqual(8);
    await userEvent.clear(field);
    await userEvent.type(field, "short");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить пароль" }));
    expect(await within(dialog).findByText("Не короче 8 символов")).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "new-password-1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить пароль" }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith("u2", "new-password-1"));
    expect(writeText).toHaveBeenCalledWith("new-password-1");
  });

  it("adds a person directly with a temporary password", async () => {
    setup();
    const create = vi.spyOn(api, "createUser").mockResolvedValue(people[1]);
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новый сотрудник/ }));
    const dialog = screen.getByRole("dialog", { name: "Новый сотрудник" });
    await userEvent.type(within(dialog).getByLabelText("Имя"), "Олег");
    await userEvent.type(within(dialog).getByLabelText("Почта для входа"), "oleg@example.ru");
    await userEvent.type(within(dialog).getByLabelText("Временный пароль"), "password-123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Олег", email: "oleg@example.ru", password: "password-123", role: "MEMBER", roleId: "r1" }));
  });

  it("shows an error from creating a person", async () => {
    setup();
    vi.spyOn(api, "createUser").mockRejectedValue(new Error("Пользователь с такой почтой уже существует"));
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новый сотрудник/ }));
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(await screen.findByText("Пользователь с такой почтой уже существует")).toBeInTheDocument();
  });

  it("invites by e-mail: shows the link and offers to copy it", async () => {
    setup();
    const invite = vi.spyOn(api, "invite").mockResolvedValue({ id: "i2", email: "new@example.ru", link: "http://app/invite/tok", emailSent: false });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Пригласить/ }));
    const dialog = screen.getByRole("dialog", { name: "Пригласить сотрудника" });
    await userEvent.type(within(dialog).getByLabelText("Почта"), "new@example.ru");
    await userEvent.selectOptions(within(dialog).getByLabelText("Роль"), "ADMIN");
    await userEvent.click(within(dialog).getByRole("button", { name: "Пригласить" }));
    await waitFor(() => expect(invite).toHaveBeenCalledWith({ email: "new@example.ru", role: "ADMIN" }));
    const done = await screen.findByRole("dialog", { name: "Приглашение создано" });
    expect(within(done).getByText(/Письмо не отправлено: почта на сервере не настроена/)).toBeInTheDocument();
    expect(within(done).getByLabelText("Ссылка-приглашение")).toHaveValue("http://app/invite/tok");
    await userEvent.click(within(done).getByRole("button", { name: /Скопировать/ }));
    expect(writeText).toHaveBeenCalledWith("http://app/invite/tok");
    await userEvent.click(within(done).getByRole("button", { name: "Готово" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says the letter was sent when mail works, and shows invite errors", async () => {
    setup();
    const invite = vi.spyOn(api, "invite").mockResolvedValueOnce({ id: "i3", email: "ok@example.ru", link: "http://x", emailSent: true });
    render(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Пригласить/ }));
    await userEvent.type(screen.getByLabelText("Почта"), "ok@example.ru");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Пригласить" }));
    expect(await screen.findByText("Письмо отправлено на ok@example.ru")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Готово" }));

    invite.mockRejectedValueOnce(new Error("Эта почта уже зарегистрирована"));
    await userEvent.click(screen.getByRole("button", { name: /Пригласить/ }));
    await userEvent.type(screen.getByLabelText("Почта"), "dup@example.ru");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Пригласить" }));
    expect(await screen.findByText("Эта почта уже зарегистрирована")).toBeInTheDocument();
  });

  it("lists pending invitations and revokes one", async () => {
    setup();
    const revoke = vi.spyOn(api, "revokeInvitation").mockResolvedValue(undefined);
    render(<UsersPage />);
    expect(await screen.findByText("guest@example.ru")).toBeInTheDocument();
    expect(screen.getByText(/до 20 октября/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Отозвать" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("i1"));
  });

  it("opens the invite dialog from ?invite=1", async () => {
    setup();
    window.history.pushState({}, "", "/settings/users?invite=1");
    render(<UsersPage />);
    expect(await screen.findByRole("dialog", { name: "Пригласить сотрудника" })).toBeInTheDocument();
    window.history.pushState({}, "", "/");
  });

  it("gives members a read-only list", async () => {
    setup(false);
    render(<UsersPage />);
    expect(await screen.findByText("Анна Смирнова")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Пригласить/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Сбросить пароль" })).toBeNull();
    expect(screen.queryByText("guest@example.ru")).toBeNull();
  });
});
