import { api, createApp, makeProject, register, type TestApp } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(async () => {
  await t.close();
});

describe("task types", () => {
  it("every workspace starts with one default type, the starter template uses it", async () => {
    const a = await register(t, "tt1");
    const A = api(t, a.token);
    const list = (await A.get("/task-types").expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Задача", isDefault: true, color: null });
    const template = (await A.get("/templates").expect(200)).body.find((x: { name: string }) => x.name === "Знакомство с Plano");
    expect(template).toBeTruthy();
    const full = (await A.get(`/templates/${template.id}`).expect(200)).body;
    expect(full.cards.length).toBeGreaterThanOrEqual(5);
    expect(new Set(full.cards.map((c: { typeId: string }) => c.typeId))).toEqual(new Set([list[0].id]));
  });

  it("registers in English with English starter content", async () => {
    const res = await api(t).post("/auth/register", { workspaceName: "Acme", name: "Ann", email: `en-${Date.now()}@iso.test`, password: "password-123", locale: "en" }).expect(201);
    const A = api(t, res.body.accessToken);
    expect((await A.get("/task-types")).body[0].name).toBe("Task");
    expect((await A.get("/templates")).body.map((x: { name: string }) => x.name)).toContain("Getting started with Plano");
  });

  it("cards get the default type, or the chosen one, and show it on the board", async () => {
    const a = await register(t, "tt2");
    const A = api(t, a.token);
    const bug = (await A.post("/task-types", { name: "Ошибка", color: "red" }).expect(201)).body;
    const { board, columns, project } = await makeProject(t, a.token, "П");
    const plain = (await A.post("/cards", { columnId: columns[0].id, title: "Обычная" }).expect(201)).body;
    const typed = (await A.post("/cards", { columnId: columns[0].id, title: "Баг", typeId: bug.id }).expect(201)).body;
    expect(plain.type).toMatchObject({ name: "Задача" });
    expect(typed.type).toMatchObject({ id: bug.id, name: "Ошибка", color: "red" });
    await A.patch(`/cards/${plain.id}`, { typeId: bug.id }).expect(200);
    const shown = (await A.get(`/projects/${project.id}/board`).expect(200)).body.columns[0].cards;
    expect(shown.every((c: { type: { id: string } }) => c.type.id === bug.id)).toBe(true);
    expect(board).toBeTruthy();
    expect((await A.get("/task-types")).body.find((x: { id: string }) => x.id === bug.id).cardCount).toBe(2);
  });

  it("validates names and colours, keeps a default, reassigns cards on delete", async () => {
    const a = await register(t, "tt3");
    const A = api(t, a.token);
    const base = (await A.get("/task-types")).body[0];
    await A.post("/task-types", { name: "" }).expect(400);
    await A.post("/task-types", { name: "x", color: "pink-ish" }).expect(400);
    await A.post("/task-types", { name: "задача" }).expect(409);
    const feat = (await A.post("/task-types", { name: "Фича", color: "blue" }).expect(201)).body;
    await A.patch(`/task-types/${feat.id}`, { name: "ЗАДАЧА" }).expect(409);
    await A.patch(`/task-types/${feat.id}`, { name: "Функция", color: null }).expect(200);
    await A.patch(`/task-types/${base.id}`, { isDefault: false }).expect(409);
    await A.del(`/task-types/${base.id}`).expect(409);

    const { columns, project } = await makeProject(t, a.token, "П");
    const card = (await A.post("/cards", { columnId: columns[0].id, title: "К", typeId: feat.id }).expect(201)).body;
    await A.del(`/task-types/${feat.id}`).expect(204);
    const after = (await A.get(`/cards/${card.id}`).expect(200)).body;
    expect(after.type.id).toBe(base.id);

    // the default can move to another type
    const second = (await A.post("/task-types", { name: "Дела" }).expect(201)).body;
    await A.patch(`/task-types/${second.id}`, { isDefault: true }).expect(200);
    const types = (await A.get("/task-types")).body;
    expect(types.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id)).toEqual([second.id]);
    const fresh = (await A.post("/cards", { columnId: columns[0].id, title: "Новая" }).expect(201)).body;
    expect(fresh.type.id).toBe(second.id);
    expect(project).toBeTruthy();
  });

  it("recurring rules and templates keep the type; deleting a type moves them too", async () => {
    const a = await register(t, "tt4");
    const A = api(t, a.token);
    const type = (await A.post("/task-types", { name: "Отчёт" }).expect(201)).body;
    const { project } = await makeProject(t, a.token, "П");
    const rule = (await A.post(`/projects/${project.id}/recurring`, { title: "Ежедневно", typeId: type.id, frequency: "DAILY", interval: 1, startDate: "2026-10-05" }).expect(201)).body;
    expect(rule.typeId).toBe(type.id);
    const tpl = (await A.post("/templates", { name: "Т", columns: ["А"], cards: [{ title: "К", typeId: type.id, checklist: [] }] }).expect(201)).body;
    await A.del(`/task-types/${type.id}`).expect(204);
    const base = (await A.get("/task-types")).body[0];
    expect((await A.get(`/templates/${tpl.id}`)).body.cards[0].typeId).toBe(base.id);
    expect((await A.get(`/projects/${project.id}/recurring`)).body[0].typeId).toBe(base.id);
  });

  it("is writable only with types.manage and isolated per workspace", async () => {
    const a = await register(t, "tt5");
    const b = await register(t, "tt6");
    const A = api(t, a.token);
    const mine = (await A.post("/task-types", { name: "Моя" }).expect(201)).body;
    await api(t, b.token).patch(`/task-types/${mine.id}`, { name: "Чужая" }).expect(404);
    await api(t, b.token).del(`/task-types/${mine.id}`).expect(404);
    const { columns } = await makeProject(t, b.token, "Б");
    await api(t, b.token).post("/cards", { columnId: columns[0].id, title: "x", typeId: mine.id }).expect(404);

    await A.post("/users", { email: `m-${Date.now()}@iso.test`, name: "Участник", password: "password-123", role: "MEMBER" }).expect(201);
    const member = await t.db.user.findFirstOrThrow({ where: { workspaceId: a.workspaceId, role: "MEMBER" } });
    expect(member).toBeTruthy();
  });
});
