import { PrismaClient, Prisma } from "@prisma/client";
import { io, Socket } from "socket.io-client";
import { AddressInfo } from "net";
import { PrismaExceptionFilter } from "../src/prisma/prisma-exception.filter";
import { CARD_FIELDS, OWN_FIELDS, changedFields, currentUserId, currentWorkspaceId, runInWorkspace, scopedClient } from "../src/prisma/tenant";
import { api, createApp, makeProject, register, setPlan, TestApp } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

const denied = (status: number) => [400, 402, 403, 404].includes(status);

describe("tenant isolation over HTTP", () => {
  it("B can neither read nor change anything of A's", async () => {
    const a = await register(t, "isoA");
    const b = await register(t, "isoB");
    await setPlan(t, a.workspaceId, "BUSINESS");
    await setPlan(t, b.workspaceId, "BUSINESS");
    const A = api(t, a.token);
    const B = api(t, b.token);

    const tpl = (await A.get("/templates")).body[0];
    const mine = await makeProject(t, a.token, "Секретный", ["Секретная карточка"]);
    const [card] = mine.cards;
    const column = mine.columns[0];
    const item = (await A.post(`/cards/${card.id}/checklist`, { text: "пункт" })).body;
    const comment = (await A.post(`/cards/${card.id}/comments`, { text: "секрет" })).body;
    const role = (await A.post("/roles", { name: "Роль A", permissions: [] })).body;
    const label = (await A.post("/labels", { name: "Метка A", color: "red" })).body;
    const field = (await A.post("/fields", { name: "Поле A", type: "TEXT" })).body;
    const rule = (await A.post(`/projects/${mine.project.id}/recurring`, { title: "Правило", frequency: "DAILY", interval: 1, startDate: "2026-10-05", active: true })).body;
    const inv = (await A.post("/invitations", { email: "someone@iso.test" })).body;
    const attachment = await t.db.attachment.create({ data: { cardId: card.id, uploaderId: a.userId, name: "f", mime: "text/plain", size: 1, storageKey: `iso-${Date.now()}` } });
    const entry = (await A.post(`/cards/${card.id}/time`, { minutes: 5, date: "2026-10-01" })).body;
    const other = await makeProject(t, a.token, "Второй", ["b"]);
    await A.post(`/cards/${card.id}/dependencies`, { dependsOnId: other.cards[0].id }).expect(400); // different project

    // reads
    expect((await B.get("/projects")).body).toEqual([]);
    for (const path of [`/projects/${mine.project.id}`, `/projects/${mine.project.id}/board`, `/projects/${mine.project.id}/stats`, `/cards/${card.id}`, `/templates/${tpl.id}`, `/projects/${mine.project.id}/recurring`, `/projects/${mine.project.id}/dependencies`, `/projects/${mine.project.id}/export.csv`]) {
      const res = await B.get(path);
      expect([path, res.status === 404 || (res.status === 200 && JSON.stringify(res.body) === "[]")]).toEqual([path, true]);
    }
    expect((await B.get("/cards/search?q=Секретная")).body).toEqual([]);
    expect((await B.get("/team-board")).body.every((c: { cards: unknown[] }) => c.cards.length === 0)).toBe(true);
    expect((await B.get("/users")).body.every((u: { id: string }) => u.id !== a.userId)).toBe(true);
    expect((await B.get("/roles")).body.every((r: { id: string }) => r.id !== role.id)).toBe(true);
    expect((await B.get("/templates")).body.every((x: { id: string }) => x.id !== tpl.id)).toBe(true);
    expect((await B.get("/labels")).body.map((l: { name: string }) => l.name)).toEqual(["Ошибка", "Улучшение", "Фича"]); // only its own starter labels
    expect((await B.get("/fields")).body).toEqual([]);
    expect((await B.get("/invitations")).body).toEqual([]);
    expect((await B.get("/reports/time?from=2020-01-01&to=2030-01-01")).body).toEqual([]);
    expect((await B.get("/audit")).body.items.every((i: { summary: string }) => !i.summary.includes("Секретный"))).toBe(true);
    expect((await B.get("/billing")).body.payments).toEqual([]);

    // writes
    const writes: [string, string, object?][] = [
      ["patch", `/projects/${mine.project.id}`, { title: "взлом" }],
      ["patch", `/cards/${card.id}`, { title: "взлом" }],
      ["post", `/cards/${card.id}/move`, { columnId: column.id }],
      ["post", `/cards/${card.id}/read`],
      ["delete", `/cards/${card.id}`],
      ["post", `/cards/${card.id}/comments`, { text: "x" }],
      ["post", `/cards/${card.id}/checklist`, { text: "x" }],
      ["patch", `/checklist/${item.id}`, { text: "x" }],
      ["delete", `/checklist/${item.id}`],
      ["delete", `/comments/${comment.id}`],
      ["post", `/cards/${card.id}/time`, { minutes: 1, date: "2026-10-01" }],
      ["delete", `/time/${entry.id}`],
      ["post", `/boards/${mine.board.id}/columns`, { title: "x" }],
      ["patch", `/columns/${column.id}`, { title: "x" }],
      ["delete", `/columns/${column.id}`],
      ["post", "/projects", { title: "x", templateId: tpl.id }],
      ["put", `/templates/${tpl.id}`, { name: "x", columns: ["a"], cards: [] }],
      ["delete", `/templates/${tpl.id}`],
      ["post", `/templates/from-project/${mine.project.id}`, { name: "x" }],
      ["patch", `/users/${a.userId}`, { name: "x" }],
      ["post", `/users/${a.userId}/password`, { password: "hacked-12345" }],
      ["patch", `/roles/${role.id}`, { name: "x" }],
      ["delete", `/roles/${role.id}`],
      ["patch", `/labels/${label.id}`, { name: "x" }],
      ["delete", `/labels/${label.id}`],
      ["patch", `/fields/${field.id}`, { name: "x" }],
      ["delete", `/fields/${field.id}`],
      ["put", `/cards/${card.id}/fields/${field.id}`, { value: "x" }],
      ["post", `/cards/${card.id}/dependencies`, { dependsOnId: other.cards[0].id }],
      ["put", `/recurring/${rule.id}`, { title: "x", frequency: "DAILY", interval: 1, startDate: "2026-10-05", active: true }],
      ["patch", `/recurring/${rule.id}`, { active: false }],
      ["post", `/recurring/${rule.id}/run`],
      ["delete", `/recurring/${rule.id}`],
      ["post", `/projects/${mine.project.id}/recurring`, { title: "x", frequency: "DAILY", interval: 1, startDate: "2026-10-05", active: true }],
      ["delete", `/invitations/${inv.id}`],
      ["delete", `/attachments/${attachment.id}`],
      ["delete", `/projects/${mine.project.id}`],
      ["post", "/cards/bulk", { ids: [card.id], action: "delete" }],
    ];
    for (const [method, path, body] of writes) {
      const res = await B.raw(method as "post", path).send(body);
      expect([method, path, denied(res.status)]).toEqual([method, path, true]);
    }

    // nothing of A's changed
    const intact = (await A.get(`/cards/${card.id}`)).body;
    expect(intact).toMatchObject({ title: "Секретная карточка" });
    expect(intact.checklist).toHaveLength(1);
    expect(intact.comments).toHaveLength(1);
    expect((await A.get(`/projects/${mine.project.id}`)).body.title).toBe("Секретный");
    expect(await t.db.attachment.count({ where: { id: attachment.id } })).toBe(1);
  });

  it("B cannot point its own records at A's (cross-workspace foreign keys)", async () => {
    const a = await register(t, "fkA");
    const b = await register(t, "fkB");
    await setPlan(t, b.workspaceId, "BUSINESS");
    const mine = await makeProject(t, a.token, "A", ["a"]);
    const label = (await api(t, a.token).post("/labels", { name: "Метка", color: "red" })).body;
    const theirs = await makeProject(t, b.token, "B", ["b"]);
    const B = api(t, b.token);
    await B.post("/cards", { columnId: mine.columns[0].id, title: "x" }).expect(404);
    await B.post("/cards", { columnId: theirs.columns[0].id, title: "x", assigneeIds: [a.userId] }).expect(400);
    await B.patch(`/cards/${theirs.cards[0].id}`, { assigneeIds: [a.userId] }).expect(400);
    await B.patch(`/cards/${theirs.cards[0].id}`, { labelIds: [label.id] }).expect(400);
    await B.post(`/cards/${theirs.cards[0].id}/move`, { columnId: mine.columns[1].id }).expect(400);
    await B.post("/cards/bulk", { ids: [theirs.cards[0].id], action: "assign", userIds: [a.userId] }).expect(404);
    await B.post(`/cards/${theirs.cards[0].id}/dependencies`, { dependsOnId: mine.cards[0].id }).expect(404);
    await B.post("/users", { email: a.email, name: "x", password: "password-123" }).expect(409);
    await B.post("/invitations", { email: a.email }).expect(409);
    expect((await B.post("/labels", { name: "Метка", color: "blue" }).expect(201)).body.id).not.toBe(label.id); // same name is fine across workspaces
  });

  it("numbers cards per workspace from 1", async () => {
    const a = await register(t, "numA");
    const b = await register(t, "numB");
    const one = await makeProject(t, a.token, "1", ["a", "b", "c"]);
    const two = await makeProject(t, b.token, "2", ["x"]);
    expect(one.cards.map((c) => c.number)).toEqual([1, 2, 3]);
    expect(two.cards[0].number).toBe(1);
  });

  it("maps database errors to clean responses", async () => {
    const a = await register(t, "errs");
    await api(t, a.token).patch("/projects/does-not-exist", { title: "x" }).expect(404);
    const filter = new PrismaExceptionFilter();
    const reply = (code: string) => {
      const out: { status?: number; body?: unknown } = {};
      const res = { status: (s: number) => ((out.status = s), { json: (b: unknown) => (out.body = b) }) };
      filter.catch(new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "5" }), { switchToHttp: () => ({ getResponse: () => res }) } as never);
      return out;
    };
    expect(reply("P2025")).toMatchObject({ status: 404 });
    expect(reply("P2002")).toMatchObject({ status: 409 });
    expect(reply("P9999")).toMatchObject({ status: 500, body: { message: "Internal server error" } });
  });
});

