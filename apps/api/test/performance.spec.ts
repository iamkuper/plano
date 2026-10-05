import { clearAuthCache } from "../src/auth/auth-cache";
import { RealtimeGateway } from "../src/realtime/realtime.gateway";
import { api, createApp, makeProject, register, setPlan, unique, type TestApp } from "./helpers/app";
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

describe("time report on the server", () => {
  async function setup() {
    const a = await register(t, "tr1");
    const A = api(t, a.token);
    const m = await member(a.token, "tr1m");
    const first = await makeProject(t, a.token, "Сайт", ["Вёрстка", "Макет"]);
    const second = await makeProject(t, a.token, "Бот", ["Скрипт"]);
    const log = (token: string, cardId: string, minutes: number, date: string, note?: string) => api(t, token).post(`/cards/${cardId}/time`, { minutes, date, note }).expect(201);
    await log(a.token, first.cards[0].id, 90, "2026-10-02", "правки");
    await log(a.token, first.cards[1].id, 30, "2026-10-03");
    await log(a.token, second.cards[0].id, 60, "2026-10-03");
    await log(m.token, second.cards[0].id, 45, "2026-10-04");
    await log(a.token, first.cards[0].id, 500, "2026-11-20"); // another period
    return { a, A, m, first, second };
  }
  const range = "from=2026-10-01&to=2026-10-31";

  it("sums up by person or project in the database", async () => {
    const { a, A, m, first, second } = await setup();
    // only the admin's own entries unless the right is given: the member is not asked here
    const byUser = (await A.get(`/reports/time/summary?${range}&groupBy=user`).expect(200)).body;
    expect(byUser).toMatchObject({ totalMinutes: 225, entries: 4, people: 2, projects: 2 });
    expect(byUser.groups.map((g: { key: string; minutes: number; entries: number }) => [g.key, g.minutes, g.entries])).toEqual([[a.userId, 180, 3], [m.id, 45, 1]]);
    expect(byUser.groups[0]).toMatchObject({ label: `Админ tr1`, user: { id: a.userId } });
    const byProject = (await A.get(`/reports/time/summary?${range}&groupBy=project`).expect(200)).body;
    expect(byProject.groups.map((g: { key: string; label: string; minutes: number }) => [g.key, g.label, g.minutes])).toEqual([[first.project.id, "Сайт", 120], [second.project.id, "Бот", 105]]);
    expect(byProject.groups[0].user).toBeNull();
    expect((await A.get(`/reports/time/summary?${range}&userId=${m.id}`).expect(200)).body).toMatchObject({ totalMinutes: 45, people: 1 });
    expect((await A.get(`/reports/time/summary?${range}&projectId=${first.project.id}`).expect(200)).body).toMatchObject({ totalMinutes: 120, projects: 1 });
    expect((await A.get("/reports/time/summary?from=2026-01-01&to=2026-01-31").expect(200)).body).toEqual({ totalMinutes: 0, entries: 0, people: 0, projects: 0, groups: [] });
    // a person without time.viewAll sees themselves only
    expect((await api(t, m.token).get(`/reports/time/summary?${range}`).expect(200)).body).toMatchObject({ totalMinutes: 45, people: 1 });
    // other workspaces see nothing of it
    const other = await register(t, "tr1o");
    expect((await api(t, other.token).get(`/reports/time/summary?${range}`).expect(200)).body.totalMinutes).toBe(0);
  });

  it("lists the entries of a group in pages, newest first", async () => {
    const { a, A, first } = await setup();
    const all = (await A.get(`/reports/time/entries?${range}`).expect(200)).body;
    expect(all.total).toBe(4);
    expect(all.items.map((e: { date: string }) => e.date.slice(0, 10))).toEqual(["2026-10-04", "2026-10-03", "2026-10-03", "2026-10-02"]);
    const mine = (await A.get(`/reports/time/entries?${range}&groupBy=user&key=${a.userId}&limit=2`).expect(200)).body;
    expect(mine.total).toBe(3);
    expect(mine.items).toHaveLength(2);
    const rest = (await A.get(`/reports/time/entries?${range}&groupBy=user&key=${a.userId}&limit=2&offset=2`).expect(200)).body;
    expect(rest.items).toHaveLength(1);
    expect(rest.items[0]).toMatchObject({ minutes: 90, note: "правки", user: { id: a.userId }, card: { title: "Вёрстка", project: { id: first.project.id } } });
    const project = (await A.get(`/reports/time/entries?${range}&groupBy=project&key=${first.project.id}`).expect(200)).body;
    expect(project.items.map((e: { minutes: number }) => e.minutes).sort((x: number, y: number) => x - y)).toEqual([30, 90]);
  });

  it("checks the period and the plan", async () => {
    const { A, a } = await setup();
    for (const path of ["summary", "entries", "export.csv"]) {
      await A.get(`/reports/time/${path}?from=2026-10-01`).expect(400);
      await A.get(`/reports/time/${path}?from=2026-10-31&to=2026-10-01`).expect(400);
      await A.get(`/reports/time/${path}?from=nonsense&to=2026-10-01`).expect(400);
    }
    await setPlan(t, a.workspaceId, "FREE");
    expect((await A.get(`/reports/time/summary?${range}`)).status).toBeGreaterThanOrEqual(400);
    expect((await A.get(`/reports/time/export.csv?${range}`)).status).toBeGreaterThanOrEqual(400);
  });

  it("exports every entry of the period as a CSV, however many there are", async () => {
    const { a, A, first } = await setup();
    const small = await A.get(`/reports/time/export.csv?${range}`).expect(200);
    expect(small.headers["content-type"]).toContain("text/csv");
    const lines = small.text.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Дата;Сотрудник;Проект;Карточка;Название карточки;Комментарий;Минуты;Часы");
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe(`2026-10-02;Админ tr1;Сайт;TSK-1;Вёрстка;правки;90;1,5`);

    // more than one portion of the file
    const card = first.cards[0].id;
    await t.db.timeEntry.createMany({ data: Array.from({ length: 2100 }, (_, i) => ({ cardId: card, userId: a.userId, minutes: 1, date: new Date(Date.UTC(2026, 9, 1 + (i % 28))) })) });
    const big = await A.get(`/reports/time/export.csv?${range}`).expect(200);
    expect(big.text.trim().split("\r\n")).toHaveLength(1 + 4 + 2100);
    expect((await A.get(`/reports/time/summary?${range}`).expect(200)).body.entries).toBe(2104);
  });
});

