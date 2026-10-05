import { api, createApp, makeProject, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

describe("projects", () => {
  it("creates empty from the workspace's default stages, or from a template with cards", async () => {
    const a = await register(t, "proj");
    const A = api(t, a.token);
    const empty = (await A.post("/projects", { title: "Пустой" }).expect(201)).body;
    const board = (await A.get(`/projects/${empty.id}/board`).expect(200)).body;
    expect(board.columns.map((c: { title: string }) => c.title)).toEqual(["Бэклог", "В работе", "На проверке", "Готово"]);
    expect(board.columns.flatMap((c: { cards: unknown[] }) => c.cards)).toHaveLength(0);

    const tpl = (await A.get("/templates").expect(200)).body[0];
    const full = (await A.post("/projects", { title: "Из шаблона", templateId: tpl.id }).expect(201)).body;
    const fullBoard = (await A.get(`/projects/${full.id}/board`)).body;
    expect(fullBoard.columns[0].cards).toHaveLength(7);
    expect(fullBoard.columns[0].cards[0].checklist.length).toBeGreaterThan(0);
    await A.post("/projects", { title: "Нет шаблона", templateId: "missing" }).expect(404);
    await A.post("/projects", { title: "" }).expect(400);
  });

  it("lists with the open-card count, hides archived by default, filters by status", async () => {
    const a = await register(t, "list");
    const A = api(t, a.token);
    const { project } = await makeProject(t, a.token, "Живой", ["a", "b"]);
    const archived = (await A.post("/projects", { title: "Архивный" })).body;
    await A.patch(`/projects/${archived.id}`, { status: "ARCHIVED" }).expect(200);
    const list = (await A.get("/projects").expect(200)).body;
    expect(list.map((p: { title: string }) => p.title)).toEqual(["Живой"]);
    expect(list[0]).toMatchObject({ id: project.id, openCards: 2 });
    expect((await A.get("/projects?status=ARCHIVED")).body.map((p: { title: string }) => p.title)).toEqual(["Архивный"]);
  });

  it("updates, reports hours against the budget, and deletes with everything inside", async () => {
    const a = await register(t, "upd");
    const A = api(t, a.token);
    const { project, cards } = await makeProject(t, a.token, "P", ["Карточка"]);
    const updated = (await A.patch(`/projects/${project.id}`, { title: "Новое имя", hoursBudget: 10, status: "ON_HOLD" }).expect(200)).body;
    expect(updated).toMatchObject({ title: "Новое имя", hoursBudget: 10, status: "ON_HOLD" });
    await A.post(`/cards/${cards[0].id}/time`, { minutes: 90, date: "2026-10-01" }).expect(201);
    expect((await A.get(`/projects/${project.id}/stats`).expect(200)).body).toEqual({ hoursBudget: 10, loggedMinutes: 90 });
    expect((await A.get(`/projects/${project.id}`).expect(200)).body.title).toBe("Новое имя");
    await A.del(`/projects/${project.id}`).expect(204);
    await A.get(`/projects/${project.id}`).expect(404);
    await A.get(`/cards/${cards[0].id}`).expect(404);
  });

  it("enforces projects.* permissions for members with custom roles", async () => {
    const a = await register(t, "perm");
    const A = api(t, a.token);
    const role = (await A.post("/roles", { name: "Без прав", permissions: [] })).body;
    const inv = await A.post("/invitations", { email: `${unique("m")}@iso.test`, roleId: role.id }).expect(201);
    const member = (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken;
    const M = api(t, member);
    await M.post("/projects", { title: "Нельзя" }).expect(403);
    const { project } = await makeProject(t, a.token, "Общий", ["x"]);
    await M.patch(`/projects/${project.id}`, { title: "Нельзя" }).expect(403);
    await M.del(`/projects/${project.id}`).expect(403);
    await M.get(`/projects/${project.id}`).expect(200);

    await A.patch(`/roles/${role.id}`, { permissions: ["projects.create", "projects.edit", "cards.delete"] }).expect(200);
    await M.post("/projects", { title: "Можно" }).expect(201);
    await M.patch(`/projects/${project.id}`, { title: "Можно" }).expect(200);
  });
});

describe("board columns", () => {
  it("adds, renames, sets WIP limits and removes empty columns, keeping at least one", async () => {
    const a = await register(t, "cols");
    const A = api(t, a.token);
    const { board, cards } = await makeProject(t, a.token, "C", ["card"]);
    const added = (await A.post(`/boards/${board.id}/columns`, { title: "Новая" }).expect(201)).body;
    expect(added.position).toBeGreaterThan(board.columns[3].position);
    const patched = (await A.patch(`/columns/${added.id}`, { title: "Переименована", wipLimit: 3 }).expect(200)).body;
    expect(patched).toMatchObject({ title: "Переименована", wipLimit: 3 });

    const withCard = board.columns[0].id;
    expect((await A.del(`/columns/${withCard}`).expect(400)).body.message).toContain("перенесите");
    await A.del(`/columns/${added.id}`).expect(204);
    for (const col of board.columns.slice(1)) await A.del(`/columns/${col.id}`).expect(204);
    // the only column left holds a card; empty it, then it still can't be the last to go
    await A.del(`/cards/${cards[0].id}`).expect(200);
    expect((await A.del(`/columns/${withCard}`).expect(400)).body.message).toContain("хотя бы одна");
    await A.get("/projects/missing/board").expect(404);
  });
});

describe("cards", () => {
  it("creates with defaults, numbers per workspace, updates fields, assignees and activity", async () => {
    const a = await register(t, "cards");
    const A = api(t, a.token);
    const { project, columns } = await makeProject(t, a.token, "K");
    const c1 = (await A.post("/cards", { columnId: columns[0].id, title: "Первая", priority: "HIGH", assigneeIds: [a.userId] }).expect(201)).body;
    const c2 = (await A.post("/cards", { columnId: columns[0].id, title: "Вторая" }).expect(201)).body;
    expect([c1.number, c2.number]).toEqual([1, 2]);
    expect(c1).toMatchObject({ priority: "HIGH" });
    expect(c2.position).toBeGreaterThan(c1.position);

    const upd = (await A.patch(`/cards/${c1.id}`, { title: "Переименована", description: "Описание", estimateHours: 5, dueDate: "2026-10-09", assigneeIds: [] }).expect(200)).body;
    expect(upd).toMatchObject({ title: "Переименована", estimateHours: 5, assignees: [] });
    await A.patch(`/cards/${c1.id}`, { assigneeIds: ["nope"] }).expect(400);
    await A.post("/cards", { columnId: "missing", title: "x" }).expect(404);
    await A.post("/cards", { columnId: columns[0].id, title: "x", assigneeIds: ["nope"] }).expect(400);
    await A.patch("/cards/missing", { title: "x" }).expect(404);

    const detail = (await A.get(`/cards/${c1.id}`).expect(200)).body;
    expect(detail.activity.map((x: { action: string }) => x.action)).toEqual(expect.arrayContaining(["created", "updated"]));
    expect(detail.column.id).toBe(columns[0].id);
    await A.get("/cards/missing").expect(404);
    expect(project.id).toBeTruthy();
  });

  it("moves between columns of its own board only, with explicit or appended position", async () => {
    const a = await register(t, "move");
    const A = api(t, a.token);
    const one = await makeProject(t, a.token, "Одна", ["a", "b"]);
    const two = await makeProject(t, a.token, "Другая", []);
    const [card, other] = one.cards;
    const moved = (await A.post(`/cards/${card.id}/move`, { columnId: one.columns[1].id }).expect(201)).body;
    expect(moved.columnId).toBe(one.columns[1].id);
    expect(moved.position).toBe(1);
    const second = (await A.post(`/cards/${other.id}/move`, { columnId: one.columns[1].id, position: 0.5 }).expect(201)).body;
    expect(second.position).toBe(0.5);
    await A.post(`/cards/${card.id}/move`, { columnId: two.columns[0].id }).expect(400);
    await A.post("/cards/missing/move", { columnId: one.columns[0].id }).expect(404);
    const acts = (await A.get(`/cards/${card.id}`)).body.activity;
    expect(acts.some((x: { action: string; payload: { to: string } }) => x.action === "moved" && x.payload.to === "В работе")).toBe(true);
  });

  it("searches by text and by key, scoped to the workspace", async () => {
    const a = await register(t, "search");
    const b = await register(t, "searchB");
    const A = api(t, a.token);
    await makeProject(t, a.token, "S", ["Уникальнослово первая", "Другая"]);
    await makeProject(t, b.token, "S", ["Уникальнослово чужая"]);
    expect((await A.get("/cards/search?q=уникальнослово").expect(200)).body).toHaveLength(1);
    expect((await A.get("/cards/search?q=TSK-2").expect(200)).body.map((c: { title: string }) => c.title)).toEqual(["Другая"]);
    expect((await A.get("/cards/search?q=2")).body).toHaveLength(1);
    expect((await A.get("/cards/search?q=%20")).body).toEqual([]);
  });

  it("deletes a card and (with cards.delete) refuses members without the right", async () => {
    const a = await register(t, "del");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "D", ["x", "y"]);
    const role = (await A.post("/roles", { name: "Читатель", permissions: [] })).body;
    const inv = await A.post("/invitations", { email: `${unique("m")}@iso.test`, roleId: role.id });
    const member = (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken;
    await api(t, member).del(`/cards/${cards[0].id}`).expect(403);
    await A.del(`/cards/${cards[0].id}`).expect(200);
    await A.get(`/cards/${cards[0].id}`).expect(404);
  });
});

describe("bulk actions", () => {
  it("moves, assigns, unassigns, sets priority and due date, and deletes many cards", async () => {
    const a = await register(t, "bulk");
    const A = api(t, a.token);
    const { board, columns, cards } = await makeProject(t, a.token, "B", ["a", "b", "c"]);
    const ids = cards.map((c) => c.id);
    expect((await A.post("/cards/bulk", { ids, action: "move", columnId: columns[2].id }).expect(201)).body.count).toBe(3);
    const after = (await A.get(`/projects/${board.projectId}/board`)).body;
    expect(after.columns[2].cards.map((c: { title: string }) => c.title)).toEqual(["a", "b", "c"]);

    await A.post("/cards/bulk", { ids, action: "assign", userIds: [a.userId] }).expect(201);
    expect((await A.get(`/cards/${ids[0]}`)).body.assignees).toHaveLength(1);
    await A.post("/cards/bulk", { ids, action: "unassign", userIds: [a.userId] }).expect(201);
    expect((await A.get(`/cards/${ids[0]}`)).body.assignees).toHaveLength(0);

    await A.post("/cards/bulk", { ids, action: "priority", priority: "LOW" }).expect(201);
    expect((await A.get(`/cards/${ids[1]}`)).body.priority).toBe("LOW");
    await A.post("/cards/bulk", { ids, action: "due", dueDate: "2026-11-01" }).expect(201);
    expect((await A.get(`/cards/${ids[1]}`)).body.dueDate).toContain("2026-11-01");
    await A.post("/cards/bulk", { ids, action: "due", dueDate: null }).expect(201);
    expect((await A.get(`/cards/${ids[1]}`)).body.dueDate).toBeNull();

    await A.post("/cards/bulk", { ids: ["missing"], action: "priority", priority: "LOW" }).expect(404);
    await A.post("/cards/bulk", { ids, action: "teleport" }).expect(400);
    await A.post("/cards/bulk", { ids, action: "delete" }).expect(201);
    await A.get(`/cards/${ids[0]}`).expect(404);
  });

  it("keeps cards on their own board", async () => {
    const a = await register(t, "bulk2");
    const A = api(t, a.token);
    const one = await makeProject(t, a.token, "1", ["a"]);
    const two = await makeProject(t, a.token, "2", []);
    await A.post("/cards/bulk", { ids: [one.cards[0].id], action: "move", columnId: two.columns[0].id }).expect(400);
  });
});

describe("checklist, comments and time", () => {
  it("manages checklist items", async () => {
    const a = await register(t, "check");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "CL", ["x"]);
    const i1 = (await A.post(`/cards/${cards[0].id}/checklist`, { text: "один" }).expect(201)).body;
    const i2 = (await A.post(`/cards/${cards[0].id}/checklist`, { text: "два" }).expect(201)).body;
    expect(i2.position).toBeGreaterThan(i1.position);
    expect((await A.patch(`/checklist/${i1.id}`, { done: true, text: "один!" }).expect(200)).body).toMatchObject({ done: true, text: "один!" });
    await A.post(`/cards/${cards[0].id}/checklist`, { text: "" }).expect(400);
    await A.del(`/checklist/${i2.id}`).expect(200);
    expect((await A.get(`/cards/${cards[0].id}`)).body.checklist).toHaveLength(1);
    await A.patch("/checklist/missing", { done: true }).expect(404);
  });

  it("posts comments with mentions, deletes own ones, and lets admins delete anyone's", async () => {
    const a = await register(t, "comm");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "CM", ["x"]);
    const inv = await A.post("/invitations", { email: `${unique("m")}@iso.test` });
    const mAuth = (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken;
    const M = api(t, mAuth);
    const member = await t.db.user.findFirstOrThrow({ where: { workspaceId: a.workspaceId, role: "MEMBER" } });

    const c1 = (await M.post(`/cards/${cards[0].id}/comments`, { text: "привет", mentionIds: [a.userId] }).expect(201)).body;
    await A.post(`/cards/${cards[0].id}/comments`, { text: "" }).expect(400);
    const notifications = (await A.get("/notifications").expect(200)).body;
    expect(notifications.items.some((n: { type: string }) => n.type === "MENTIONED")).toBe(true);

    const c2 = (await A.post(`/cards/${cards[0].id}/comments`, { text: "ответ админа" }).expect(201)).body;
    await M.del(`/comments/${c2.id}`).expect(403); // not the author, not an admin
    await A.del(`/comments/${c1.id}`).expect(200); // admin may delete anyone's
    await A.del(`/comments/${c2.id}`).expect(200);
    await A.del("/comments/missing").expect(404);
    expect(member.id).toBeTruthy();
  });

  it("logs time, removes only own entries (admins any), and feeds the report", async () => {
    const a = await register(t, "time");
    const A = api(t, a.token);
    const { cards, project } = await makeProject(t, a.token, "T", ["x"]);
    const entry = (await A.post(`/cards/${cards[0].id}/time`, { minutes: 45, date: "2026-10-05", note: "работа" }).expect(201)).body;
    await A.post(`/cards/${cards[0].id}/time`, { minutes: 0, date: "2026-10-05" }).expect(400);
    const inv = await A.post("/invitations", { email: `${unique("m")}@iso.test` });
    const M = api(t, (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken);
    await M.del(`/time/${entry.id}`).expect(403);
    await M.post(`/cards/${cards[0].id}/time`, { minutes: 15, date: "2026-10-06" }).expect(201);

    // the report: admins see everyone, a member only their own entries
    const all = (await A.get("/reports/time?from=2026-10-01&to=2026-10-31").expect(200)).body;
    expect(all).toHaveLength(2);
    expect((await A.get(`/reports/time?from=2026-10-01&to=2026-10-31&projectId=${project.id}`)).body).toHaveLength(2);
    expect((await M.get("/reports/time?from=2026-10-01&to=2026-10-31")).body).toHaveLength(1);
    expect((await A.get(`/reports/time?from=2026-10-01&to=2026-10-31&userId=${a.userId}`)).body).toHaveLength(1);
    await A.get("/reports/time?from=2026-10-31&to=2026-10-01").expect(400);
    await A.get("/reports/time?from=bad&to=2026-10-01").expect(400);

    await A.del(`/time/${entry.id}`).expect(200);
    await A.del("/time/missing").expect(404);
  });

  it("marks a card read, clears its notifications and unread counters", async () => {
    const a = await register(t, "read");
    const A = api(t, a.token);
    const { cards, project } = await makeProject(t, a.token, "R", ["x"]);
    const inv = await A.post("/invitations", { email: `${unique("m")}@iso.test` });
    const M = api(t, (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken);
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [a.userId] });
    await M.post(`/cards/${cards[0].id}/comments`, { text: "вопрос" }).expect(201);

    const before = (await A.get(`/projects/${project.id}/board`)).body.columns[0].cards[0];
    expect(before.unreadComments).toBe(1);
    expect((await A.get("/notifications")).body.unread).toBeGreaterThan(0);
    await A.post(`/cards/${cards[0].id}/read`).expect(204);
    expect((await A.get(`/projects/${project.id}/board`)).body.columns[0].cards[0].unreadComments).toBe(0);
    expect((await A.get("/notifications")).body.unread).toBe(0);
  });
});

describe("team board", () => {
  it("groups cards of active projects by stage title and filters by assignee", async () => {
    const a = await register(t, "team");
    const A = api(t, a.token);
    const one = await makeProject(t, a.token, "1", ["a"]);
    await makeProject(t, a.token, "2", ["b"]);
    await A.patch(`/cards/${one.cards[0].id}`, { assigneeIds: [a.userId] });
    const team = (await A.get("/team-board").expect(200)).body;
    expect(team.map((c: { title: string }) => c.title)).toEqual(["Бэклог", "В работе", "На проверке", "Готово"]);
    expect(team[0].cards).toHaveLength(2);
    expect((await A.get(`/team-board?assigneeId=${a.userId}`)).body[0].cards).toHaveLength(1);
    const arch = (await A.post("/projects", { title: "Старый" })).body;
    await A.patch(`/projects/${arch.id}`, { status: "DONE" });
    expect((await A.get("/team-board")).body[0].cards).toHaveLength(2);
  });
});

describe("plan limits on creation", () => {
  it("blocks the 4th project and the 4th recurring rule on Free, not on Pro", async () => {
    const a = await register(t, "lim");
    const A = api(t, a.token);
    await setPlan(t, a.workspaceId, "FREE");
    for (let i = 0; i < 3; i++) await A.post("/projects", { title: `P${i}` }).expect(201);
    const blocked = await A.post("/projects", { title: "P3" }).expect(402);
    expect(blocked.body.message).toContain("не больше 3 проектов");
    await setPlan(t, a.workspaceId, "PRO");
    await A.post("/projects", { title: "P3" }).expect(201);
  });
});