// Prisma queries are lazy: they must be awaited inside the workspace context.
const within = <T>(workspaceId: string, fn: () => PromiseLike<T> | T, userId?: string) => runInWorkspace(workspaceId, async () => await fn(), userId);

describe("the scoped Prisma client", () => {
  const raw = new PrismaClient();
  const scoped = scopedClient(raw);
  afterAll(() => raw.$disconnect());

  it("fails closed without a workspace and reports where it was", async () => {
    await expect(scoped.project.findMany()).rejects.toThrow(/Нет контекста рабочего пространства для Project.findMany/);
    expect(currentWorkspaceId()).toBeUndefined();
    expect(currentUserId()).toBeUndefined();
  });

  it("filters reads, updates and deletes by the current workspace", async () => {
    const a = await register(t, "scA");
    const b = await register(t, "scB");
    const mine = await makeProject(t, a.token, "Мой", ["x"]);
    const seenByB = await within(b.workspaceId, () => scoped.project.findMany({ where: { id: mine.project.id } }));
    expect(seenByB).toEqual([]);
    expect(await within(b.workspaceId, () => scoped.project.findUnique({ where: { id: mine.project.id } }))).toBeNull();
    expect(await within(b.workspaceId, () => scoped.project.updateMany({ where: { id: mine.project.id }, data: { title: "x" } }))).toEqual({ count: 0 });
    await expect(within(b.workspaceId, () => scoped.project.update({ where: { id: mine.project.id }, data: { title: "x" } }))).rejects.toThrow();
    expect(await within(b.workspaceId, () => scoped.card.count())).toBe(0);
    expect(await within(a.workspaceId, () => scoped.card.count())).toBe(1);
    expect(await within(a.workspaceId, () => scoped.card.aggregate({ _count: true }))).toMatchObject({ _count: 1 });
    expect(await within(a.workspaceId, () => scoped.project.findFirst({ where: { id: mine.project.id } }))).toMatchObject({ title: "Мой" });
    // nested scopes reach the workspace through relations
    expect(await within(b.workspaceId, () => scoped.column.count())).toBe(0);
    expect(await within(a.workspaceId, () => scoped.column.count())).toBeGreaterThan(0);
  });

  it("sets workspaceId itself on create, ignoring what the caller passes", async () => {
    const a = await register(t, "scC");
    const b = await register(t, "scD");
    const project = await within(a.workspaceId, () => scoped.project.create({ data: { ...OWN_FIELDS, title: "Создан", workspaceId: b.workspaceId } }));
    expect(project.workspaceId).toBe(a.workspaceId);
    const rows = await within(a.workspaceId, () => scoped.label.createManyAndReturn({ data: [{ ...OWN_FIELDS, name: "а", color: "red" }, { ...OWN_FIELDS, name: "б", color: "red" }] }));
    expect(rows.every((r) => r.workspaceId === a.workspaceId)).toBe(true);
  });

  it("checks foreign keys on create, createMany and update", async () => {
    const a = await register(t, "scE");
    const b = await register(t, "scF");
    const theirs = await makeProject(t, b.token, "Чужой", ["x"]);
    const run = <T>(fn: () => PromiseLike<T> | T) => within(a.workspaceId, fn);
    await expect(run(() => scoped.card.create({ data: { ...CARD_FIELDS, projectId: theirs.project.id, columnId: theirs.columns[0].id, title: "x", position: 1 } }))).rejects.toMatchObject({ code: "P2025" });
    await expect(run(() => scoped.checklistItem.create({ data: { cardId: theirs.cards[0].id, text: "x", position: 1 } }))).rejects.toMatchObject({ code: "P2025" });
    await expect(run(() => scoped.cardAssignee.createMany({ data: [{ cardId: theirs.cards[0].id, userId: a.userId }] }))).rejects.toMatchObject({ code: "P2025" });
    const mine = await makeProject(t, a.token, "Мой", ["m"]);
    await expect(run(() => scoped.card.update({ where: { id: mine.cards[0].id }, data: { columnId: theirs.columns[0].id } }))).rejects.toMatchObject({ code: "P2025" });
    await expect(run(() => scoped.card.updateMany({ where: { id: mine.cards[0].id }, data: { columnId: theirs.columns[0].id } }))).rejects.toMatchObject({ code: "P2025" });
    expect(await run(() => scoped.card.update({ where: { id: mine.cards[0].id }, data: { columnId: mine.columns[1].id } }))).toMatchObject({ columnId: mine.columns[1].id });
  });

  it("treats the plan catalogue as shared and read-only, and refuses unknown models", async () => {
    const a = await register(t, "scG");
    const plans = await within(a.workspaceId, () => scoped.plan.findMany());
    expect(plans).toHaveLength(3);
    await expect(within(a.workspaceId, () => scoped.plan.update({ where: { id: "PRO" }, data: { name: "x" } }))).rejects.toThrow(/нельзя менять/);
    await expect(within(a.workspaceId, () => (scoped as unknown as { passwordReset: { findMany(): unknown } }).passwordReset.findMany())).rejects.toThrow(/не описана в SCOPE/);
  });

  it("keeps the user id for the audit and upserts within the scope", async () => {
    const a = await register(t, "scH");
    const seen = runInWorkspace(a.workspaceId, () => [currentWorkspaceId(), currentUserId()], a.userId);
    expect(seen).toEqual([a.workspaceId, a.userId]);
    const label = await within(a.workspaceId, () => scoped.label.upsert({ where: { workspaceId_name: { workspaceId: a.workspaceId, name: "u" } }, create: { ...OWN_FIELDS, name: "u", color: "red" }, update: { color: "blue" } }));
    expect(label.color).toBe("red");
    const again = await within(a.workspaceId, () => scoped.label.upsert({ where: { workspaceId_name: { workspaceId: a.workspaceId, name: "u" } }, create: { ...OWN_FIELDS, name: "u", color: "red" }, update: { color: "blue" } }));
    expect(again.color).toBe("blue");
  });

  it("lists only the fields a DTO actually carries", () => {
    expect(changedFields({ title: "x", status: undefined, hoursBudget: 0 })).toBe("title, hoursBudget");
    expect(changedFields({})).toBe("");
  });
});

