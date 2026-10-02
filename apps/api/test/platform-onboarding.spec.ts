import { stateOf } from "../src/platform/platform.service";
import { platformAdminEmails } from "../src/platform/platform-admin.guard";
import { api, createApp, makeProject, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
let owner: Awaited<ReturnType<typeof register>>;
beforeAll(async () => {
  t = await createApp();
  // The platform owner is an ordinary account whose address is in PLATFORM_ADMIN_EMAILS.
  const email = "platform-owner@iso.test";
  await t.db.user.deleteMany({ where: { email } });
  const res = await api(t).post("/auth/register", { workspaceName: "Владелец", name: "Владелец", email, password: "password-123" });
  const user = await t.db.user.findUniqueOrThrow({ where: { email } });
  owner = { token: res.body.accessToken, email, password: "password-123", workspaceId: user.workspaceId, userId: user.id };
});
afterAll(() => t.close());

const joinMember = async (admin: { token: string }) => {
  const inv = await api(t, admin.token).post("/invitations", { email: `${unique("m")}@iso.test` }).expect(201);
  return (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "Участник", password: "password-123" })).body.accessToken as string;
};

describe("onboarding", () => {
  it("starts for a new owner with five steps that complete as the person works", async () => {
    const a = await register(t, "onb");
    const A = api(t, a.token);
    let o = (await A.get("/onboarding").expect(200)).body;
    expect(o).toMatchObject({ kind: "owner", welcomeSeen: false, closed: false, completed: 0 });
    expect(o.steps.map((s: { id: string }) => s.id)).toEqual(["project", "card", "assign", "invite", "message"]);
    expect(o.steps[0].action.href).toBe("/projects?new=1");

    const { project, cards } = await makeProject(t, a.token, "Первый", ["Карточка"]);
    o = (await A.get("/onboarding")).body;
    expect(o.steps.filter((s: { done: boolean }) => s.done).map((s: { id: string }) => s.id)).toEqual(["project", "card"]);
    expect(o.steps[1].action.href).toBe(`/projects/${project.id}`);

    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [a.userId] });
    expect((await A.get("/onboarding")).body.steps.find((s: { id: string }) => s.id === "assign").done).toBe(false); // needs a due date too
    await A.patch(`/cards/${cards[0].id}`, { dueDate: "2026-12-01" });
    await A.post("/invitations", { email: `${unique("i")}@iso.test` });
    await A.post(`/cards/${cards[0].id}/comments`, { text: "привет" });
    o = (await A.get("/onboarding")).body;
    expect(o.completed).toBe(5);
  });

  it("remembers the welcome dialog and the closed state per person, and can bring it back", async () => {
    const a = await register(t, "onb2");
    const A = api(t, a.token);
    await A.post("/onboarding/welcome-seen").expect(204);
    expect((await A.get("/onboarding")).body).toMatchObject({ welcomeSeen: true, closed: false });
    await A.post("/onboarding/close").expect(204);
    expect((await A.get("/onboarding")).body).toMatchObject({ welcomeSeen: true, closed: true });
    await A.post("/onboarding/reopen").expect(204);
    expect((await A.get("/onboarding")).body.closed).toBe(false);
    // another person in the same workspace has their own state
    const m = api(t, await joinMember(a));
    expect((await m.get("/onboarding")).body).toMatchObject({ welcomeSeen: false, closed: false });
  });

  it("gives members their own short list", async () => {
    const a = await register(t, "onb3");
    const { cards } = await makeProject(t, a.token, "P", ["x"]);
    const m = api(t, await joinMember(a));
    let o = (await m.get("/onboarding")).body;
    expect(o).toMatchObject({ kind: "member", completed: 0 });
    expect(o.steps.map((s: { id: string }) => s.id)).toEqual(["open", "message"]);
    await m.post(`/cards/${cards[0].id}/read`).expect(204);
    await m.post(`/cards/${cards[0].id}/comments`, { text: "ок" }).expect(201);
    o = (await m.get("/onboarding")).body;
    expect(o.completed).toBe(2);
  });

  it("creates a sample project with spread-out dates, within the plan's limits", async () => {
    const a = await register(t, "onb4");
    const A = api(t, a.token);
    const { id } = (await A.post("/onboarding/sample-project").expect(201)).body;
    const board = (await A.get(`/projects/${id}/board`)).body;
    const cards = board.columns.flatMap((c: { cards: { startDate: string | null; dueDate: string | null }[] }) => c.cards);
    expect(cards).toHaveLength(7);
    expect(cards.every((c: { startDate: string | null; dueDate: string | null }) => c.startDate && c.dueDate && c.startDate <= c.dueDate)).toBe(true);
    const starts = cards.map((c: { startDate: string }) => c.startDate);
    expect([...starts].sort()).toEqual(starts); // laid out one after another
    expect((await A.get("/onboarding")).body.steps[0].done).toBe(true);

    await setPlan(t, a.workspaceId, "FREE");
    for (let i = 0; i < 2; i++) await A.post("/projects", { title: `P${i}` }).expect(201);
    await A.post("/onboarding/sample-project").expect(402);

    const b = await register(t, "onb5");
    const role = (await api(t, b.token).post("/roles", { name: "Без прав", permissions: [] })).body;
    const inv = await api(t, b.token).post("/invitations", { email: `${unique("m")}@iso.test`, roleId: role.id });
    const m = (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken;
    await api(t, m).post("/onboarding/sample-project").expect(403);
  });

  it("is available while the workspace is read-only", async () => {
    const a = await register(t, "onb6");
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { status: "LOCKED" } });
    await api(t, a.token).post("/onboarding/close").expect(204);
    await api(t).get("/onboarding").expect(401);
  });
});

