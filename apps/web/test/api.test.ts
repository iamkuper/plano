import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { api, API_URL, downloadProjectCsv, getToken, setToken, UnauthorizedError, uploadAttachment } from "@/lib/api";
import { loadSettings, publishSettings, useSettings } from "@/lib/settings";
import { can } from "@plano/shared";
import { useCan } from "@/lib/permissions";
import { notifyMeChanged, useAuth } from "@/lib/use-auth";
import { useBoard } from "@/lib/use-board";
import { onToast } from "@/lib/toast";
import { user, card, column } from "./fixtures";
import { nav } from "./nav";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (body === undefined ? "" : JSON.stringify(body)), blob: async () => new Blob(["x"]) }) as unknown as Response);

describe("request wrapper", () => {
  it("sends the token and JSON, and parses the answer", async () => {
    setToken("tok");
    const f = reply(200, { ok: 1 });
    vi.stubGlobal("fetch", f);
    expect(await api.settings()).toEqual({ ok: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_URL}/settings`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for empty answers and works without a token", async () => {
    vi.stubGlobal("fetch", reply(204));
    expect(await api.deleteLabel("l1")).toBeUndefined();
    expect(getToken()).toBeNull();
    const f = reply(200, {});
    vi.stubGlobal("fetch", f);
    await api.login("a@b.c", "pw");
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("Authorization");
  });

  it("forgets the token on 401 and throws UnauthorizedError", async () => {
    setToken("old");
    vi.stubGlobal("fetch", reply(401, {}));
    await expect(api.me()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(getToken()).toBeNull();
  });

  it("turns server errors into readable messages", async () => {
    vi.stubGlobal("fetch", reply(400, { message: ["первое", "второе"] }));
    await expect(api.createProject({ title: "" })).rejects.toThrow("первое, второе");
    vi.stubGlobal("fetch", reply(402, { message: "Тариф закончился" }));
    await expect(api.createProject({ title: "x" })).rejects.toThrow("Тариф закончился");
    vi.stubGlobal("fetch", reply(500, {}));
    await expect(api.projects()).rejects.toThrow("Запрос не выполнен (500)");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error("html"); } }) as unknown as Response));
    await expect(api.projects()).rejects.toThrow("Запрос не выполнен (502)");
  });

  it("every endpoint helper builds a request without throwing", async () => {
    vi.restoreAllMocks();
    const f = reply(200, {});
    vi.stubGlobal("fetch", f);
    const skip = new Set(["login"]);
    const names = Object.keys(api) as (keyof typeof api)[];
    expect(names.length).toBeGreaterThan(80);
    for (const name of names) {
      if (skip.has(name)) continue;
      const fn = api[name] as (...args: unknown[]) => Promise<unknown>;
      f.mockClear();
      await fn(...Array.from({ length: fn.length }, (_, i) => (i === 0 ? "id1" : "x")));
      expect([name, f.mock.calls.length]).toEqual([name, 1]);
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit | undefined];
      expect(url.startsWith(API_URL)).toBe(true);
      expect(["GET", "POST", "PUT", "PATCH", "DELETE", undefined]).toContain(init?.method);
    }
  });

  it("builds specific URLs", async () => {
    const f = reply(200, {});
    vi.stubGlobal("fetch", f);
    const last = () => f.mock.calls.at(-1) as unknown as [string, RequestInit];
    await api.projects("ARCHIVED");
    expect(last()[0]).toContain("/projects?status=ARCHIVED");
    await api.urgentCount(new Date("2026-10-05T20:59:59.999Z"));
    expect(last()[0]).toContain("/cards/urgent-count?before=2026-10-05T20%3A59%3A59.999Z");
    await api.teamBoard("u1");
    expect(last()[0]).toContain("/team-board?assigneeId=u1");
    await api.timeReport("2026-10-01", "2026-10-31", "u1");
    expect(last()[0]).toContain("/reports/time?from=2026-10-01&to=2026-10-31&userId=u1");
    await api.audit("cur", "role");
    expect(last()[0]).toContain("before=cur");
    expect(last()[0]).toContain("group=role");
    await api.platformWorkspaces({ q: "ромашка", state: "paid", cursor: "" });
    expect(last()[0]).toContain("q=%D1%80%D0%BE%D0%BC%D0%B0%D1%88%D0%BA%D0%B0&state=paid");
    expect(last()[0]).not.toContain("cursor");
    await api.setFieldValue("c1", "f1", 5);
    expect(last()[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ value: 5 }) });
    await api.mockPay("a b", true);
    expect(last()[0]).toContain("/billing/dev/pay/a%20b");
  });
});

describe("file transfer", () => {
  class FakeXhr {
    static last: FakeXhr;
    upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    headers: Record<string, string> = {};
    status = 200;
    responseText = "{}";
    onload: () => void = () => {};
    onerror: () => void = () => {};
    open = vi.fn();
    setRequestHeader = (k: string, v: string) => (this.headers[k] = v);
    send = vi.fn();
    constructor() {
      FakeXhr.last = this;
    }
  }

  it("uploads with progress and reports failures", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    setToken("tok");
    const progress = vi.fn();
    const ok = uploadAttachment("c1", new File(["x"], "a.txt"), progress);
    FakeXhr.last.upload.onprogress!({ lengthComputable: true, loaded: 1, total: 4 });
    FakeXhr.last.responseText = JSON.stringify({ id: "att1" });
    FakeXhr.last.onload();
    expect(await ok).toEqual({ id: "att1" });
    expect(progress).toHaveBeenCalledWith(25);
    expect(FakeXhr.last.headers.Authorization).toBe("Bearer tok");

    const tooBig = uploadAttachment("c1", new File(["x"], "big.zip"));
    FakeXhr.last.status = 413;
    FakeXhr.last.onload();
    await expect(tooBig).rejects.toThrow("«big.zip» больше 20 МБ");

    const refused = uploadAttachment("c1", new File(["x"], "a.txt"));
    FakeXhr.last.status = 402;
    FakeXhr.last.responseText = JSON.stringify({ message: ["Тариф", "закончился"] });
    FakeXhr.last.onload();
    await expect(refused).rejects.toThrow("Тариф, закончился");

    const garbled = uploadAttachment("c1", new File(["x"], "a.txt"));
    FakeXhr.last.status = 500;
    FakeXhr.last.responseText = "<html>";
    FakeXhr.last.onload();
    await expect(garbled).rejects.toThrow("Не удалось загрузить «a.txt»");

    const offline = uploadAttachment("c1", new File(["x"], "a.txt"));
    FakeXhr.last.onerror();
    await expect(offline).rejects.toThrow("Нет связи с сервером");
  });

  it("downloads a CSV through a temporary link, or explains why not", async () => {
    setToken("tok");
    URL.createObjectURL = vi.fn(() => "blob:csv");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("fetch", reply(200));
    await downloadProjectCsv("p1", "Сайт");
    expect(click).toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull(); // cleaned up

    vi.stubGlobal("fetch", reply(402, { message: "Только на Business" }));
    await expect(downloadProjectCsv("p1", "Сайт")).rejects.toThrow("Только на Business");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error("x"); } }) as unknown as Response));
    await expect(downloadProjectCsv("p1", "Сайт")).rejects.toThrow("Не удалось выгрузить (500)");
  });
});

describe("shared hooks", () => {
  it("settings are fetched once, shared and updated on publish", async () => {
    const s = { workspaceName: "Ромашка", cardPrefix: "ABC", defaultColumns: ["A"] };
    const spy = vi.spyOn(api, "settings").mockResolvedValue(s as never);
    expect(await loadSettings()).toEqual(s);
    expect(await loadSettings()).toEqual(s);
    expect(spy).toHaveBeenCalledTimes(1);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current?.workspaceName).toBe("Ромашка"));
    act(() => publishSettings({ ...s, workspaceName: "Новая" } as never));
    await waitFor(() => expect(result.current?.workspaceName).toBe("Новая"));
  });

  it("useCan answers false until the person is known, then follows permissions", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user({ role: "MEMBER", permissions: ["labels.manage"] }));
    const { result } = renderHook(() => useCan());
    expect(result.current("labels.manage")).toBe(false);
    await waitFor(() => expect(result.current("labels.manage")).toBe(true));
    expect(result.current("billing.manage")).toBe(false);
    expect(can(user(), "billing.manage")).toBe(true); // admins may do anything
    expect(can(null, "billing.manage")).toBe(false);
  });

  it("useAuth redirects without a token or on 401, and follows profile changes", async () => {
    renderHook(() => useAuth());
    expect(nav.router.replace).toHaveBeenCalledWith("/login");

    nav.router.replace.mockReset();
    setToken("tok");
    vi.spyOn(api, "me").mockRejectedValueOnce(new UnauthorizedError("x"));
    renderHook(() => useAuth());
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith("/login"));

    vi.spyOn(api, "me").mockResolvedValue(user());
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current?.name).toBe("Иван Петров"));
    act(() => notifyMeChanged(user({ name: "Пётр" })));
    expect(result.current?.name).toBe("Пётр");
  });

  it("useBoard loads the board and applies optimistic card changes", async () => {
    const board = { id: "b1", projectId: "p1", columns: [column({ cards: [card({ id: "c1", checklist: [{ id: "i1", text: "a", done: false }] })] }), column({ id: "col2", title: "Готово" })] };
    vi.spyOn(api, "projectBoard").mockResolvedValue(board as never);
    const toggle = vi.spyOn(api, "updateChecklistItem").mockResolvedValue({} as never);
    const { result } = renderHook(() => useBoard("p1"));
    await waitFor(() => expect(result.current.board).not.toBeNull());

    act(() => result.current.actions.toggleItem("c1", "i1", true));
    expect(result.current.board!.columns[0].cards[0].checklist[0].done).toBe(true);
    expect(toggle).toHaveBeenCalledWith("i1", { done: true });

    vi.spyOn(api, "addChecklistItem").mockResolvedValue({ id: "i2", text: "b", done: false, cardId: "c1", position: 2 } as never);
    await act(() => result.current.actions.addItem("c1", "b"));
    expect(result.current.board!.columns[0].cards[0].checklist).toHaveLength(2);

    vi.spyOn(api, "createCard").mockResolvedValue(card({ id: "c2", title: "Новая" }));
    await act(() => result.current.actions.addCard("col2", "Новая"));
    expect(result.current.board!.columns[1].cards[0].id).toBe("c2");

    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    vi.spyOn(api, "deleteCard").mockResolvedValue(undefined);
    act(() => result.current.actions.deleteCard(card({ id: "c2" })));
    expect(result.current.board!.columns[1].cards).toHaveLength(1); // declined
    await act(async () => result.current.actions.deleteCard(card({ id: "c2" })));
    expect(result.current.board!.columns[1].cards).toHaveLength(0);
  });

  it("useBoard reports load errors and recovers from failed saves by reloading", async () => {
    vi.spyOn(api, "projectBoard").mockRejectedValueOnce(new Error("нет доступа"));
    const { result } = renderHook(() => useBoard("p1"));
    await waitFor(() => expect(result.current.error).toBe("нет доступа"));

    const messages: string[] = [];
    onToast((t) => messages.push(t.message));
    vi.spyOn(api, "projectBoard").mockResolvedValue({ id: "b1", projectId: "p1", columns: [] } as never);
    await act(async () => {
      await result.current.guard(Promise.reject(new Error("не сохранилось")));
    });
    expect(messages).toContain("не сохранилось");
    await waitFor(() => expect(result.current.board).not.toBeNull()); // reloaded
  });
});

describe("account switching", () => {
  it("drops cached per-account data when the session changes", async () => {
    const me = vi.spyOn(api, "me").mockResolvedValueOnce(user({ permissions: [], role: "MEMBER" }));
    const first = renderHook(() => useCan());
    await waitFor(() => expect(me).toHaveBeenCalledTimes(1));
    setToken("another-account");
    me.mockResolvedValueOnce(user({ role: "MEMBER", permissions: ["labels.manage"] }));
    const second = renderHook(() => useCan());
    await waitFor(() => expect(second.result.current("labels.manage")).toBe(true));
    expect(first.result.current("labels.manage")).toBe(false);

    const settings = vi.spyOn(api, "settings");
    settings.mockResolvedValueOnce({ workspaceName: "Первая", cardPrefix: "A", defaultColumns: ["x"] } as never);
    expect((await loadSettings()).workspaceName).toBe("Первая");
    setToken("third-account");
    settings.mockResolvedValueOnce({ workspaceName: "Вторая", cardPrefix: "B", defaultColumns: ["x"] } as never);
    expect((await loadSettings()).workspaceName).toBe("Вторая");
  });
});