describe("text search for boards", () => {
  it("answers which cards contain the text, and tiles carry no description", async () => {
    const a = await register(t, "ms1");
    const A = api(t, a.token);
    const one = await makeProject(t, a.token, "Один", ["Согласовать договор", "Позвонить"]);
    const two = await makeProject(t, a.token, "Два", ["Договор аренды"]);
    await A.patch(`/cards/${one.cards[1].id}`, { description: "обсудить ДОГОВОРЕННОСТИ с клиентом" }).expect(200);

    const ids = async (q: string, projectId?: string) => (await A.get(`/cards/match?q=${encodeURIComponent(q)}${projectId ? `&projectId=${projectId}` : ""}`).expect(200)).body.ids.sort();
    expect(await ids("договор")).toEqual([one.cards[0].id, one.cards[1].id, two.cards[0].id].sort());
    expect(await ids("договор", one.project.id)).toEqual([one.cards[0].id, one.cards[1].id].sort());
    expect(await ids("TSK-1")).toEqual([one.cards[0].id]);
    expect(await ids("   ")).toEqual([]);
    expect(await ids("нет такого")).toEqual([]);
    const other = await register(t, "ms1o");
    expect((await api(t, other.token).get("/cards/match?q=договор").expect(200)).body.ids).toEqual([]);

    const board = (await A.get(`/projects/${one.project.id}/board`).expect(200)).body;
    const tile = board.columns[0].cards[1];
    expect("description" in tile).toBe(false);
    expect((await A.get(`/cards/${one.cards[1].id}`).expect(200)).body.description).toBe("обсудить ДОГОВОРЕННОСТИ с клиентом");
  });

  it("gives a single tile for a realtime hint", async () => {
    const a = await register(t, "ms2");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "Плитка", ["Одна"]);
    await A.post(`/cards/${cards[0].id}/comments`, { text: "привет" }).expect(201);
    const m = await member(a.token, "ms2m");
    const tile = (await api(t, m.token).get(`/cards/${cards[0].id}/tile`).expect(200)).body;
    expect(tile).toMatchObject({ id: cards[0].id, title: "Одна", unreadComments: 1, _count: { comments: 1, attachments: 0 }, checklist: [], assignees: [], labels: [] });
    expect("description" in tile).toBe(false);
    await api(t, m.token).get("/cards/missing/tile").expect(404);
    const other = await register(t, "ms2o");
    await api(t, other.token).get(`/cards/${cards[0].id}/tile`).expect(404);
  });
});

describe("realtime hints", () => {
  it("name the card for single changes, and none for bulk ones", async () => {
    const gateway = t.app.get(RealtimeGateway);
    const emit = jest.spyOn(gateway, "emit").mockImplementation(() => undefined);
    try {
      const a = await register(t, "rt1");
      const A = api(t, a.token);
      const { project, columns, cards } = await makeProject(t, a.token, "Живое", ["Раз", "Два"]);
      const boardEvents = () => emit.mock.calls.filter(([room, event]) => room === `project:${project.id}` && event === "board:changed").map(([, , data]) => data);

      emit.mockClear();
      const created = (await A.post("/cards", { columnId: columns[0].id, title: "Новая" }).expect(201)).body;
      expect(boardEvents()).toEqual([{ projectId: project.id, cardId: created.id, op: "upsert" }]);
      emit.mockClear();
      await A.patch(`/cards/${cards[0].id}`, { title: "Раз!" }).expect(200);
      await A.post(`/cards/${cards[0].id}/move`, { columnId: columns[1].id }).expect(201);
      await A.post(`/cards/${cards[0].id}/comments`, { text: "x" }).expect(201);
      expect(boardEvents().every((e) => (e as { cardId: string; op: string }).cardId === cards[0].id && (e as { op: string }).op === "upsert")).toBe(true);
      expect(boardEvents()).toHaveLength(3);
      emit.mockClear();
      await A.del(`/cards/${cards[1].id}`).expect(200);
      expect(boardEvents()).toEqual([{ projectId: project.id, cardId: cards[1].id, op: "remove" }]);
      emit.mockClear();
      await A.post("/cards/bulk", { ids: [cards[0].id, created.id], action: "priority", priority: "HIGH" }).expect(201);
      expect(boardEvents()).toEqual([{ projectId: project.id }]); // no card named: the board is reloaded
    } finally {
      emit.mockRestore();
    }
  });
});