describe("realtime rooms", () => {
  let socketA: Socket;
  let baseUrl: string;
  beforeAll(async () => {
    await t.app.listen(0);
    baseUrl = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterEach(() => socketA?.disconnect());

  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(baseUrl, { auth: { token }, transports: ["websocket"], reconnection: false });
      s.on("connect", () => resolve(s));
      s.on("connect_error", reject);
    });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("delivers board changes to members of the workspace and not to outsiders", async () => {
    const a = await register(t, "rtA");
    const b = await register(t, "rtB");
    const mine = await makeProject(t, a.token, "Живая", ["x"]);
    socketA = await connect(a.token);
    const outsider = await connect(b.token);
    const got: string[] = [];
    const leaked: string[] = [];
    socketA.on("board:changed", () => got.push("a"));
    outsider.on("board:changed", () => leaked.push("b"));
    socketA.emit("join", `project:${mine.project.id}`);
    outsider.emit("join", `project:${mine.project.id}`); // refused: not their workspace
    outsider.emit("join", `card:${mine.cards[0].id}`);
    await wait(300);
    await api(t, a.token).patch(`/cards/${mine.cards[0].id}`, { title: "Новое" }).expect(200);
    await wait(400);
    expect(got.length).toBeGreaterThan(0);
    expect(leaked).toEqual([]);
    outsider.disconnect();
  });

  it("sends personal notifications to the right person only and ignores malformed rooms", async () => {
    const a = await register(t, "rtC");
    socketA = await connect(a.token);
    let pings = 0;
    socketA.on("notifications:changed", () => pings++);
    socketA.emit("join", "not a room");
    socketA.emit("join", 42);
    socketA.emit("leave", "project:x");
    socketA.emit("leave", 5);
    await api(t, a.token).post("/notifications/read", {}).expect(204);
    await wait(300);
    expect(pings).toBeGreaterThan(0);
  });

  it("drops connections with a bad token or for inactive users", async () => {
    await expect(
      new Promise((resolve, reject) => {
        const s = io(baseUrl, { auth: { token: "garbage" }, transports: ["websocket"], reconnection: false });
        s.on("disconnect", () => resolve("closed"));
        s.on("connect_error", reject);
        setTimeout(() => resolve("timeout"), 1500);
      }),
    ).resolves.toBe("closed");
    const a = await register(t, "rtD");
    await t.db.user.update({ where: { id: a.userId }, data: { isActive: false } });
    await expect(
      new Promise((resolve) => {
        const s = io(baseUrl, { auth: { token: a.token }, transports: ["websocket"], reconnection: false });
        s.on("disconnect", () => resolve("closed"));
        setTimeout(() => resolve("timeout"), 1500);
      }),
    ).resolves.toBe("closed");
  });
});
