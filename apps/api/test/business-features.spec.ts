import { DueRemindersService } from "../src/notifications/due-reminders.service";
import { NotificationMailer } from "../src/notifications/notification-mailer";
import { MailService } from "../src/mail/mail.service";
import { csvCell, csvRow } from "../src/export/export.controller";
import { caseVariants } from "../src/prisma/case-variants";
import { api, createApp, makeProject, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

const member = async (admin: { token: string }) => {
  const inv = await api(t, admin.token).post("/invitations", { email: `${unique("m")}@iso.test` }).expect(201);
  return (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken as string;
};

describe("CSV export (Business)", () => {
  it("is locked below Business and for foreign projects", async () => {
    const a = await register(t, "csv0");
    const { project } = await makeProject(t, a.token, "E");
    await api(t, a.token).get(`/projects/${project.id}/export.csv`).expect(402);
    const b = await register(t, "csv0b");
    await setPlan(t, b.workspaceId, "BUSINESS");
    await api(t, b.token).get(`/projects/${project.id}/export.csv`).expect(404);
    await api(t, b.token).get("/projects/missing/export.csv").expect(404);
  });

  it("exports every column, quoting multi-line text and neutralising formulas", async () => {
    const a = await register(t, "csv1");
    await setPlan(t, a.workspaceId, "BUSINESS");
    const A = api(t, a.token);
    const { project, cards, columns } = await makeProject(t, a.token, "Экспорт", []);
    const field = (await A.post("/fields", { name: "Бюджет", type: "NUMBER" })).body;
    const check = (await A.post("/fields", { name: "Согласовано", type: "CHECKBOX" })).body;
    const label = (await A.post("/labels", { name: "Срочно", color: "red" })).body;
    const card = (await A.post("/cards", { columnId: columns[1].id, title: "=cmd|calc", description: "Строка 1\nСтрока 2; с запятой", type: "BUG", priority: "HIGH" })).body;
    await A.post("/cards", { columnId: columns[0].id, title: "Пустая" });
    await A.patch(`/cards/${card.id}`, { startDate: "2026-10-05", dueDate: "2026-10-09", labelIds: [label.id], estimateHours: 4, assigneeIds: [a.userId] });
    await A.put(`/cards/${card.id}/fields/${field.id}`, { value: 1500 });
    await A.put(`/cards/${card.id}/fields/${check.id}`, { value: true });
    await A.post(`/cards/${card.id}/time`, { minutes: 90, date: "2026-10-06" });
    await A.post(`/cards/${card.id}/checklist`, { text: "один" });
    expect(cards).toHaveLength(0);

    const res = await A.get(`/projects/${project.id}/export.csv`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    const raw = res.body as Buffer;
    expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    const text = raw.toString("utf8").slice(1);
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Ключ;Название;Описание;Колонка;Тип;Приоритет;Исполнители;Метки;Начало;Срок;Оценка, ч;Списано, мин;Подзадачи;Создана;Бюджет;Согласовано");
    // ordered by column: the empty card (first column) comes before the bug
    expect(lines[1]).toMatch(/^TSK-2;Пустая;;Бэклог;Другое;Средний;/);
    expect(text).toContain("'=cmd|calc");
    expect(text).toContain('"Строка 1\nСтрока 2; с запятой"');
    expect(text).toMatch(/;Админ csv1;Срочно;2026-10-05;2026-10-09;4;90;0\/1;\d{4}-\d{2}-\d{2};1500;Да\r\n$/);
    expect((await t.db.auditLog.findFirst({ where: { workspaceId: a.workspaceId, action: "export.project" } }))?.summary).toContain("Экспорт проекта");
  });

  it("escapes cells", () => {
    expect(csvCell("Привет")).toBe("Привет");
    expect(csvCell('a;"b"\nc')).toBe('"a;""b""\nc"');
    for (const bad of ["=SUM(1)", "+1", "-5", "@x", "\tx"]) expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    expect([csvCell(0), csvCell(null), csvCell(undefined), csvCell(false)]).toEqual(["0", "", "", "false"]);
    expect(csvRow(["a", 1, null, "b;c"])).toBe('a;1;;"b;c"');
  });
});

describe("audit log (Business)", () => {
  it("is locked below Business, keeps recording, and needs audit.view", async () => {
    const a = await register(t, "aud0");
    await api(t, a.token).get("/audit").expect(402);
    await makeProject(t, a.token, "Записывается");
    await setPlan(t, a.workspaceId, "BUSINESS");
    const log = (await api(t, a.token).get("/audit").expect(200)).body;
    expect(log.items.map((i: { action: string }) => i.action)).toContain("project.create"); // history from before the upgrade
    await api(t, await member(a)).get("/audit").expect(403);
  });

  it("records who did what across the app", async () => {
    const a = await register(t, "aud1");
    await setPlan(t, a.workspaceId, "BUSINESS");
    const A = api(t, a.token);
    const { project, cards } = await makeProject(t, a.token, "Журнал", ["x", "y"]);
    await A.patch(`/projects/${project.id}`, { title: "Журнал 2", status: "ON_HOLD" });
    const role = (await A.post("/roles", { name: "Роль", permissions: [] })).body;
    await A.patch(`/roles/${role.id}`, { permissions: ["projects.edit"] });
    const user = (await A.post("/users", { email: `${unique("u")}@iso.test`, name: "Новый", password: "password-123" })).body;
    await A.patch(`/users/${user.id}`, { isActive: false });
    await A.post(`/users/${user.id}/password`, { password: "another-pass-1" });
    await A.post("/invitations", { email: `${unique("i")}@iso.test` });
    await A.patch("/settings", { cardPrefix: "ZZ" });
    const tpl = (await A.post("/templates", { name: "Ш", columns: ["A"], cards: [] })).body;
    await A.del(`/templates/${tpl.id}`);
    const label = (await A.post("/labels", { name: "Л", color: "red" })).body;
    await A.del(`/labels/${label.id}`);
    const field = (await A.post("/fields", { name: "Поле", type: "TEXT" })).body;
    await A.del(`/fields/${field.id}`);
    await A.del(`/cards/${cards[0].id}`);
    await A.post("/cards/bulk", { ids: [cards[1].id], action: "delete" });
    const spare = (await A.post("/roles", { name: "Запасная", permissions: [] })).body; // the first role is the default and can't go
    await A.del(`/roles/${spare.id}`);
    await A.del(`/projects/${project.id}`);

    const items = (await A.get("/audit").expect(200)).body.items as { action: string; summary: string; user: { name: string } | null }[];
    const actions = items.map((i) => i.action);
    for (const want of ["project.create", "project.update", "project.delete", "role.create", "role.update", "role.delete", "user.create", "user.update", "user.password", "invitation.create", "settings.update", "template.create", "template.delete", "label.delete", "field.create", "field.delete", "card.delete"]) {
      expect(actions).toContain(want);
    }
    expect(items.every((i) => i.user?.name === "Админ aud1")).toBe(true);
    expect(items.find((i) => i.action === "project.update")!.summary).toBe("Изменён проект «Журнал 2»: title, status");
    expect(items.find((i) => i.action === "settings.update")!.summary).toBe("Изменены настройки: cardPrefix");
    expect(items.find((i) => i.action === "user.update")!.summary).toContain("отключён");
    expect(items.find((i) => i.action === "project.delete")!.summary).toBe("Удалён проект «Журнал 2»");
  });

  it("filters by group, pages with a cursor and stays within the workspace", async () => {
    const a = await register(t, "aud2");
    const b = await register(t, "aud2b");
    await setPlan(t, a.workspaceId, "BUSINESS");
    await setPlan(t, b.workspaceId, "BUSINESS");
    await api(t, a.token).post("/roles", { name: "Р", permissions: [] });
    expect((await api(t, a.token).get("/audit?group=role")).body.items.every((i: { action: string }) => i.action.startsWith("role."))).toBe(true);
    await t.db.auditLog.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ workspaceId: a.workspaceId, action: "test.bulk", summary: `n${i}` })) });
    const page1 = (await api(t, a.token).get("/audit")).body;
    expect(page1.items).toHaveLength(50);
    expect(page1.next).toBeTruthy();
    const page2 = (await api(t, a.token).get(`/audit?before=${page1.next}`)).body;
    expect(page2.items.length).toBeGreaterThan(0);
    const ids = new Set(page1.items.map((i: { id: string }) => i.id));
    expect(page2.items.some((i: { id: string }) => ids.has(i.id))).toBe(false);
    expect((await api(t, b.token).get("/audit")).body.items).toEqual([]);
    await setPlan(t, a.workspaceId, "FREE");
    await api(t, a.token).get("/audit").expect(402);
  });
});

