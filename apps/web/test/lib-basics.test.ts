import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { applyFilters, activeFilterCount, DEFAULT_FILTERS, isReordered, timeAgo } from "@/lib/card-filters";
import { describeRecurrence } from "@/lib/recurrence";
import { displayUrl, normalizeUrl } from "@/lib/links";
import { notifyProjectsChanged, onProjectsChanged } from "@/lib/projects-events";
import { onToast, toast } from "@/lib/toast";
import { useFilters } from "@/lib/use-filters";
import { useCardParam, useQueryParam } from "@/lib/use-card-param";
import { imageToAvatarDataUrl } from "@/lib/image";
import { card } from "./fixtures";
import { nav } from "./nav";

describe("card filters", () => {
  const today = new Date();
  const day = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12).toISOString();
  const cards = [
    card({ id: "a", title: "Бриф клиента", dueDate: day(-2), priority: "LOW", updatedAt: "2026-10-01T00:00:00Z" }),
    card({ id: "b", number: 2, title: "Интеграция", description: "обмен данными", dueDate: day(0), priority: "HIGH", updatedAt: "2026-10-03T00:00:00Z", assignees: [{ user: { id: "u1", name: "И" } }], labels: [{ label: { id: "l1", name: "Срочно", color: "red" } }] }),
    card({ id: "c", number: 3, title: "Обучение", dueDate: day(5), priority: "MEDIUM", updatedAt: "2026-10-02T00:00:00Z" }),
    card({ id: "d", number: 4, title: "Без срока", dueDate: null }),
  ];
  const ids = (list: { id: string }[]) => list.map((c) => c.id);

  it("keeps everything with the default filters", () => {
    expect(ids(applyFilters(cards, DEFAULT_FILTERS))).toEqual(["a", "b", "c", "d"]);
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(isReordered(DEFAULT_FILTERS)).toBe(false);
  });

  it("filters by date scope", () => {
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, date: "overdue" }))).toEqual(["a"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, date: "today" }))).toEqual(["b"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, date: "week" }))).toEqual(["b", "c"]);
  });

  it("filters by assignee, priority, label and free text (title, description, key)", () => {
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, assigneeIds: ["u1"] }))).toEqual(["b"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, priorities: ["LOW"] }))).toEqual(["a"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, labelIds: ["l1"] }))).toEqual(["b"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, q: "бриф" }))).toEqual(["a"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, q: "ОБМЕН" }))).toEqual(["b"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, q: "TSK-3" }))).toEqual(["c"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, q: "   " }))).toHaveLength(4);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, assigneeIds: ["u1"], labelIds: ["l1"], priorities: ["LOW"] })).toBe(3);
    expect(isReordered({ ...DEFAULT_FILTERS, q: "x" })).toBe(true);
  });

  it("sorts by due date, priority and last change", () => {
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, sort: "due" }))).toEqual(["a", "b", "c", "d"]);
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, sort: "priority" }))[0]).toBe("b");
    expect(ids(applyFilters(cards, { ...DEFAULT_FILTERS, sort: "updated" }))[0]).toBe("b");
  });

  it("formats ages compactly", () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(timeAgo(ago(10_000))).toBe("сейчас");
    expect(timeAgo(ago(5 * 60_000))).toBe("5 мин");
    expect(timeAgo(ago(3 * 3_600_000))).toBe("3 ч");
    expect(timeAgo(ago(2 * 86_400_000))).toBe("2 д");
    expect(timeAgo(ago(30 * 86_400_000))).toMatch(/\d/);
  });
});

describe("recurrence and links", () => {
  it("describes schedules in Russian", () => {
    expect(describeRecurrence({ frequency: "DAILY", interval: 1 })).toBe("Каждый день");
    expect(describeRecurrence({ frequency: "DAILY", interval: 3 })).toBe("Каждые 3 дня");
    expect(describeRecurrence({ frequency: "WEEKLY", interval: 1, weekday: 1 })).toBe("Каждую неделю, по понедельникам");
    expect(describeRecurrence({ frequency: "WEEKLY", interval: 2 })).toBe("Каждые 2 недели");
    expect(describeRecurrence({ frequency: "MONTHLY", interval: 1, monthDay: 5 })).toBe("Каждый месяц, 5-го числа");
    expect(describeRecurrence({ frequency: "MONTHLY", interval: 12 })).toBe("Каждые 12 месяцев");
    expect(describeRecurrence({ frequency: "DAILY", interval: 11 })).toBe("Каждые 11 дней");
    expect(describeRecurrence({ frequency: "DAILY", interval: 21 })).toBe("Каждые 21 день");
  });

  it("normalises and shortens URLs", () => {
    expect(normalizeUrl(" acme.ru ")).toBe("https://acme.ru");
    expect(normalizeUrl("http://acme.ru/x")).toBe("http://acme.ru/x");
    expect(normalizeUrl("")).toBe("");
    expect(displayUrl("https://www.acme.ru/")).toBe("acme.ru");
    expect(displayUrl("https://acme.ru/path/a")).toBe("acme.ru/path/a");
    expect(displayUrl("not a url")).toBe("not a url");
  });
});

