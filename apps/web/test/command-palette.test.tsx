import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "@/components/command-palette";
import { HeaderSearch } from "@/components/header-search";
import { api } from "@/lib/api";
import { card } from "./fixtures";
import { nav } from "./nav";

const project = { id: "p1", title: "Сайт компании" };

function setup() {
  const projects = vi.spyOn(api, "projects").mockResolvedValue([project] as never);
  const search = vi.spyOn(api, "searchCards").mockResolvedValue([]);
  render(
    <>
      <HeaderSearch />
      <CommandPalette />
      <input aria-label="Поле" />
    </>,
  );
  return { projects, search };
}
const open = () => fireEvent.keyDown(window, { key: "k", metaKey: true });
const box = () => screen.findByRole("combobox", { name: "Команда или поиск" });

describe("command palette", () => {
  it("opens with ⌘K, Ctrl+K, the search field and '/', and closes with Escape or a click outside", async () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    expect(await box()).toHaveFocus();
    expect(screen.getByRole("dialog", { name: "Палитра команд" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await box();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true }); // toggles
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Поиск" }));
    await box();
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.keyboard("/");
    await box();
  });

  it("lists sections, actions and projects, and filters them in both languages", async () => {
    const { projects } = setup();
    open();
    const input = await box();
    expect(projects).toHaveBeenCalledWith("ACTIVE");
    const list = screen.getByRole("listbox");
    expect(await within(list).findByText("Сайт компании")).toBeInTheDocument();
    expect(within(list).getByText("Перейти")).toBeInTheDocument();
    expect(within(list).getByText("Действия")).toBeInTheDocument();
    expect(within(list).getByText("Биллинг")).toBeInTheDocument();

    await userEvent.type(input, "billing"); // the other language finds it too
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    expect(within(list).getByRole("option", { name: /Биллинг/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.clear(input);
    await userEvent.type(input, "несуществующее");
    expect(await screen.findByText("Ничего не найдено")).toBeInTheDocument();
  });

  it("runs a command with Enter or a click, moving with the arrow keys", async () => {
    setup();
    open();
    const input = await box();
    await userEvent.type(input, "биллинг{Enter}");
    expect(nav.router.push).toHaveBeenLastCalledWith("/settings/billing");
    expect(screen.queryByRole("dialog")).toBeNull();

    open();
    await box();
    const options = () => screen.getAllByRole("option");
    expect(options()[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(options()[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(options()[options().length - 1]).toHaveAttribute("aria-selected", "true"); // wraps around
    await userEvent.keyboard("{Enter}");
    expect(nav.router.push).toHaveBeenCalledTimes(2);

    open();
    await userEvent.click(await screen.findByRole("option", { name: /Сайт компании/ }));
    expect(nav.router.push).toHaveBeenLastCalledWith("/projects/p1");
  });

  it("finds cards after a pause and opens one", async () => {
    const { search } = setup();
    search.mockResolvedValue([card({ id: "c9", title: "Бриф клиента", project: { id: "p7", title: "Сайт" } })]);
    open();
    await userEvent.type(await box(), "бриф");
    expect(await screen.findByText("TSK-1, Сайт")).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith("бриф");
    await userEvent.click(screen.getByText("Бриф клиента"));
    expect(nav.router.push).toHaveBeenCalledWith("/projects/p7?card=c9");
  });

  it("ignores failed lookups and does not search an empty query", async () => {
    const { search } = setup();
    search.mockRejectedValue(new Error("x"));
    open();
    const input = await box();
    await userEvent.type(input, " ");
    await new Promise((r) => setTimeout(r, 300));
    expect(search).not.toHaveBeenCalled();
    await userEvent.type(input, "ab");
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("creates a project and signs out", async () => {
    setup();
    open();
    await userEvent.type(await box(), "создать проект{Enter}");
    expect(nav.router.push).toHaveBeenLastCalledWith("/projects?new=1");

    localStorage.setItem("token", "t");
    open();
    await userEvent.type(await box(), "выйти{Enter}");
    expect(nav.router.replace).toHaveBeenCalledWith("/login");
  });
});

describe("keyboard shortcuts", () => {
  it("G then a letter jumps to a section", async () => {
    setup();
    await userEvent.keyboard("gp");
    expect(nav.router.push).toHaveBeenLastCalledWith("/projects");
    await userEvent.keyboard("gd");
    expect(nav.router.push).toHaveBeenLastCalledWith("/dashboard");
    await userEvent.keyboard("gt");
    expect(nav.router.push).toHaveBeenLastCalledWith("/team");
    await userEvent.keyboard("gr");
    expect(nav.router.push).toHaveBeenLastCalledWith("/reports/time");
    await userEvent.keyboard("gs");
    expect(nav.router.push).toHaveBeenLastCalledWith("/settings");
    await userEvent.keyboard("gu");
    expect(nav.router.push).toHaveBeenLastCalledWith("/profile");
    const calls = vi.mocked(nav.router.push).mock.calls.length;
    await userEvent.keyboard("gx"); // unknown letter: nothing
    await userEvent.keyboard("p"); // the "g" is spent
    expect(nav.router.push).toHaveBeenCalledTimes(calls);
  });

  it("'?' lists the shortcuts; keys are ignored while typing or with modifiers", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Поле"), "gp?/");
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    (document.activeElement as HTMLElement).blur();

    fireEvent.keyDown(window, { key: "g", altKey: true });
    fireEvent.keyDown(window, { key: "p", altKey: true });
    expect(nav.router.push).not.toHaveBeenCalled();

    await userEvent.keyboard("?");
    const dialog = await screen.findByRole("dialog", { name: "Горячие клавиши" });
    expect(within(dialog).getByText("Палитра команд")).toBeInTheDocument();
    expect(within(dialog).getAllByText("G").length).toBeGreaterThan(3);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the palette lists the shortcuts too", async () => {
    setup();
    open();
    await userEvent.type(await box(), "клавиши{Enter}");
    expect(await screen.findByRole("dialog", { name: "Горячие клавиши" })).toBeInTheDocument();
  });
});
