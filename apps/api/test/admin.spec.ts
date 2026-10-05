import { api, createApp, makeProject, register, TestApp, unique } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

const joinAs = async (admin: { token: string }, roleId?: string) => {
  const email = `${unique("m")}@iso.test`;
  const inv = await api(t, admin.token).post("/invitations", { email, roleId }).expect(201);
  const res = await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "Сотрудник", password: "password-123" }).expect(201);
  return { token: res.body.accessToken as string, email };
};

describe("roles", () => {
  it("is admin-only, validates names and permissions, and keeps one default", async () => {
    const a = await register(t, "roles");
    const A = api(t, a.token);
    await A.post("/roles", { name: "Администратор" }).expect(409);
    await A.post("/roles", { name: "" }).expect(400);
    await A.post("/roles", { name: "Х", permissions: ["no.such"] }).expect(400);
    const first = (await A.post("/roles", { name: "Менеджер", permissions: ["projects.create"] }).expect(201)).body;
    const second = (await A.post("/roles", { name: "Подрядчик", permissions: [] }).expect(201)).body;
    expect(first.isDefault).toBe(true); // the first role becomes the default
    expect(second.isDefault).toBe(false);
    await A.post("/roles", { name: "менеджер" }).expect(409); // case-insensitive duplicate

    const renamed = (await A.patch(`/roles/${second.id}`, { name: "Фрилансер", permissions: ["labels.manage"] }).expect(200)).body;
    expect(renamed).toMatchObject({ name: "Фрилансер", permissions: ["labels.manage"] });
    await A.patch(`/roles/${second.id}`, { name: "Менеджер" }).expect(409);
    await A.patch(`/roles/${second.id}`, { isDefault: true }).expect(200);
    const roles = (await A.get("/roles").expect(200)).body;
    expect(roles.filter((r: { isDefault: boolean }) => r.isDefault)).toHaveLength(1);
    expect(roles[0].id).toBe(second.id);

    const member = await joinAs(a);
    await api(t, member.token).post("/roles", { name: "Взлом" }).expect(403);
    await api(t, member.token).get("/roles").expect(200);
  });

  it("moves staff to the default role on delete, and never deletes the default", async () => {
    const a = await register(t, "roles2");
    const A = api(t, a.token);
    const def = (await A.post("/roles", { name: "Базовая", permissions: [] })).body;
    const other = (await A.post("/roles", { name: "Особая", permissions: [] })).body;
    await joinAs(a, other.id);
    expect((await A.del(`/roles/${def.id}`).expect(400)).body.message).toContain("по умолчанию");
    await A.del(`/roles/${other.id}`).expect(204);
    const member = await t.db.user.findFirstOrThrow({ where: { workspaceId: a.workspaceId, role: "MEMBER" } });
    expect(member.roleId).toBe(def.id);
  });
});

describe("users", () => {
  it("admin adds people directly, edits roles, deactivates, resets passwords", async () => {
    const a = await register(t, "users");
    const A = api(t, a.token);
    const email = `${unique("direct")}@iso.test`;
    const created = (await A.post("/users", { email, name: "Прямой", password: "password-123" }).expect(201)).body;
    expect(created).toMatchObject({ email, role: "MEMBER", roleName: "Без роли", permissions: [] });
    await A.post("/users", { email, name: "Дубль", password: "password-123" }).expect(409);
    await A.post("/users", { email: "bad", name: "x", password: "password-123" }).expect(400);
    await api(t).post("/auth/login", { email, password: "password-123" }).expect(201);

    const role = (await A.post("/roles", { name: "Редактор", permissions: ["projects.edit"] })).body;
    const edited = (await A.patch(`/users/${created.id}`, { roleId: role.id }).expect(200)).body;
    expect(edited).toMatchObject({ roleName: "Редактор", permissions: ["projects.edit"] });
    expect((await A.patch(`/users/${created.id}`, { role: "ADMIN" }).expect(200)).body).toMatchObject({ roleName: "Администратор", roleId: null });
    expect((await A.get("/users").expect(200)).body.length).toBe(2);

    await A.post(`/users/${created.id}/password`, { password: "new-secret-pass" }).expect(204);
    await api(t).post("/auth/login", { email, password: "password-123" }).expect(401);
    await api(t).post("/auth/login", { email, password: "new-secret-pass" }).expect(201);
    await A.post(`/users/${created.id}/password`, { password: "short" }).expect(400);
  });

  it("members only change their own profile, password and photo", async () => {
    const a = await register(t, "self");
    const m = await joinAs(a);
    const M = api(t, m.token);
    await M.post("/users", { email: "x@iso.test", name: "x", password: "password-123" }).expect(403);
    await M.patch("/users/someone", { name: "x" }).expect(403);
    await M.post("/users/someone/password", { password: "password-123" }).expect(403);

    expect((await M.get("/users/me").expect(200)).body.email).toBe(m.email);
    expect((await M.patch("/users/me", { name: "Новое имя", emailNotifications: false }).expect(200)).body).toMatchObject({ name: "Новое имя", emailNotifications: false });
    await M.patch("/users/me", { email: a.email }).expect(409); // taken by the admin
    const email = `${unique("new")}@iso.test`;
    expect((await M.patch("/users/me", { email }).expect(200)).body.email).toBe(email);
    await M.patch("/users/me", { email: "bad" }).expect(400);

    await M.post("/users/me/password", { currentPassword: "wrong-one-123", newPassword: "another-pass-1" }).expect(400);
    await M.post("/users/me/password", { currentPassword: "password-123", newPassword: "short" }).expect(400);
    await M.post("/users/me/password", { currentPassword: "password-123", newPassword: "another-pass-1" }).expect(204);
    await api(t).post("/auth/login", { email, password: "another-pass-1" }).expect(201);

    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect((await M.put("/users/me/avatar", { avatarUrl: png }).expect(200)).body.avatarUrl).toBe(png);
    await M.put("/users/me/avatar", { avatarUrl: "data:text/html;base64,AAAA" }).expect(400);
    await M.put("/users/me/avatar", { avatarUrl: `data:image/png;base64,${"A".repeat(1_500_001)}` }).expect(400);
    expect((await M.put("/users/me/avatar", { avatarUrl: null }).expect(200)).body.avatarUrl).toBeNull();
  });

  it("reactivating a person beyond the plan's seats is refused", async () => {
    const a = await register(t, "seats");
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { planId: "FREE", status: "ACTIVE", trialEndsAt: null } });
    const A = api(t, a.token);
    const u1 = (await A.post("/users", { email: `${unique("a")}@iso.test`, name: "A", password: "password-123" }).expect(201)).body;
    await A.post("/users", { email: `${unique("b")}@iso.test`, name: "B", password: "password-123" }).expect(201);
    await A.patch(`/users/${u1.id}`, { isActive: false }).expect(200);
    await A.post("/users", { email: `${unique("c")}@iso.test`, name: "C", password: "password-123" }).expect(201);
    await A.post("/users", { email: `${unique("d")}@iso.test`, name: "D", password: "password-123" }).expect(402);
    await A.patch(`/users/${u1.id}`, { isActive: true }).expect(402);
  });
});

