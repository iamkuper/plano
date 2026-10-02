import { api, createApp, makeProject, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

const member = async (admin: { token: string }, roleId?: string) => {
  const inv = await api(t, admin.token).post("/invitations", { email: `${unique("m")}@iso.test`, roleId }).expect(201);
  return (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken as string;
};

describe("labels", () => {
  it("anyone creates and assigns; only labels.manage renames or deletes", async () => {
    const a = await register(t, "lab");
    const A = api(t, a.token);
    const m = api(t, await member(a));
    const { cards } = await makeProject(t, a.token, "L", ["x"]);
    const label = (await m.post("/labels", { name: "Срочно", color: "red" }).expect(201)).body;
    await A.post("/labels", { name: "срочно", color: "blue" }).expect(409);
    await A.post("/labels", { name: "x", color: "magenta" }).expect(400);
    await A.post("/labels", { name: "", color: "red" }).expect(400);
    expect((await A.get("/labels").expect(200)).body).toEqual([{ id: label.id, name: "Срочно", color: "red" }]);

    const updated = (await m.patch(`/cards/${cards[0].id}`, { labelIds: [label.id] }).expect(200)).body;
    expect(updated.labels[0].label).toMatchObject({ name: "Срочно", color: "red" });
    await m.patch(`/cards/${cards[0].id}`, { labelIds: ["missing"] }).expect(400);
    await m.patch(`/labels/${label.id}`, { name: "Новое" }).expect(403);
    await m.del(`/labels/${label.id}`).expect(403);

    expect((await A.patch(`/labels/${label.id}`, { name: "Горит", color: "orange" }).expect(200)).body).toMatchObject({ name: "Горит", color: "orange" });
    await A.post("/labels", { name: "Второй", color: "gray" });
    await A.patch(`/labels/${label.id}`, { name: "второй" }).expect(409);
    await A.del(`/labels/${label.id}`).expect(204);
    expect((await A.get(`/cards/${cards[0].id}`)).body.labels).toEqual([]);
  });
});

describe("start dates", () => {
  it("saves start and due dates and rejects an inverted range, on any plan", async () => {
    const a = await register(t, "dates");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "D", ["x", "y"]);
    const ok = (await A.patch(`/cards/${cards[0].id}`, { startDate: "2026-10-05", dueDate: "2026-10-09" }).expect(200)).body;
    expect(ok.startDate).toContain("2026-10-05");
    expect(ok.dueDate).toContain("2026-10-09");
    await A.patch(`/cards/${cards[0].id}`, { startDate: "2026-10-20" }).expect(400);
    await A.patch(`/cards/${cards[0].id}`, { dueDate: "2026-10-01" }).expect(400);
    await A.patch(`/cards/${cards[1].id}`, { startDate: "2026-10-05" }).expect(200);
    expect((await A.patch(`/cards/${cards[1].id}`, { startDate: null }).expect(200)).body.startDate).toBeNull();
    await A.patch("/cards/missing", { startDate: "2026-10-05" }).expect(404);
  });
});

describe("gantt dependencies (Business)", () => {
  it("is locked below Business", async () => {
    const a = await register(t, "gl");
    const { project, cards } = await makeProject(t, a.token, "G", ["a", "b"]);
    const A = api(t, a.token);
    await A.get(`/projects/${project.id}/dependencies`).expect(402);
    await A.post(`/cards/${cards[1].id}/dependencies`, { dependsOnId: cards[0].id }).expect(402);
    await A.del(`/cards/${cards[1].id}/dependencies/${cards[0].id}`).expect(402);
  });

  it("links cards, refuses self, cross-project and cyclic links, cleans up on delete", async () => {
    const a = await register(t, "gb");
    await setPlan(t, a.workspaceId, "BUSINESS");
    const A = api(t, a.token);
    const one = await makeProject(t, a.token, "P1", ["a", "b", "c"]);
    const two = await makeProject(t, a.token, "P2", ["z"]);
    const [c1, c2, c3] = one.cards;

    await A.post(`/cards/${c2.id}/dependencies`, { dependsOnId: c1.id }).expect(201);
    await A.post(`/cards/${c2.id}/dependencies`, { dependsOnId: c1.id }).expect(201); // idempotent
    await A.post(`/cards/${c3.id}/dependencies`, { dependsOnId: c2.id }).expect(201);
    await A.post(`/cards/${c1.id}/dependencies`, { dependsOnId: c1.id }).expect(400);
    await A.post(`/cards/${c1.id}/dependencies`, { dependsOnId: c2.id }).expect(400);
    await A.post(`/cards/${c1.id}/dependencies`, { dependsOnId: c3.id }).expect(400);
    await A.post(`/cards/${c1.id}/dependencies`, { dependsOnId: two.cards[0].id }).expect(400);
    await A.post(`/cards/${c1.id}/dependencies`, { dependsOnId: "missing" }).expect(404);
    await A.post("/cards/missing/dependencies", { dependsOnId: c1.id }).expect(404);

    const list = (await A.get(`/projects/${one.project.id}/dependencies`).expect(200)).body;
    expect(list).toEqual(expect.arrayContaining([{ cardId: c2.id, dependsOnId: c1.id }, { cardId: c3.id, dependsOnId: c2.id }]));
    expect((await A.get(`/projects/${two.project.id}/dependencies`)).body).toEqual([]);

    await A.del(`/cards/${c3.id}/dependencies/${c2.id}`).expect(204);
    await A.del("/cards/missing/dependencies/x").expect(404);
    expect((await A.get(`/projects/${one.project.id}/dependencies`)).body).toHaveLength(1);
    await A.del(`/cards/${c1.id}`).expect(200);
    expect((await A.get(`/projects/${one.project.id}/dependencies`)).body).toHaveLength(0);
  });

  it("keeps links private to the workspace", async () => {
    const a = await register(t, "gc");
    const b = await register(t, "gd");
    await setPlan(t, a.workspaceId, "BUSINESS");
    await setPlan(t, b.workspaceId, "BUSINESS");
    const one = await makeProject(t, a.token, "P", ["a", "b"]);
    await api(t, a.token).post(`/cards/${one.cards[1].id}/dependencies`, { dependsOnId: one.cards[0].id }).expect(201);
    expect((await api(t, b.token).get(`/projects/${one.project.id}/dependencies`).expect(200)).body).toEqual([]);
    await api(t, b.token).post(`/cards/${one.cards[0].id}/dependencies`, { dependsOnId: one.cards[1].id }).expect(404);
    await api(t, b.token).del(`/cards/${one.cards[1].id}/dependencies/${one.cards[0].id}`).expect(404);
  });
});

describe("custom fields (Business)", () => {
  it("is locked below Business but definitions stay readable", async () => {
    const a = await register(t, "fl");
    await api(t, a.token).post("/fields", { name: "Бюджет", type: "NUMBER" }).expect(402);
    await api(t, a.token).get("/fields").expect(200);
  });

  it("defines the five field types and validates every value", async () => {
    const a = await register(t, "fb");
    await setPlan(t, a.workspaceId, "BUSINESS");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "F", ["карточка"]);
    const mk = async (name: string, type: string, options?: string[]) => (await A.post("/fields", { name, type, options }).expect(201)).body;
    const num = await mk("Бюджет", "NUMBER");
    const txt = await mk("Заметка", "TEXT");
    const date = await mk("Дата сдачи", "DATE");
    const sel = await mk("Этап", "SELECT", ["Идея", "В работе", "Идея", " "]);
    const flag = await mk("Согласовано", "CHECKBOX");
    expect(sel.options).toEqual(["Идея", "В работе"]);

    await A.post("/fields", { name: "бюджет", type: "TEXT" }).expect(409);
    await A.post("/fields", { name: "Пусто", type: "SELECT", options: [] }).expect(400);
    await A.post("/fields", { name: "Тип", type: "FILE" }).expect(400);

    const put = (id: string, value: unknown) => A.put(`/cards/${cards[0].id}/fields/${id}`, { value });
    await put(num.id, 1500.5).expect(204);
    await put(txt.id, "привет").expect(204);
    await put(date.id, "2026-12-31").expect(204);
    await put(sel.id, "В работе").expect(204);
    await put(flag.id, true).expect(204);
    await put(num.id, "много").expect(400);
    await put(txt.id, "я".repeat(501)).expect(400);
    await put(date.id, "31.12.2026").expect(400);
    await put(date.id, "2026-13-45").expect(400);
    await put(sel.id, "Другое").expect(400);
    await put(flag.id, 1).expect(400);

    const values = (await A.get(`/cards/${cards[0].id}`)).body.fieldValues;
    const v = (id: string) => values.find((x: { fieldId: string }) => x.fieldId === id)?.value;
    expect([v(num.id), v(txt.id), v(date.id), v(sel.id), v(flag.id)]).toEqual([1500.5, "привет", "2026-12-31", "В работе", true]);
    await put(txt.id, null).expect(204);
    await put(num.id, 2000).expect(204); // overwrite
    expect((await A.get(`/cards/${cards[0].id}`)).body.fieldValues).toHaveLength(4);
    await A.put("/cards/missing/fields/" + num.id, { value: 1 }).expect(404);
    await A.put(`/cards/${cards[0].id}/fields/missing`, { value: 1 }).expect(404);

    expect((await A.patch(`/fields/${num.id}`, { name: "Бюджет, ₽" }).expect(200)).body.name).toBe("Бюджет, ₽");
    expect((await A.patch(`/fields/${sel.id}`, { options: ["А", "Б"] }).expect(200)).body.options).toEqual(["А", "Б"]);
    await A.patch(`/fields/${sel.id}`, { options: [] }).expect(400);
    await A.patch(`/fields/${num.id}`, { name: "заметка" }).expect(409);
    await A.patch("/fields/missing", { name: "x" }).expect(404);
    await A.del(`/fields/${num.id}`).expect(204);
    expect((await A.get(`/cards/${cards[0].id}`)).body.fieldValues.some((x: { fieldId: string }) => x.fieldId === num.id)).toBe(false);
  });

  it("limits the number of fields", async () => {
    const a = await register(t, "fmax");
    await setPlan(t, a.workspaceId, "BUSINESS");
    const A = api(t, a.token);
    for (let i = 0; i < 20; i++) await A.post("/fields", { name: `Поле ${i}`, type: "TEXT" }).expect(201);
    await A.post("/fields", { name: "Лишнее", type: "TEXT" }).expect(400);
  });

  it("needs fields.manage to define, but any member sets values; downgrade keeps data readable", async () => {
    const a = await register(t, "fperm");
    await setPlan(t, a.workspaceId, "BUSINESS");
    const A = api(t, a.token);
    const m = api(t, await member(a));
    const { cards } = await makeProject(t, a.token, "F", ["x"]);
    const field = (await A.post("/fields", { name: "Бюджет", type: "NUMBER" })).body;
    await m.post("/fields", { name: "Свой", type: "TEXT" }).expect(403);
    await m.patch(`/fields/${field.id}`, { name: "Свой" }).expect(403);
    await m.del(`/fields/${field.id}`).expect(403);
    await m.put(`/cards/${cards[0].id}/fields/${field.id}`, { value: 5 }).expect(204);
    await setPlan(t, a.workspaceId, "FREE");
    expect((await A.get(`/cards/${cards[0].id}`)).body.fieldValues).toHaveLength(1);
    await A.put(`/cards/${cards[0].id}/fields/${field.id}`, { value: 6 }).expect(402);
  });

  it("is isolated between workspaces", async () => {
    const a = await register(t, "fiso");
    const b = await register(t, "fiso2");
    await setPlan(t, a.workspaceId, "BUSINESS");
    await setPlan(t, b.workspaceId, "BUSINESS");
    const field = (await api(t, a.token).post("/fields", { name: "Бюджет", type: "NUMBER" })).body;
    const mine = await makeProject(t, a.token, "A", ["x"]);
    const theirs = await makeProject(t, b.token, "B", ["y"]);
    expect((await api(t, b.token).get("/fields")).body).toEqual([]);
    await api(t, b.token).put(`/cards/${mine.cards[0].id}/fields/${field.id}`, { value: 1 }).expect(404);
    await api(t, b.token).put(`/cards/${theirs.cards[0].id}/fields/${field.id}`, { value: 1 }).expect(404);
    await api(t, b.token).patch(`/fields/${field.id}`, { name: "x" }).expect(404);
    await api(t, b.token).del(`/fields/${field.id}`).expect(404);
  });
});
