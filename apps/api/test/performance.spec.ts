import { clearAuthCache } from "../src/auth/auth-cache";
import { api, createApp, makeProject, register, unique, type TestApp } from "./helpers/app";
import request from "supertest";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(async () => {
  await t.close();
});
afterEach(() => {
  process.env.AUTH_CACHE_MS = "0";
  clearAuthCache();
});

async function member(adminToken: string, tag: string) {
  const email = `${unique(tag)}@iso.test`;
  const created = (await api(t, adminToken).post("/users", { email, name: `Сотрудник ${tag}`, password: "password-123" }).expect(201)).body;
  const token = (await request(t.app.getHttpServer()).post("/auth/login").send({ email, password: "password-123" }).expect(201)).body.accessToken;
  return { id: created.id, email, token };
}

describe("auth cache", () => {
  it("serves repeated requests from memory, but changes made through the app apply at once", async () => {
    process.env.AUTH_CACHE_MS = "60000";
    const a = await register(t, "ac1");
    const m = await member(a.token, "ac1m");
    const M = api(t, m.token);
    await M.get("/users/me").expect(200);

    // A change behind the app's back (another client) is not seen while cached...
    await t.db.user.update({ where: { id: m.id }, data: { isActive: false } });
    await M.get("/users/me").expect(200);
    // ...but the same change through the app is, immediately.
    await t.db.user.update({ where: { id: m.id }, data: { isActive: true } });
    clearAuthCache();
    await M.get("/users/me").expect(200);
    await api(t, a.token).patch(`/users/${m.id}`, { isActive: false }).expect(200);
    await M.get("/users/me").expect(401);
  });

  it("applies a role change and a revoked API token at once", async () => {
    process.env.AUTH_CACHE_MS = "60000";
    const a = await register(t, "ac2");
    const A = api(t, a.token);
    const m = await member(a.token, "ac2m");
    const M = api(t, m.token);
    await M.post("/projects", { title: "x" }).expect(403); // no right yet
    const role = (await A.post("/roles", { name: "Руководитель", permissions: ["projects.create"] }).expect(201)).body;
    await A.patch(`/users/${m.id}`, { roleId: role.id }).expect(200);
    await M.post("/projects", { title: "x" }).expect(201);
    await A.patch(`/roles/${role.id}`, { permissions: [] }).expect(200);
    await M.post("/projects", { title: "y" }).expect(403);

    const token = (await A.post("/api-tokens", { name: "t" }).expect(201)).body;
    await api(t, token.token).get("/users/me").expect(200);
    await A.del(`/api-tokens/${token.id}`).expect(204);
    await api(t, token.token).get("/users/me").expect(401);
  });

  it("is per person: one user's cached rights don't leak to another", async () => {
    process.env.AUTH_CACHE_MS = "60000";
    const a = await register(t, "ac3");
    const m = await member(a.token, "ac3m");
    expect((await api(t, a.token).get("/users/me").expect(200)).body.role).toBe("ADMIN");
    expect((await api(t, m.token).get("/users/me").expect(200)).body.role).toBe("MEMBER");
    expect((await api(t, a.token).get("/users/me").expect(200)).body.role).toBe("ADMIN");
  });
});