describe("workspace settings", () => {
  it("reads and updates name, key prefix and default stages with validation", async () => {
    const a = await register(t, "set");
    const A = api(t, a.token);
    expect((await A.get("/settings").expect(200)).body).toMatchObject({ cardPrefix: "TSK", defaultColumns: ["Бэклог", "В работе", "На проверке", "Готово"] });
    const res = (await A.patch("/settings", { workspaceName: "  Моя компания", cardPrefix: "abc", defaultColumns: [" Новое ", "", "Сделано"] }).expect(200)).body;
    expect(res).toMatchObject({ workspaceName: "  Моя компания", cardPrefix: "ABC", defaultColumns: ["Новое", "Сделано"] });
    await A.patch("/settings", { cardPrefix: "too long!" }).expect(400);
    await A.patch("/settings", { defaultColumns: [] }).expect(400);
    await A.patch("/settings", { workspaceName: "" }).expect(400);
    // new projects use the new stages and key prefix
    const { board, cards } = await makeProject(t, a.token, "P", ["x"]);
    expect(board.columns.map((c: { title: string }) => c.title)).toEqual(["Новое", "Сделано"]);
    expect(cards[0].number).toBe(1);

    await api(t).get("/settings").expect(401);
    const m = await joinAs(a);
    await api(t, m.token).patch("/settings", { workspaceName: "Взлом" }).expect(403);
    await api(t, m.token).get("/settings").expect(200);
  });
});

describe("templates", () => {
  const body = {
    name: "Мой шаблон",
    columns: ["Идеи", "Готово"],
    cards: [
      { title: "Первая", estimateHours: 2, checklist: ["а", "б"] },
      { title: "Вторая", description: "Описание", checklist: [] },
    ],
  };

  it("creates, reads, replaces and deletes; needs templates.manage", async () => {
    const a = await register(t, "tpl");
    const A = api(t, a.token);
    const created = (await A.post("/templates", body).expect(201)).body;
    const full = (await A.get(`/templates/${created.id}`).expect(200)).body;
    expect(full.cards.map((c: { title: string; checklist: string[] }) => [c.title, c.checklist.length])).toEqual([["Первая", 2], ["Вторая", 0]]);
    expect((await A.get("/templates")).body.some((x: { id: string; _count: { cards: number } }) => x.id === created.id && x._count.cards === 2)).toBe(true);

    const saved = (await A.put(`/templates/${created.id}`, { ...body, name: "Новое имя", cards: [body.cards[0]] }).expect(200)).body;
    expect(saved).toMatchObject({ name: "Новое имя" });
    expect(saved.cards).toHaveLength(1);
    await A.post("/templates", { ...body, name: "" }).expect(400);

    const m = await joinAs(a);
    await api(t, m.token).post("/templates", body).expect(403);
    await api(t, m.token).get(`/templates/${created.id}`).expect(200);
    await A.del(`/templates/${created.id}`).expect(204);
    await A.get(`/templates/${created.id}`).expect(404);
  });

  it("snapshots a project into a template", async () => {
    const a = await register(t, "tpl2");
    const A = api(t, a.token);
    const { project, cards } = await makeProject(t, a.token, "Образец", ["Один", "Два"]);
    await A.post(`/cards/${cards[0].id}/checklist`, { text: "пункт" });
    const snap = (await A.post(`/templates/from-project/${project.id}`, { name: "Снимок" }).expect(201)).body;
    const full = (await A.get(`/templates/${snap.id}`)).body;
    expect(full.columns).toEqual(["Бэклог", "В работе", "На проверке", "Готово"]);
    expect(full.cards.map((c: { title: string; checklist: string[] }) => [c.title, c.checklist])).toEqual([["Один", ["пункт"]], ["Два", []]]);
    await A.post("/templates/from-project/missing", { name: "x" }).expect(404);
  });
});
