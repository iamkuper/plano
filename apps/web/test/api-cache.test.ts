import { describe, expect, it, vi } from "vitest";
import { api, BILLING_CHANGED, invalidateCache, setToken } from "@/lib/api";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stub(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const f = vi.fn(async (url: string, init?: RequestInit) => answer(url, init));
  vi.stubGlobal("fetch", f);
  return f;
}
const calls = (f: ReturnType<typeof stub>, part: string) => f.mock.calls.filter(([url]) => String(url).includes(part)).length;

describe("response cache", () => {
  it("serves repeated reads from memory and shares a read that is still running", async () => {
    const f = stub(() => json([{ id: "u1" }]));
    const [a, b] = await Promise.all([api.users(), api.users()]);
    expect(a).toEqual(b);
    await api.users();
    await api.labels();
    await api.labels();
    expect(calls(f, "/users")).toBe(1);
    expect(calls(f, "/labels")).toBe(1);
  });

  it("gives every caller a copy it may change", async () => {
    stub(() => json([{ id: "u1", name: "Иван" }]));
    const first = (await api.users()) as { name: string }[];
    first[0].name = "Испорчено";
    first.push({ name: "лишний" } as never);
    expect(await api.users()).toEqual([{ id: "u1", name: "Иван" }]);
  });

  it("forgets after the time is up", async () => {
    vi.useFakeTimers();
    try {
      const f = stub(() => json([]));
      await api.projects("ACTIVE");
      vi.advanceTimersByTime(9_000);
      await api.projects("ACTIVE");
      expect(calls(f, "/projects")).toBe(1);
      vi.advanceTimersByTime(2_000);
      await api.projects("ACTIVE");
      expect(calls(f, "/projects")).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps different queries apart, and does not keep a failure", async () => {
    let fail = true;
    const f = stub((url) => (url.includes("ARCHIVED") ? json([{ id: "old" }]) : fail ? json({ message: "Сломалось" }, 500) : json([{ id: "p" }])));
    await expect(api.projects("ACTIVE")).rejects.toThrow("Сломалось");
    fail = false;
    expect(await api.projects("ACTIVE")).toEqual([{ id: "p" }]); // asked again
    expect(await api.projects("ARCHIVED")).toEqual([{ id: "old" }]);
    expect(calls(f, "/projects")).toBe(3);
  });

  it("is emptied by a write, except that card work only touches the project counters", async () => {
    const f = stub((url, init) => (init?.method === "POST" || init?.method === "PATCH" ? json({}) : json([])));
    await api.users();
    await api.projects("ACTIVE");
    await api.labels();
    await api.createCard("col1", "Новая"); // a card: only the projects are asked again
    await api.users();
    await api.labels();
    await api.projects("ACTIVE");
    expect(calls(f, "/users")).toBe(1);
    expect(calls(f, "/labels")).toBe(1);
    expect(calls(f, "/projects?")).toBe(2);

    await api.updateUser("u1", { name: "Новое" }); // anything else: everything
    await api.users();
    await api.labels();
    expect(calls(f, "/users")).toBe(3); // the read and the PATCH itself
    expect(calls(f, "/labels")).toBe(2);
  });

  it("is emptied when the account changes, and billing is re-read when it changes", async () => {
    const f = stub(() => json({}));
    await api.me();
    setToken("other-account");
    await api.me();
    expect(calls(f, "/users/me")).toBe(2);

    await api.billing();
    await api.billing();
    expect(calls(f, "/billing")).toBe(1);
    window.dispatchEvent(new Event(BILLING_CHANGED));
    await api.billing();
    expect(calls(f, "/billing")).toBe(2);
    invalidateCache();
    await api.billing();
    expect(calls(f, "/billing")).toBe(3);
  });
});
