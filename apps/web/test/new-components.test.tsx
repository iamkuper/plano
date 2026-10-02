import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Onboarding } from "@/components/onboarding";
import { LabelPicker } from "@/components/label-picker";
import { CustomFieldInputs } from "@/components/custom-field-inputs";
import { CardsCalendar } from "@/components/cards-calendar";
import { GanttChart } from "@/components/gantt-chart";
import { DEFAULT_FILTERS } from "@/lib/card-filters";
import { api, setToken } from "@/lib/api";
import { onToast } from "@/lib/toast";
import { card, cardDetail, column, onboarding } from "./fixtures";
import { nav } from "./nav";

describe("onboarding", () => {
  it("renders nothing when closed or while loading", async () => {
    const spy = vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ closed: true }));
    const { container } = render(<Onboarding />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the checklist with progress, done steps struck through and links for the rest", async () => {
    vi.spyOn(api, "onboarding").mockResolvedValue(onboarding());
    render(<Onboarding />);
    expect(await screen.findByText("Начало работы")).toBeInTheDocument();
    expect(screen.getByText("Выполнено 1 из 2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("Создайте первый проект").className).toContain("line-through");
    expect(screen.getByText("Карточка — одна задача.")).toBeInTheDocument();
    expect(screen.queryByText("Проект — это одна работа.")).toBeNull(); // done steps hide their hint
    expect(screen.getByRole("link", { name: "Открыть доску" })).toHaveAttribute("href", "/projects/p1");
    expect(screen.queryByRole("link", { name: "Создать проект" })).toBeNull();
  });

  it("can be closed for good", async () => {
    vi.spyOn(api, "onboarding").mockResolvedValue(onboarding());
    const close = vi.spyOn(api, "onboardingClose").mockResolvedValue(undefined);
    const { container } = render(<Onboarding />);
    await userEvent.click(await screen.findByLabelText("Скрыть начало работы"));
    expect(close).toHaveBeenCalled();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("celebrates when every step is done", async () => {
    const done = onboarding({ completed: 2, steps: onboarding().steps.map((s) => ({ ...s, done: true })) });
    vi.spyOn(api, "onboarding").mockResolvedValue(done);
    const close = vi.spyOn(api, "onboardingClose").mockResolvedValue(undefined);
    render(<Onboarding />);
    expect(await screen.findByText("Всё готово")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Готово, скрыть/ }));
    expect(close).toHaveBeenCalled();
  });

  it("re-reads progress when the person comes back to the tab", async () => {
    const spy = vi.spyOn(api, "onboarding").mockResolvedValue(onboarding());
    render(<Onboarding />);
    await screen.findByText("Начало работы");
    spy.mockResolvedValue(onboarding({ completed: 2, steps: onboarding().steps.map((s) => ({ ...s, done: true })) }));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText("Всё готово")).toBeInTheDocument();
  });

  describe("welcome dialog", () => {
    it("greets a new owner, lists the steps and starts the checklist", async () => {
      vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ welcomeSeen: false }));
      const seen = vi.spyOn(api, "onboardingWelcomeSeen").mockResolvedValue(undefined);
      render(<Onboarding />);
      const dialog = await screen.findByRole("dialog", { name: "Добро пожаловать в Plano" });
      expect(within(dialog).getByText("Создайте первый проект")).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Начать" }));
      expect(seen).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByText("Начало работы")).toBeInTheDocument(); // the checklist stays
    });

    it("can be dismissed with the close button, and onboarding skipped entirely", async () => {
      vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ welcomeSeen: false }));
      const seen = vi.spyOn(api, "onboardingWelcomeSeen").mockResolvedValue(undefined);
      const close = vi.spyOn(api, "onboardingClose").mockResolvedValue(undefined);
      const first = render(<Onboarding />);
      await screen.findByRole("dialog");
      await userEvent.click(screen.getByTitle("Закрыть"));
      expect(seen).toHaveBeenCalled();
      first.unmount();
      const second = render(<Onboarding />);
      await userEvent.click(await screen.findByRole("button", { name: "Не нужно, закрыть" }));
      expect(close).toHaveBeenCalled();
      await waitFor(() => expect(second.container).toBeEmptyDOMElement());
    });

    it("creates a sample project and opens it", async () => {
      vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ welcomeSeen: false }));
      vi.spyOn(api, "onboardingWelcomeSeen").mockResolvedValue(undefined);
      const sample = vi.spyOn(api, "createSampleProject").mockResolvedValue({ id: "pp1" });
      render(<Onboarding />);
      await userEvent.click(await screen.findByRole("button", { name: "Создать пример проекта" }));
      await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/projects/pp1"));
      expect(sample).toHaveBeenCalled();
    });

    it("reports a failure to create the sample and stays", async () => {
      vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ welcomeSeen: false }));
      vi.spyOn(api, "createSampleProject").mockRejectedValue(new Error("Лимит проектов"));
      const messages: string[] = [];
      onToast((t) => messages.push(t.message));
      render(<Onboarding />);
      await userEvent.click(await screen.findByRole("button", { name: "Создать пример проекта" }));
      await waitFor(() => expect(messages).toContain("Лимит проектов"));
      expect(nav.router.push).not.toHaveBeenCalled();
    });

    it("greets a member differently and offers no sample project", async () => {
      vi.spyOn(api, "onboarding").mockResolvedValue(onboarding({ kind: "member", welcomeSeen: false }));
      render(<Onboarding />);
      expect(await screen.findByRole("dialog", { name: "Добро пожаловать в команду" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Создать пример проекта" })).toBeNull();
    });
  });
});