describe("platform back-office", () => {
  it("answers 404 to everyone except the listed addresses", async () => {
    const a = await register(t, "plat0");
    await api(t, a.token).get("/platform/stats").expect(404);
    await api(t, a.token).get("/platform/workspaces").expect(404);
    await api(t, a.token).get(`/platform/workspaces/${a.workspaceId}`).expect(404);
    await api(t, a.token).post(`/platform/workspaces/${a.workspaceId}/subscription`, { action: "lock" }).expect(404);
    await api(t).get("/platform/stats").expect(401);
    await api(t, owner.token).get("/platform/stats").expect(200);
    expect(platformAdminEmails({ PLATFORM_ADMIN_EMAILS: " A@x.com, ,b@y.org " } as NodeJS.ProcessEnv)).toEqual(["a@x.com", "b@y.org"]);
    expect(platformAdminEmails({} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("reports totals, states and money", async () => {
    const trial = await register(t, "plat1");
    const free = await register(t, "plat2");
    const paid = await register(t, "plat3");
    const locked = await register(t, "plat4");
    await setPlan(t, free.workspaceId, "FREE");
    await setPlan(t, paid.workspaceId, "PRO");
    await t.db.payment.create({ data: { workspaceId: paid.workspaceId, kind: "INITIAL", planId: "PRO", interval: "MONTH", seats: 1, amount: 49000, status: "PAID", orderId: unique("o"), paidAt: new Date() } });
    await t.db.payment.create({ data: { workspaceId: paid.workspaceId, kind: "RENEWAL", planId: "PRO", interval: "MONTH", seats: 1, amount: 49000, status: "FAILED", orderId: unique("o") } });
    await t.db.subscription.update({ where: { workspaceId: locked.workspaceId }, data: { status: "LOCKED" } });
    const s = (await api(t, owner.token).get("/platform/stats").expect(200)).body;
    expect(s.workspaces).toBeGreaterThanOrEqual(5);
    expect(s.newWorkspaces7d).toBeGreaterThanOrEqual(5);
    expect(s.states.trial).toBeGreaterThanOrEqual(1);
    expect(s.states.free).toBeGreaterThanOrEqual(1);
    expect(s.states.paid).toBeGreaterThanOrEqual(1);
    expect(s.states.locked).toBeGreaterThanOrEqual(1);
    expect(s.mrrKopecks).toBeGreaterThanOrEqual(49000);
    expect(s.paid30dKopecks).toBeGreaterThanOrEqual(49000);
    expect(s.paidCount30d).toBeGreaterThanOrEqual(1);
    expect(s.failedPayments7d).toBeGreaterThanOrEqual(1);
    expect(trial.token).toBeTruthy();
  });

  it("counts yearly plans as a twelfth per month and seats from active users", async () => {
    const a = await register(t, "plat5");
    const before = (await api(t, owner.token).get("/platform/stats")).body.mrrKopecks;
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { planId: "BUSINESS", status: "ACTIVE", trialEndsAt: null, interval: "YEAR", currentPeriodEnd: new Date(Date.now() + 86_400_000) } });
    await api(t, a.token).post("/users", { email: `${unique("u")}@iso.test`, name: "U", password: "password-123" });
    const after = (await api(t, owner.token).get("/platform/stats")).body.mrrKopecks;
    expect(after - before).toBe(Math.round((99000 * 2 * 10) / 12));
  });

  it("lists, searches and filters companies, with paging", async () => {
    const tag = unique("findme");
    const a = await register(t, tag);
    await setPlan(t, a.workspaceId, "PRO");
    const O = api(t, owner.token);
    const found = (await O.get(`/platform/workspaces?q=${encodeURIComponent(`компания ${tag}`)}`).expect(200)).body;
    expect(found.items).toHaveLength(1);
    expect(found.items[0]).toMatchObject({ id: a.workspaceId, state: "paid", planId: "PRO", users: 1, owner: { email: a.email } });
    expect((await O.get(`/platform/workspaces?q=${encodeURIComponent(a.email)}`)).body.items).toHaveLength(1);
    expect((await O.get(`/platform/workspaces?q=${encodeURIComponent(`Компания ${tag}`)}`)).body.items).toHaveLength(1);
    expect((await O.get("/platform/workspaces?state=paid")).body.items.every((i: { state: string }) => i.state === "paid")).toBe(true);
    expect((await O.get("/platform/workspaces?state=bogus")).body.items.length).toBeGreaterThan(0); // unknown filter is ignored

    for (let i = 0; i < 3; i++) await register(t, `plat-page${i}`);
    const page1 = (await O.get("/platform/workspaces").expect(200)).body;
    expect(page1.items.length).toBeLessThanOrEqual(30);
    if (page1.next) {
      const page2 = (await O.get(`/platform/workspaces?cursor=${page1.next}`)).body;
      expect(page2.items.some((i: { id: string }) => page1.items.some((j: { id: string }) => j.id === i.id))).toBe(false);
    }
  });

  it("shows a company's people, payments, usage and recent actions", async () => {
    const a = await register(t, "plat-detail");
    await makeProject(t, a.token, "Проект", ["x"]);
    const w = (await api(t, owner.token).get(`/platform/workspaces/${a.workspaceId}`).expect(200)).body;
    expect(w).toMatchObject({ id: a.workspaceId, state: "trial", _count: { projects: 1, cards: 1 }, storageBytes: 0 });
    expect(w.users).toHaveLength(1);
    await api(t, owner.token).get("/platform/workspaces/missing").expect(404);
  });

  it("changes subscriptions on request and writes it to the company's journal", async () => {
    const a = await register(t, "plat-act");
    const O = api(t, owner.token);
    const act = (body: object) => O.post(`/platform/workspaces/${a.workspaceId}/subscription`, body);

    let w = (await act({ action: "grant", planId: "BUSINESS", days: 10 }).expect(201)).body;
    expect(w).toMatchObject({ state: "paid", subscription: { planId: "BUSINESS", status: "ACTIVE", cancelAtPeriodEnd: true } });
    expect(new Date(w.subscription.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now() + 9 * 86_400_000);
    await api(t, a.token).get("/fields").expect(200);
    await api(t, a.token).post("/fields", { name: "Доступно", type: "TEXT" }).expect(201); // Business feature works

    expect(w.subscription.seats).toBe(1); // defaults to the active users
    w = (await act({ action: "seats", seats: 4 }).expect(201)).body;
    expect(w.subscription).toMatchObject({ planId: "BUSINESS", seats: 4 });
    await act({ action: "seats", seats: 0 }).expect(400);
    w = (await act({ action: "grant", planId: "PRO", days: 10, seats: 2 }).expect(201)).body;
    expect(w.subscription).toMatchObject({ planId: "PRO", seats: 2 });

    w = (await act({ action: "lock" }).expect(201)).body;
    expect(w.state).toBe("locked");
    await api(t, a.token).post("/projects", { title: "Нельзя" }).expect(402);

    w = (await act({ action: "extend-trial", days: 5 }).expect(201)).body;
    expect(w).toMatchObject({ state: "trial" });
    const trialEnd = new Date(w.subscription.trialEndsAt).getTime();
    expect(trialEnd).toBeGreaterThan(Date.now() + 4 * 86_400_000);
    w = (await act({ action: "extend-trial" }).expect(201)).body; // default 30 days, stacked on the trial
    expect(new Date(w.subscription.trialEndsAt).getTime()).toBeGreaterThan(trialEnd + 29 * 86_400_000);

    w = (await act({ action: "free" }).expect(201)).body;
    expect(w).toMatchObject({ state: "free", subscription: { planId: "FREE" } });

    await act({ action: "grant", planId: "FREE" }).expect(400);
    await act({ action: "grant", planId: "NOPE" }).expect(400);
    await act({ action: "grant", planId: "PRO", days: 0 }).expect(400);
    await act({ action: "teleport" }).expect(400);
    await O.post("/platform/workspaces/missing/subscription", { action: "lock" }).expect(404);

    const log = await t.db.auditLog.findMany({ where: { workspaceId: a.workspaceId, action: { startsWith: "platform." } }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => l.action)).toEqual(["platform.grant", "platform.seats", "platform.grant", "platform.lock", "platform.extend-trial", "platform.extend-trial", "platform.free"]);
    expect(log.every((l) => l.summary.startsWith("Поддержка Plano:") && l.userId === null)).toBe(true);
  });

  it("works even when the owner's own workspace is read-only", async () => {
    await t.db.subscription.update({ where: { workspaceId: owner.workspaceId }, data: { status: "LOCKED" } });
    const a = await register(t, "plat-lockedowner");
    await api(t, owner.token).post(`/platform/workspaces/${a.workspaceId}/subscription`, { action: "free" }).expect(201);
    await t.db.subscription.update({ where: { workspaceId: owner.workspaceId }, data: { status: "ACTIVE", planId: "BUSINESS", trialEndsAt: null } });
  });

  it("names the coarse state of a subscription", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const base = { planId: "PRO", status: "ACTIVE" as const, trialEndsAt: null, currentPeriodEnd: new Date("2026-11-10") };
    expect(stateOf(base, now)).toBe("paid");
    expect(stateOf({ ...base, planId: "FREE", currentPeriodEnd: null }, now)).toBe("free");
    expect(stateOf({ ...base, status: "PAST_DUE" }, now)).toBe("past_due");
    expect(stateOf({ ...base, status: "TRIALING", trialEndsAt: new Date("2026-10-20") }, now)).toBe("trial");
    expect(stateOf({ ...base, status: "LOCKED" }, now)).toBe("locked");
    expect(stateOf({ ...base, status: "TRIALING", trialEndsAt: new Date("2026-10-01") }, now)).toBe("locked");
  });
});