describe("due-date reminders", () => {
  const midnight = (offset: number) => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset)).toISOString();
  };

  it("reminds assignees of open cards due today, tomorrow or yesterday, once per due date", async () => {
    const a = await register(t, "rem");
    const A = api(t, a.token);
    const { cards, columns } = await makeProject(t, a.token, "Сроки", ["сегодня", "завтра", "вчера", "далеко", "готово", "давно", "без исполнителя"]);
    const set = (i: number, offset: number, assign = true) => A.patch(`/cards/${cards[i].id}`, { dueDate: midnight(offset), ...(assign ? { assigneeIds: [a.userId] } : {}) });
    await set(0, 0); await set(1, 1); await set(2, -1); await set(3, 5); await set(4, 0); await set(5, -10); await set(6, 0, false);
    await A.post(`/cards/${cards[4].id}/move`, { columnId: columns[3].id });

    const svc = t.app.get(DueRemindersService);
    expect(await svc.run()).toBe(3);
    const items = (await A.get("/notifications")).body.items as { type: string; actor: unknown; card: { id: string } }[];
    const kinds = (i: number) => items.filter((n) => n.card.id === cards[i].id).map((n) => n.type);
    expect([kinds(0), kinds(1), kinds(2)]).toEqual([["DUE_SOON"], ["DUE_SOON"], ["OVERDUE"]]);
    for (const i of [3, 4, 5, 6]) expect(kinds(i)).toEqual([]);
    expect(items.every((n) => n.actor === null)).toBe(true);

    expect(await svc.run()).toBe(0); // no duplicates
    await A.patch(`/cards/${cards[0].id}`, { dueDate: midnight(1) });
    expect(await svc.run()).toBe(1); // a new date earns a new reminder
  });

  it("skips archived projects and deactivated people, and survives overlapping runs", async () => {
    const a = await register(t, "rem2");
    const A = api(t, a.token);
    const { project, cards } = await makeProject(t, a.token, "С", ["x"]);
    await A.patch(`/cards/${cards[0].id}`, { dueDate: midnight(0), assigneeIds: [a.userId] });
    await A.patch(`/projects/${project.id}`, { status: "ARCHIVED" });
    const svc = t.app.get(DueRemindersService);
    expect(await svc.run()).toBe(0);
    await A.patch(`/projects/${project.id}`, { status: "ACTIVE" });
    const [first, second] = await Promise.all([svc.run(), svc.run()]);
    expect(first + second).toBe(1);
  });

  it("composes mail for each kind of notification", async () => {
    const mail = t.app.get(MailService);
    Object.defineProperty(mail, "enabled", { get: () => true, configurable: true });
    const send = jest.spyOn(mail, "send").mockResolvedValue(true);
    const a = await register(t, "rem3");
    const { cards } = await makeProject(t, a.token, "М", ["Задача"]);
    await api(t, a.token).patch(`/cards/${cards[0].id}`, { dueDate: midnight(0) });
    const mailer = t.app.get(NotificationMailer);
    for (const type of ["ASSIGNED", "MENTIONED", "COMMENTED", "DUE_SOON", "OVERDUE"] as const) {
      await mailer.send([{ userId: a.userId, actorId: a.userId, cardId: cards[0].id, type, text: "текст" }]);
    }
    const subjects = send.mock.calls.map((c) => c[1]);
    expect(subjects).toEqual(["Вас назначили на TSK-1", "Вас упомянули в TSK-1", "Новое сообщение в TSK-1", "Срок сегодня: TSK-1", "Срок истёк: TSK-1"]);
    expect(send.mock.calls[0][2]).toContain("/projects/");
    await mailer.send([]); // nothing to do
    send.mockRestore();
    delete (mail as unknown as Record<string, unknown>).enabled;
  });
});

describe("helpers", () => {
  it("caseVariants covers typed, lower, upper and capitalised spellings", () => {
    expect(caseVariants("  бриф ")).toEqual(["бриф", "БРИФ", "Бриф"]);
    expect(caseVariants("")).toEqual([]);
    expect(caseVariants("TSK")).toEqual(["TSK", "tsk", "Tsk"]);
  });

  it("the mail service only logs when SMTP isn't configured, and never throws", async () => {
    const mail = new MailService();
    expect(mail.enabled).toBe(false);
    expect(await mail.send("a@b.c", "Тема", "Текст")).toBe(false);
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1"; // nothing listens here
    const broken = new MailService();
    expect(broken.enabled).toBe(true);
    expect(await broken.send("a@b.c", "Тема", "Текст")).toBe(false);
    process.env.SMTP_HOST = "";
  });
});