describe("label picker", () => {
  const labels = [{ id: "l1", name: "Срочно", color: "red" as const }, { id: "l2", name: "Клиент", color: "blue" as const }];

  it("shows chosen labels and toggles them", async () => {
    vi.spyOn(api, "labels").mockResolvedValue(labels);
    const onChange = vi.fn();
    render(<LabelPicker field={{ id: "x" }} selected={[labels[0]]} onChange={onChange} />);
    expect(screen.getByText("Срочно")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Срочно/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Клиент" }));
    expect(onChange).toHaveBeenCalledWith(["l1", "l2"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Срочно" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("says when there are no labels yet and creates one on the spot", async () => {
    vi.spyOn(api, "labels").mockResolvedValue([]);
    const create = vi.spyOn(api, "createLabel").mockResolvedValue({ id: "n1", name: "Новая", color: "green" });
    const onChange = vi.fn();
    render(<LabelPicker field={{}} selected={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Нет меток/ }));
    expect(await screen.findByText(/Меток пока нет/)).toBeInTheDocument();
    const create_ = screen.getByRole("button", { name: /Создать/ });
    expect(create_).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Название новой метки"), "Новая");
    await userEvent.click(screen.getByRole("radio", { name: "green" }));
    await userEvent.click(create_);
    await waitFor(() => expect(create).toHaveBeenCalledWith("Новая", "green"));
    expect(onChange).toHaveBeenCalledWith(["n1"]);
  });

  it("won't create a duplicate name and reports failures", async () => {
    vi.spyOn(api, "labels").mockResolvedValue(labels);
    vi.spyOn(api, "createLabel").mockRejectedValue(new Error("Метка с таким названием уже есть"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<LabelPicker field={{}} selected={[]} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Нет меток/ }));
    await screen.findByRole("menuitem", { name: "Срочно" });
    await userEvent.type(screen.getByLabelText("Название новой метки"), "срочно");
    expect(screen.getByRole("button", { name: /Создать/ })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Название новой метки"));
    await userEvent.type(screen.getByLabelText("Название новой метки"), "Другая{enter}");
    await waitFor(() => expect(messages).toContain("Метка с таким названием уже есть"));
  });
});

describe("custom field inputs in a card", () => {
  const fields = [
    { id: "f1", name: "Бюджет", type: "NUMBER" as const, options: [], position: 1 },
    { id: "f2", name: "Заметка", type: "TEXT" as const, options: [], position: 2 },
    { id: "f3", name: "Дата сдачи", type: "DATE" as const, options: [], position: 3 },
    { id: "f4", name: "Этап", type: "SELECT" as const, options: ["Идея", "Работа"], position: 4 },
    { id: "f5", name: "Согласовано", type: "CHECKBOX" as const, options: [], position: 5 },
  ];
  const withValues = cardDetail({ fieldValues: [{ fieldId: "f1", value: 1500 }, { fieldId: "f2", value: "привет" }, { fieldId: "f4", value: "Старый вариант" }, { fieldId: "f5", value: true }] });

  it("saves a number on blur and Enter, ignoring junk", async () => {
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    const set = vi.spyOn(api, "setFieldValue").mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<CustomFieldInputs card={withValues} canEdit onChanged={onChanged} />);
    const input = await screen.findByLabelText("Бюджет");
    expect(input).toHaveValue("1500");
    await userEvent.clear(input);
    await userEvent.type(input, "2 000,5{enter}"); // junk with spaces is rejected, nothing saved
    expect(set).not.toHaveBeenCalled();
    expect(input).toHaveValue("1500");
    await userEvent.clear(input);
    await userEvent.type(input, "2000,5{enter}");
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "f1", 2000.5));
    expect(onChanged).toHaveBeenCalled();
    await userEvent.clear(input);
    fireEvent.blur(input);
    await waitFor(() => expect(set).toHaveBeenLastCalledWith("c1", "f1", null));
  });

  it("saves text on blur, dates and selects immediately, checkboxes on click", async () => {
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    const set = vi.spyOn(api, "setFieldValue").mockResolvedValue(undefined);
    render(<CustomFieldInputs card={withValues} canEdit onChanged={() => {}} />);
    const note = await screen.findByLabelText("Заметка");
    await userEvent.type(note, " мир");
    expect(set).not.toHaveBeenCalled(); // not on every keystroke
    fireEvent.blur(note);
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "f2", "привет мир"));

    fireEvent.change(screen.getByLabelText("Дата сдачи"), { target: { value: "2026-12-31" } });
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "f3", "2026-12-31"));
    await userEvent.selectOptions(screen.getByLabelText("Этап"), "Работа");
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "f4", "Работа"));
    await userEvent.selectOptions(screen.getByLabelText("Этап"), "");
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "f4", null));
    await userEvent.click(screen.getByRole("checkbox", { name: "Согласовано" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("c1", "f5", false));
    // a stored value that is no longer in the list stays visible
    expect(within(screen.getByLabelText("Этап")).getByRole("option", { name: "Старый вариант" })).toBeInTheDocument();
  });

  it("shows only filled fields, read-only, when the plan has no custom fields", async () => {
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    const set = vi.spyOn(api, "setFieldValue");
    render(<CustomFieldInputs card={withValues} canEdit={false} onChanged={() => {}} />);
    expect(await screen.findByLabelText("Бюджет")).toBeDisabled();
    expect(screen.getByLabelText("Заметка")).toBeDisabled();
    expect(screen.queryByLabelText("Дата сдачи")).toBeNull(); // empty → hidden
    await userEvent.click(screen.getByRole("checkbox", { name: "Согласовано" }));
    expect(set).not.toHaveBeenCalled();
  });

  it("renders nothing without fields and reports save errors", async () => {
    vi.spyOn(api, "fields").mockResolvedValue([]);
    const { container } = render(<CustomFieldInputs card={cardDetail()} canEdit onChanged={() => {}} />);
    await waitFor(() => expect(api.fields).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();

    setToken(null); // forget the (empty) field list cached by the first render
    vi.spyOn(api, "fields").mockResolvedValue(fields);
    vi.spyOn(api, "setFieldValue").mockRejectedValue(new Error("Эта возможность доступна на тарифе Business"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<CustomFieldInputs card={withValues} canEdit onChanged={() => {}} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Согласовано" }));
    await waitFor(() => expect(messages[0]).toContain("Business"));
  });
});

describe("calendar view", () => {
  const today = new Date();
  const iso = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12).toISOString();
  const cols = [
    column({ id: "c1", cards: [card({ id: "a", title: "Сегодняшняя", dueDate: iso(0) }), card({ id: "b", number: 2, title: "Просроченная", dueDate: iso(-1) }), card({ id: "n", number: 3, title: "Без срока" })] }),
    column({ id: "done", title: "Готово", cards: [card({ id: "d", number: 4, title: "Сделана", columnId: "done", dueDate: iso(-1) })] }),
  ];

  it("places cards on their due day, marks overdue and done, counts undated cards", () => {
    render(<CardsCalendar columns={cols} filters={DEFAULT_FILTERS} onOpenCard={() => {}} onChanged={() => {}} />);
    expect(screen.getByText("Сегодняшняя")).toBeInTheDocument();
    expect(screen.getByText("Без срока: 1")).toBeInTheDocument();
    const today = new Date().getDate() === 1; // yesterday may fall into the previous month
    if (!today) {
      expect(screen.getByText("Просроченная").closest("button")!.className).toContain("text-danger");
      expect(screen.getByText("Сделана").closest("button")!.className).toContain("line-through");
    }
    expect(screen.getByRole("heading").textContent).toMatch(/^[А-Я][а-я]+ \d{4}$/);
  });

  it("navigates months and jumps back to today", async () => {
    render(<CardsCalendar columns={cols} filters={DEFAULT_FILTERS} onOpenCard={() => {}} onChanged={() => {}} />);
    const title = screen.getByRole("heading").textContent;
    await userEvent.click(screen.getByLabelText("Следующий месяц"));
    expect(screen.getByRole("heading").textContent).not.toBe(title);
    await userEvent.click(screen.getByLabelText("Предыдущий месяц"));
    await userEvent.click(screen.getByLabelText("Предыдущий месяц"));
    await userEvent.click(screen.getByRole("button", { name: "Сегодня" }));
    expect(screen.getByRole("heading").textContent).toBe(title);
  });

  it("opens a card on click and reschedules by drag and drop", async () => {
    const onOpen = vi.fn();
    const onChanged = vi.fn();
    const update = vi.spyOn(api, "updateCard").mockResolvedValue(card());
    render(<CardsCalendar columns={cols} filters={DEFAULT_FILTERS} onOpenCard={onOpen} onChanged={onChanged} />);
    await userEvent.click(screen.getByText("Сегодняшняя"));
    expect(onOpen).toHaveBeenCalledWith("a");

    const chip = screen.getByText("Сегодняшняя").closest("button")!;
    const data: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k] };
    fireEvent.dragStart(chip, { dataTransfer });
    const target = screen.getAllByText("15", { selector: "div" })[0].closest("div[class*='min-h']")!;
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(update).toHaveBeenCalledWith("a", { dueDate: expect.stringMatching(/T/) }));
    expect(onChanged).toHaveBeenCalled();
    // dropping on the same day does nothing
    update.mockClear();
    const sameDay = chip.closest("div[class*='min-h']")!;
    fireEvent.drop(sameDay, { dataTransfer });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a failed reschedule", async () => {
    vi.spyOn(api, "updateCard").mockRejectedValue(new Error("Тариф закончился"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<CardsCalendar columns={cols} filters={DEFAULT_FILTERS} onOpenCard={() => {}} onChanged={() => {}} />);
    const chip = screen.getByText("Сегодняшняя").closest("button")!;
    const data: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k] };
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.drop(screen.getAllByText("20", { selector: "div" })[0].closest("div[class*='min-h']")!, { dataTransfer });
    await waitFor(() => expect(messages).toContain("Тариф закончился"));
  });

  it("collapses busy days and expands them on request", async () => {
    const many = column({ cards: Array.from({ length: 5 }, (_, i) => card({ id: `m${i}`, number: i + 1, title: `Задача ${i}`, dueDate: iso(0) })) });
    render(<CardsCalendar columns={[many, column({ id: "done" })]} filters={DEFAULT_FILTERS} onOpenCard={() => {}} onChanged={() => {}} />);
    expect(screen.getByText("ещё 2")).toBeInTheDocument();
    expect(screen.queryByText("Задача 4")).toBeNull();
    await userEvent.click(screen.getByText("ещё 2"));
    expect(screen.getByText("Задача 4")).toBeInTheDocument();
  });
});

