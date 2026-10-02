import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Check } from "lucide-react";
import { Avatar, AvatarStack, LetterMark } from "@/components/avatar";
import { CardTypeIcon, CardTypeTag } from "@/components/card-type-icon";
import { Toaster } from "@/components/toaster";
import { HomeTabs, SettingsTabs, TabLinks } from "@/components/tab-links";
import {
  Badge, Button, Card, Checkbox, columnTone, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, Kbd, Kpi, LabelTag, Menu,
  MenuItem, MenuLabel, Modal, PageBody, PageHeader, Panel, Popover, Segmented, Select, ShareBar, Sheet, Skeleton, Spinner, StatusDot,
  statusColor, Tag, TableSkeleton, Textarea, Tooltip,
} from "@/components/ui";
import { toast } from "@/lib/toast";
import { nav } from "./nav";

describe("buttons and badges", () => {
  it("Button shows a spinner and refuses clicks while loading", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Сохранить</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button loading onClick={onClick}>Сохранить</Button>);
    const button = screen.getByRole("button", { name: "Сохранить" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    rerender(<Button variant="danger" size="sm" disabled>Удалить</Button>);
    expect(screen.getByRole("button", { name: "Удалить" })).toBeDisabled();
  });

  it("IconButton takes its accessible name from aria-label or title", () => {
    render(<><IconButton title="Закрыть"><Check /></IconButton><IconButton aria-label="Ещё" size="sm"><Check /></IconButton></>);
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ещё" })).toBeInTheDocument();
  });

  it("renders small markers", () => {
    render(<><Badge tone="success">Активен</Badge><Tag color="#f00">Метка</Tag><LabelTag label={{ name: "Срочно", color: "red" }} /><LabelTag label={{ name: "Неизвестный", color: "nope" as never }} /><Kbd>⌘K</Kbd><Spinner /><StatusDot tone="done" /><StatusDot color="#abc" /></>);
    for (const text of ["Активен", "Метка", "Срочно", "Неизвестный", "⌘K"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(columnTone(0, 4)).toBe("todo");
    expect(columnTone(3, 4)).toBe("done");
    expect(columnTone(1, 4)).toBe("progress");
    expect(statusColor("done")).toMatch(/^#/);
  });

  it("ShareBar clamps its value", () => {
    const { rerender } = render(<ShareBar value={0.4} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    rerender(<ShareBar value={7} tone="danger" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<ShareBar value={-1} tone="success" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    rerender(<ShareBar value={0.5} tone="progress" />);
    rerender(<ShareBar value={0.5} color="#123456" />);
  });
});

describe("layout pieces", () => {
  it("PageHeader shows crumbs, title, meta, subtitle and actions", () => {
    render(<PageHeader crumbs={[{ label: "Проекты", href: "/projects" }, { label: "Без ссылки" }]} title="Сайт" subtitle="Подзаголовок" meta={<span>мета</span>} actions={<button>Действие</button>} />);
    expect(screen.getByRole("link", { name: "Проекты" })).toHaveAttribute("href", "/projects");
    expect(screen.getByRole("heading", { name: "Сайт" })).toBeInTheDocument();
    for (const t of ["Без ссылки", "Подзаголовок", "мета", "Действие"]) expect(screen.getByText(t)).toBeInTheDocument();
  });

  it("Card, Panel, PageBody, Kpi and EmptyState render their parts", () => {
    render(
      <>
        <Card title="Заголовок" description="Описание" action={<button>Ещё</button>}>Тело</Card>
        <Card>Без шапки</Card>
        <Panel>Панель</Panel>
        <PageBody>Страница</PageBody>
        <Kpi label="Открытые" value={7} hint="за неделю" tone="danger" />
        <Kpi label="Хорошо" value="ок" tone="success" />
        <EmptyState icon={Check} title="Пусто" action={<button>Создать</button>}>Подсказка</EmptyState>
      </>,
    );
    for (const t of ["Заголовок", "Описание", "Тело", "Без шапки", "Панель", "Страница", "Открытые", "7", "за неделю", "Пусто", "Подсказка"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать" })).toBeInTheDocument();
  });

  it("skeletons are marked busy", () => {
    render(<><Skeleton className="h-4" /><TableSkeleton rows={2} /></>);
    expect(screen.getByLabelText("Загрузка")).toHaveAttribute("aria-busy", "true");
  });

  it("Segmented selects an option and reports counts", async () => {
    const onChange = vi.fn();
    render(<Segmented label="Вид" value="a" onChange={onChange} options={[{ value: "a", label: "Первый", count: 3 }, { value: "b", label: "Второй", icon: Check }]} />);
    expect(screen.getByRole("tab", { name: /Первый/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Второй" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("tab links highlight the current section", () => {
    nav.path = "/settings/users";
    render(<><SettingsTabs /><HomeTabs /></>);
    expect(screen.getByRole("tab", { name: "Сотрудники" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Общие" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Обзор" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(expect.arrayContaining(["Журнал", "Поля", "Тариф", "Права"]));
    nav.path = "/dashboard";
    render(<TabLinks label="Только точные" tabs={[{ href: "/dashboard", label: "Точно", exact: true }]} />);
    expect(screen.getByRole("tab", { name: "Точно" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("overlays", () => {
  it("Popover opens, closes on outside click and Escape, and can close itself", async () => {
    render(
      <div>
        <Popover trigger={(open, toggle) => <button onClick={toggle} aria-expanded={open}>Открыть</button>}>{(close) => <button onClick={close}>Внутри</button>}</Popover>
        <p>Снаружи</p>
      </div>,
    );
    await userEvent.click(screen.getByText("Открыть"));
    expect(screen.getByText("Внутри")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("Снаружи"));
    expect(screen.queryByText("Внутри")).toBeNull();
    await userEvent.click(screen.getByText("Открыть"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Внутри")).toBeNull();
    await userEvent.click(screen.getByText("Открыть"));
    await userEvent.click(screen.getByText("Внутри"));
    expect(screen.queryByText("Внутри")).toBeNull();
  });

  it("Menu lists actions and closes after one", async () => {
    const run = vi.fn();
    render(<Menu items={[{ label: "Изменить", onClick: run, icon: Check }, { label: "Удалить", onClick: run, danger: true }]} />);
    await userEvent.click(screen.getByTitle("Действия"));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    await userEvent.click(screen.getByRole("menuitem", { name: "Удалить" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    render(<><MenuLabel>Раздел</MenuLabel><MenuItem selected onClick={() => {}}>Выбрано</MenuItem></>);
    expect(screen.getByText("Раздел")).toBeInTheDocument();
  });

  it("Tooltip carries its label", () => {
    render(<Tooltip label="Подсказка"><button>Кнопка</button></Tooltip>);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Подсказка");
    render(<Tooltip label="Снизу" side="bottom"><button>Другая</button></Tooltip>);
  });

  it("Dialog closes with the button, Escape and a click on the backdrop", async () => {
    const onClose = vi.fn();
    const { container } = render(<Dialog title="Окно" description="Пояснение" onClose={onClose}>Содержимое</Dialog>);
    expect(screen.getByRole("dialog", { name: "Окно" })).toBeInTheDocument();
    expect(screen.getByText("Пояснение")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Закрыть"));
    await userEvent.keyboard("{Escape}");
    fireEvent.mouseDown(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.mouseDown(screen.getByText("Содержимое")); // inside: stays open
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("ConfirmDialog waits for the action and focuses Cancel", async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const onClose = vi.fn();
    render(<ConfirmDialog title="Удалить?" body="Навсегда" confirmLabel="Удалить" onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Отмена" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(screen.getByRole("button", { name: "Удалить" })).toBeDisabled(); // busy
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "Удалить" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Modal locks page scroll while open; Sheet closes on a backdrop click", () => {
    const onClose = vi.fn();
    const { unmount, container } = render(<Modal label="Карточка" onClose={onClose}>Тело</Modal>);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.mouseDown(container.firstElementChild!);
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
    const sheetClose = vi.fn();
    const sheet = render(<Sheet label="Панель" onClose={sheetClose}>Тело панели</Sheet>);
    fireEvent.mouseDown(sheet.container.firstElementChild!);
    expect(sheetClose).toHaveBeenCalled();
  });
});

describe("form controls", () => {
  it("Field ties the label, hint and error to the control", () => {
    const { rerender } = render(<Field label="Почта" hint="Для входа">{(a) => <Input {...a} />}</Field>);
    const input = screen.getByLabelText("Почта");
    expect(input).toHaveAccessibleDescription("Для входа");
    rerender(<Field label="Почта" hint="Для входа" error="Неверно">{(a) => <Input {...a} invalid />}</Field>);
    expect(screen.getByLabelText("Почта")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Почта")).toHaveAccessibleDescription("Неверно");
    rerender(<Field label="Просто"><span>без функции</span></Field>);
    expect(screen.getByText("без функции")).toBeInTheDocument();
  });

  it("Input, Textarea and Select accept typing and choosing", async () => {
    const onSelect = vi.fn();
    render(
      <>
        <Input aria-label="Имя" />
        <Textarea aria-label="Описание" invalid />
        <Select aria-label="Тип" onChange={(e) => onSelect(e.target.value)} invalid><option value="a">А</option><option value="b">Б</option></Select>
      </>,
    );
    await userEvent.type(screen.getByLabelText("Имя"), "Иван");
    expect(screen.getByLabelText("Имя")).toHaveValue("Иван");
    await userEvent.type(screen.getByLabelText("Описание"), "текст");
    await userEvent.selectOptions(screen.getByLabelText("Тип"), "b");
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("Checkbox toggles through onChange", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Checkbox checked={false} onChange={onChange} label="Согласен" />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Согласен" }));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Checkbox checked onChange={onChange} label="Согласен" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });
});

describe("avatars and tags", () => {
  it("shows a photo, or initials in a stable colour", () => {
    render(
      <>
        <Avatar user={{ id: "1", name: "Иван Петров", avatarUrl: "data:image/png;base64,AA" }} />
        <Avatar user={{ id: "2", name: "Анна Смирнова" }} size={32} />
        <Avatar user={{ id: "3", name: "" }} />
        <LetterMark name="  ромашка" />
        <LetterMark name="" size={16} />
      </>,
    );
    expect(screen.getByAltText("Иван Петров")).toHaveAttribute("src", "data:image/png;base64,AA");
    expect(screen.getByLabelText("Анна Смирнова")).toHaveTextContent("АС");
    expect(screen.getByLabelText("")).toHaveTextContent("?");
    expect(screen.getByText("Р")).toBeInTheDocument();
    expect(screen.getByText("?", { selector: "span[aria-hidden]" })).toBeInTheDocument();
  });

  it("AvatarStack collapses extra people into +N", () => {
    const users = ["А", "Б", "В", "Г", "Д"].map((name, i) => ({ id: String(i), name }));
    render(<AvatarStack users={users} max={3} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByTitle("А, Б, В, Г, Д")).toBeInTheDocument();
  });

  it("card type markers name the type", () => {
    render(<><CardTypeIcon type="BUG" /><CardTypeTag type="INTEGRATION" /></>);
    expect(screen.getByTitle("Ошибка")).toBeInTheDocument();
    expect(screen.getByText("Интеграция")).toBeInTheDocument();
  });
});

describe("toaster", () => {
  it("shows the latest three toasts, announces errors, and closes on request", async () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("один", "success");
      toast("два");
      toast("три", "error");
      toast("четыре", "success");
    });
    expect(screen.queryByText("один")).toBeNull(); // only the latest three are kept
    expect(screen.getByRole("alert")).toHaveTextContent("три");
    expect(screen.getAllByRole("status")).toHaveLength(2);
    fireEvent.click(within(screen.getByRole("alert")).getByLabelText("Закрыть уведомление"));
    expect(screen.queryByText("три")).toBeNull();
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryByText("четыре")).toBeNull(); // timed out
    vi.useRealTimers();
  });
});
