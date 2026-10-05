import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskTypesPage from "@/app/settings/types/page";
import { api } from "@/lib/api";
import { member, taskTypes, user } from "./fixtures";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

describe("task types settings", () => {
  it("lists types, creates, edits, makes default and deletes", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    const create = vi.spyOn(api, "createTaskType").mockResolvedValue(taskTypes()[0]);
    const update = vi.spyOn(api, "updateTaskType").mockResolvedValue(taskTypes()[0]);
    const del = vi.spyOn(api, "deleteTaskType").mockResolvedValue(undefined as never);
    render(<TaskTypesPage />);
    expect(await screen.findByText("По умолчанию")).toBeInTheDocument();
    expect(screen.getByText("3 карт.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить тип Задача" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Новый тип/ }));
    await userEvent.click(screen.getByRole("button", { name: "Создать тип" }));
    expect(await screen.findByText("Укажите название типа")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Название"), "Фича");
    await userEvent.click(screen.getByRole("radio", { name: "blue" }));
    await userEvent.click(screen.getByRole("button", { name: "Создать тип" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("Фича", "blue"));

    await userEvent.click(screen.getByRole("button", { name: "Изменить тип Ошибка" }));
    await userEvent.click(screen.getByRole("radio", { name: "Без цвета" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("tt2", { name: "Ошибка", color: null }));

    await userEvent.click(screen.getByRole("button", { name: /Сделать «Ошибка» типом по умолчанию/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("tt2", { isDefault: true }));

    await userEvent.click(screen.getByRole("button", { name: "Удалить тип Ошибка" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("tt2"));
  });

  it("shows server errors in the dialog", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user());
    vi.spyOn(api, "createTaskType").mockRejectedValue(new Error("Тип с таким названием уже есть"));
    render(<TaskTypesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Новый тип/ }));
    await userEvent.type(screen.getByLabelText("Название"), "Задача");
    await userEvent.click(screen.getByRole("button", { name: "Создать тип" }));
    expect(await screen.findByText("Тип с таким названием уже есть")).toBeInTheDocument();
  });

  it("hides actions without the right", async () => {
    vi.spyOn(api, "me").mockResolvedValue(member({ permissions: [] }));
    render(<TaskTypesPage />);
    await screen.findByText("По умолчанию");
    expect(screen.queryByRole("button", { name: /Новый тип/ })).toBeNull();
  });
});