describe("gantt chart", () => {
  const d = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const cols = [
    column({ id: "c1", cards: [
      card({ id: "a", title: "Бриф", startDate: d(0), dueDate: d(3) }),
      card({ id: "b", number: 2, title: "Реализация", startDate: d(5), dueDate: d(9), type: "WIDGET" }),
      card({ id: "x", number: 3, title: "Только срок", dueDate: d(12) }),
      card({ id: "n", number: 4, title: "Без дат" }),
    ] }),
    column({ id: "done", title: "Готово", cards: [card({ id: "ok", number: 5, title: "Сделано", columnId: "done", startDate: d(-5), dueDate: d(-3) })] }),
  ];
  const props = { projectId: "p1", columns: cols, filters: DEFAULT_FILTERS, onOpenCard: vi.fn(), onChanged: vi.fn() };

  it("waits for the plan, then offers the upgrade below Business", () => {
    const { rerender } = render(<GanttChart {...props} hasGantt={null} />);
    expect(screen.queryByText(/Диаграмма Ганта есть/)).toBeNull();
    rerender(<GanttChart {...props} hasGantt={false} />);
    expect(screen.getByText("Диаграмма Ганта есть на тарифе Business")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Посмотреть тарифы" })).toHaveAttribute("href", "/settings/billing");
  });

  it("draws a bar per dated card, lists undated ones, and loads the links", async () => {
    const deps = vi.spyOn(api, "dependencies").mockResolvedValue([{ cardId: "b", dependsOnId: "a" }]);
    const { container } = render(<GanttChart {...props} hasGantt />);
    await waitFor(() => expect(deps).toHaveBeenCalledWith("p1"));
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(4); // a, b, x, ok
    expect(screen.getByText("Без дат: двойной щелчок задаёт день")).toBeInTheDocument();
    expect(screen.getAllByText("Сделано")[0].className).toContain("line-through");
    await waitFor(() => expect(container.querySelectorAll("svg path[marker-end]")).toHaveLength(1));
    expect(container.querySelector("svg g")!.getAttribute("class")).toContain("text-ink-faint"); // a ends before b starts
  });

  it("marks a link red when the dependent card starts too early", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([{ cardId: "a", dependsOnId: "b" }]);
    const { container } = render(<GanttChart {...props} hasGantt />);
    await waitFor(() => expect(container.querySelector("svg g")).not.toBeNull());
    expect(container.querySelector("svg g")!.getAttribute("class")).toContain("text-danger");
  });

  it("switches the zoom and shows month headings", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([]);
    render(<GanttChart {...props} hasGantt />);
    await userEvent.click(screen.getByRole("tab", { name: "Недели" }));
    expect(screen.getByRole("tab", { name: "Недели" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Месяцы" }));
    expect(screen.getAllByText(/^[А-Я][а-я]+ \d{4}$/).length).toBeGreaterThan(0);
  });

  it("opens a card when its row is clicked, and a bar on a plain click", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([]);
    const onOpenCard = vi.fn();
    const { container } = render(<GanttChart {...props} onOpenCard={onOpenCard} hasGantt />);
    await userEvent.click(screen.getByRole("button", { name: /Бриф/ }));
    expect(onOpenCard).toHaveBeenCalledWith("a");
    const bar = container.querySelector('[data-bar="b"]')!;
    fireEvent.pointerDown(bar, { clientX: 100 });
    fireEvent.pointerUp(window, { clientX: 100 });
    expect(onOpenCard).toHaveBeenCalledWith("b");
  });

  it("moves a bar by dragging it, resizes by its edges and saves the new dates", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([]);
    const update = vi.spyOn(api, "updateCard").mockResolvedValue(card());
    const onChanged = vi.fn();
    const { container } = render(<GanttChart {...props} onChanged={onChanged} hasGantt />);
    const bar = container.querySelector('[data-bar="b"]')!;
    fireEvent.pointerDown(bar, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 100 + 36 * 2 });
    fireEvent.pointerUp(window, { clientX: 100 + 36 * 2 });
    await waitFor(() => expect(update).toHaveBeenCalledWith("b", { startDate: d(7), dueDate: d(11) }));
    expect(onChanged).toHaveBeenCalled();

    const [startHandle, endHandle] = [bar.children[0], bar.children[2]];
    fireEvent.pointerDown(endHandle, { clientX: 500 });
    fireEvent.pointerMove(window, { clientX: 500 + 36 * 3 });
    fireEvent.pointerUp(window, { clientX: 500 + 36 * 3 });
    await waitFor(() => expect(update).toHaveBeenLastCalledWith("b", { startDate: d(5), dueDate: d(12) }));
    fireEvent.pointerDown(startHandle, { clientX: 500 });
    fireEvent.pointerMove(window, { clientX: 500 + 36 * 20 }); // can't pass the end
    fireEvent.pointerUp(window, { clientX: 500 + 36 * 20 });
    await waitFor(() => expect(update).toHaveBeenLastCalledWith("b", { startDate: d(9), dueDate: d(9) }));
  });

  it("gives an undated card a one-day bar on double click, and reports save errors", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([]);
    const update = vi.spyOn(api, "updateCard").mockRejectedValue(new Error("Тариф закончился"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    render(<GanttChart {...props} hasGantt />);
    const hint = screen.getByText("Без дат: двойной щелчок задаёт день");
    fireEvent.doubleClick(hint.parentElement!, { clientX: 5 });
    await waitFor(() => expect(update).toHaveBeenCalledWith("n", expect.objectContaining({ startDate: expect.any(String), dueDate: expect.any(String) })));
    await waitFor(() => expect(messages).toContain("Тариф закончился"));
  });

  it("links two cards by dragging from a bar's dot onto another bar", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([]);
    const add = vi.spyOn(api, "addDependency").mockResolvedValue({ cardId: "b", dependsOnId: "a" });
    const onChanged = vi.fn();
    const { container } = render(<GanttChart {...props} onChanged={onChanged} hasGantt />);
    const dot = container.querySelector('[data-bar="a"] span[title^="Потянуть"]')!;
    const target = container.querySelector('[data-bar="b"]')!;
    document.elementFromPoint = vi.fn(() => target) as never;
    fireEvent.pointerDown(dot, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 40 });
    expect(container.querySelector("svg line")).not.toBeNull(); // the rubber band
    fireEvent.pointerUp(window, { clientX: 200, clientY: 40 });
    await waitFor(() => expect(add).toHaveBeenCalledWith("b", "a"));
    expect(onChanged).toHaveBeenCalled();
    expect(container.querySelector("svg line")).toBeNull();
  });

  it("ignores a link dropped on empty space or on itself, and reports server refusals", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([]);
    const add = vi.spyOn(api, "addDependency").mockRejectedValue(new Error("Такая связь создаст цикл"));
    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    const { container } = render(<GanttChart {...props} hasGantt />);
    const dot = container.querySelector('[data-bar="a"] span[title^="Потянуть"]')!;
    document.elementFromPoint = vi.fn(() => document.body) as never;
    fireEvent.pointerDown(dot, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    document.elementFromPoint = vi.fn(() => container.querySelector('[data-bar="a"]')) as never;
    fireEvent.pointerDown(dot, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    expect(add).not.toHaveBeenCalled();
    document.elementFromPoint = vi.fn(() => container.querySelector('[data-bar="b"]')) as never;
    fireEvent.pointerDown(dot, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(messages).toContain("Такая связь создаст цикл"));
  });

  it("removes a link after confirmation", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([{ cardId: "b", dependsOnId: "a" }]);
    const remove = vi.spyOn(api, "removeDependency").mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const { container } = render(<GanttChart {...props} onChanged={onChanged} hasGantt />);
    await waitFor(() => expect(container.querySelector("svg path[stroke='transparent']")).not.toBeNull());
    fireEvent.click(container.querySelector("svg path[stroke='transparent']")!);
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("b", "a"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("says so when there is nothing to draw", async () => {
    vi.spyOn(api, "dependencies").mockResolvedValue([]);
    render(<GanttChart {...props} columns={[column()]} hasGantt />);
    expect(screen.getByText("Нет карточек для диаграммы")).toBeInTheDocument();
  });
});