describe("events", () => {
  it("toasts reach subscribers until they unsubscribe", () => {
    const seen: string[] = [];
    const off = onToast((t) => seen.push(`${t.tone}:${t.message}`));
    toast("раз");
    toast("два", "error");
    off();
    toast("три");
    expect(seen).toEqual(["default:раз", "error:два"]);
  });

  it("projects-changed notifies subscribers", () => {
    const fn = vi.fn();
    const off = onProjectsChanged(fn);
    notifyProjectsChanged();
    off();
    notifyProjectsChanged();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("hooks", () => {
  it("useFilters restores per-key filters from storage and saves changes", () => {
    localStorage.setItem("k1", JSON.stringify({ q: "бриф", sort: "due" }));
    const { result, rerender } = renderHook(({ key }) => useFilters(key), { initialProps: { key: "k1" } });
    expect(result.current[0]).toMatchObject({ q: "бриф", sort: "due", date: "all" });
    act(() => result.current[1]({ ...result.current[0], q: "новое" }));
    expect(JSON.parse(localStorage.getItem("k1")!).q).toBe("новое");
    rerender({ key: "k2" });
    expect(result.current[0]).toEqual(DEFAULT_FILTERS);
    localStorage.setItem("k3", "{broken");
    rerender({ key: "k3" });
    expect(result.current[0]).toEqual(DEFAULT_FILTERS);
  });

  it("useQueryParam reads and rewrites the URL query", () => {
    nav.path = "/projects/p1";
    nav.search = "view=table&card=c9";
    const { result } = renderHook(() => useQueryParam("view"));
    expect(result.current[0]).toBe("table");
    act(() => result.current[1]("gantt"));
    expect(nav.router.replace).toHaveBeenCalledWith("/projects/p1?view=gantt&card=c9", { scroll: false });
    act(() => result.current[1](null));
    expect(nav.router.replace).toHaveBeenLastCalledWith("/projects/p1?card=c9", { scroll: false });
    const card = renderHook(() => useCardParam());
    expect(card.result.current[0]).toBe("c9");
    nav.search = "view=table";
    const only = renderHook(() => useQueryParam("view"));
    act(() => only.result.current[1](null));
    expect(nav.router.replace).toHaveBeenLastCalledWith("/projects/p1", { scroll: false });
  });
});

describe("avatar images", () => {
  it("rejects non-images and huge files", async () => {
    await expect(imageToAvatarDataUrl(new File(["x"], "a.txt", { type: "text/plain" }))).rejects.toThrow("Выберите файл изображения");
    const big = new File([new Uint8Array(16 * 1024 * 1024)], "a.png", { type: "image/png" });
    await expect(imageToAvatarDataUrl(big)).rejects.toThrow("больше 15 МБ");
  });

  it("crops to a square JPEG data URL", async () => {
    const ctx = { drawImage: vi.fn(), imageSmoothingQuality: "" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAAA");
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    class FakeImage {
      naturalWidth = 400;
      naturalHeight = 200;
      onload: () => void = () => {};
      set src(_: string) {
        queueMicrotask(() => this.onload());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const url = await imageToAvatarDataUrl(new File(["x"], "a.png", { type: "image/png" }), 64);
    expect(url).toBe("data:image/jpeg;base64,AAAA");
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 200, 200, 0, 0, 64, 64); // centred crop
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    class BrokenImage {
      onerror: () => void = () => {};
      set src(_: string) {
        queueMicrotask(() => this.onerror());
      }
    }
    vi.stubGlobal("Image", BrokenImage);
    await expect(imageToAvatarDataUrl(new File(["x"], "a.png", { type: "image/png" }))).rejects.toThrow("Не удалось прочитать");
  });
});