describe("responses", () => {
  it("compresses big JSON, leaves small replies alone, and the board still reports unread comments", async () => {
    const a = await register(t, "rs1");
    const A = api(t, a.token);
    const m = await member(a.token, "rs1m");
    const titles = Array.from({ length: 60 }, (_, i) => `Карточка номер ${i + 1}, достаточно длинное название`);
    const { project, cards } = await makeProject(t, a.token, "Большой", titles);
    await A.post(`/cards/${cards[0].id}/comments`, { text: "Привет" }).expect(201);

    const big = await request(t.app.getHttpServer()).get(`/projects/${project.id}/board`).set("Authorization", `Bearer ${m.token}`).set("Accept-Encoding", "gzip").expect(200);
    expect(big.headers["content-encoding"]).toBe("gzip");
    const first = big.body.columns[0].cards.find((c: { id: string }) => c.id === cards[0].id);
    expect(first.unreadComments).toBe(1); // written by someone else
    expect(big.body.columns[0].cards.filter((c: { unreadComments: number }) => c.unreadComments > 0)).toHaveLength(1);

    const own = await A.get(`/projects/${project.id}/board`).expect(200);
    expect(own.body.columns[0].cards.every((c: { unreadComments: number }) => c.unreadComments === 0)).toBe(true); // own messages aren't unread

    const small = await request(t.app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${a.token}`).set("Accept-Encoding", "gzip").expect(200);
    expect(small.headers["content-encoding"]).toBeUndefined();
  });
});

describe("urgent counter", () => {
  it("counts the user's open cards due by the given moment, in one number", async () => {
    const a = await register(t, "ur1");
    const A = api(t, a.token);
    const m = await member(a.token, "ur1m");
    const { project, columns, cards } = await makeProject(t, a.token, "Срочное", ["просрочена", "сегодня", "завтра", "готова", "чужая", "без срока"]);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
    for (const [i, due] of [[0, -1], [1, 0], [2, 1], [3, -2], [4, -1]] as const) await A.patch(`/cards/${cards[i].id}`, { dueDate: day(due) }).expect(200);
    for (const i of [0, 1, 2, 3, 5]) await A.patch(`/cards/${cards[i].id}`, { assigneeIds: [a.userId] }).expect(200);
    await A.patch(`/cards/${cards[4].id}`, { assigneeIds: [m.id] }).expect(200);
    await A.post(`/cards/${cards[3].id}/move`, { columnId: columns[columns.length - 1].id }).expect(201); // done

    const count = async (token: string, before?: string) => (await api(t, token).get(`/cards/urgent-count${before ? `?before=${encodeURIComponent(before)}` : ""}`).expect(200)).body.count;
    expect(await count(a.token, day(0.5))).toBe(2); // overdue and today; done, tomorrow and undated are not
    expect(await count(a.token, day(2))).toBe(3);
    expect(await count(a.token, day(-5))).toBe(0);
    expect(await count(m.token, day(0.5))).toBe(1); // only their own
    expect(await count(a.token)).toBeGreaterThanOrEqual(1); // "now" by default
    await api(t, a.token).get("/cards/urgent-count?before=junk").expect(400);

    // finished projects don't count, and neither do other workspaces
    await A.patch(`/projects/${project.id}`, { status: "DONE" }).expect(200);
    expect(await count(a.token, day(2))).toBe(0);
    const other = await register(t, "ur1o");
    expect(await count(other.token, day(2))).toBe(0);
  });
});

describe("card tiles carry comment and attachment counts", () => {
  it("on the board, in search, and after create, update and move", async () => {
    const a = await register(t, "ct1");
    const A = api(t, a.token);
    const { project, columns, cards } = await makeProject(t, a.token, "Счётчики", ["Один", "Два"]);
    await A.post(`/cards/${cards[0].id}/comments`, { text: "раз" }).expect(201);
    await A.post(`/cards/${cards[0].id}/comments`, { text: "два" }).expect(201);

    const board = (await A.get(`/projects/${project.id}/board`).expect(200)).body;
    const tiles = board.columns.flatMap((c: { cards: { id: string; _count: unknown }[] }) => c.cards);
    expect(tiles.find((c: { id: string }) => c.id === cards[0].id)._count).toEqual({ comments: 2, attachments: 0 });
    expect(tiles.find((c: { id: string }) => c.id === cards[1].id)._count).toEqual({ comments: 0, attachments: 0 });
    const team = (await A.get("/team-board").expect(200)).body.flatMap((c: { cards: { id: string; _count: unknown }[] }) => c.cards);
    expect(team.find((c: { id: string }) => c.id === cards[0].id)._count).toEqual({ comments: 2, attachments: 0 });

    const found = (await A.get("/cards/search?q=Один").expect(200)).body;
    expect(found[0]._count).toEqual({ comments: 2, attachments: 0 });
    expect((await A.get(`/cards/${cards[0].id}`).expect(200)).body._count).toEqual({ comments: 2, attachments: 0 });
    expect((await A.patch(`/cards/${cards[0].id}`, { title: "Один!" }).expect(200)).body._count.comments).toBe(2);
    expect((await A.post(`/cards/${cards[0].id}/move`, { columnId: columns[1].id }).expect(201)).body._count.comments).toBe(2);
    expect((await A.post("/cards", { columnId: columns[0].id, title: "Новая" }).expect(201)).body._count).toEqual({ comments: 0, attachments: 0 });
  });

  it("finds cards by any part of the title or description, in any case", async () => {
    const a = await register(t, "ct2");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "Поиск", ["Согласовать договор с клиентом"]);
    await A.patch(`/cards/${cards[0].id}`, { description: "Позвонить в бухгалтерию" }).expect(200);
    for (const q of ["договор", "ДОГОВОР", "гово", "бухгалт", "TSK-1", "1"]) expect((await A.get(`/cards/search?q=${encodeURIComponent(q)}`).expect(200)).body).toHaveLength(1);
    expect((await A.get("/cards/search?q=nothing").expect(200)).body).toHaveLength(0);
  });
});

describe("team board in pages", () => {
  it("gives stage counts, the first cards of each stage with their totals, and the next pages of one stage", async () => {
    const a = await register(t, "tb1");
    const A = api(t, a.token);
    const { project, columns, cards } = await makeProject(t, a.token, "Команда", ["a", "b", "c", "d", "e"]);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
    // due dates decide the order within a stage: b, a, c, then d and e without a date
    await A.patch(`/cards/${cards[0].id}`, { dueDate: day(2), assigneeIds: [a.userId] }).expect(200);
    await A.patch(`/cards/${cards[1].id}`, { dueDate: day(1), assigneeIds: [a.userId] }).expect(200);
    await A.patch(`/cards/${cards[2].id}`, { dueDate: day(3) }).expect(200);
    await A.post(`/cards/${cards[4].id}/move`, { columnId: columns[1].id }).expect(201);

    const summary = (await A.get("/team-board/summary").expect(200)).body;
    expect(summary.map((s: { title: string }) => s.title)).toEqual(columns.map((c) => c.title));
    expect(summary.map((s: { count: number }) => s.count)).toEqual([4, 1, 0, 0]);
    const mine = (await A.get(`/team-board/summary?assigneeId=${a.userId}`).expect(200)).body;
    expect(mine.map((s: { count: number }) => s.count)).toEqual([2, 0, 0, 0]);

    const first = (await A.get("/team-board?limit=2").expect(200)).body;
    expect(first[0]).toMatchObject({ title: columns[0].title, total: 4 });
    expect(first[0].cards.map((c: { title: string }) => c.title)).toEqual(["b", "a"]);
    expect(first[0].cards[0]).toMatchObject({ _count: { comments: 0, attachments: 0 }, unreadComments: 0, project: { id: project.id }, assignees: [{ user: { id: a.userId } }] });
    expect(first[1]).toMatchObject({ total: 1 });
    const next = (await A.get(`/team-board?limit=2&stage=${encodeURIComponent(columns[0].title)}&offset=2`).expect(200)).body;
    expect(next).toHaveLength(1);
    expect(next[0].cards.map((c: { title: string }) => c.title)).toEqual(["c", "d"]);
    const own = (await A.get(`/team-board?limit=10&assigneeId=${a.userId}`).expect(200)).body;
    expect(own[0]).toMatchObject({ total: 2 });
    expect(own[0].cards).toHaveLength(2);

    // without a limit the whole board comes as before
    const all = (await A.get("/team-board").expect(200)).body;
    expect(all[0].total).toBeUndefined();
    expect(all[0].cards).toHaveLength(4);

    await A.get("/team-board?limit=0").expect(400);
    await A.get("/team-board?limit=abc").expect(400);
    await A.get("/team-board?limit=100000").expect(200); // capped, not refused

    await A.patch(`/projects/${project.id}`, { status: "DONE" }).expect(200);
    expect((await A.get("/team-board/summary").expect(200)).body).toEqual([]);
    expect((await A.get("/team-board?limit=5").expect(200)).body).toEqual([]);
  });
});
