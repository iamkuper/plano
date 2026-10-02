import { RecurringService } from "../src/recurring/recurring.service";
import { MailService } from "../src/mail/mail.service";
import { atRunTime, firstRun, nextRun } from "../src/recurring/schedule";
import { api, createApp, makeProject, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

const member = async (admin: { token: string }) => {
  const inv = await api(t, admin.token).post("/invitations", { email: `${unique("m")}@iso.test` }).expect(201);
  const res = await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "Сотрудник", password: "password-123" }).expect(201);
  const me = (await api(t, res.body.accessToken).get("/users/me")).body;
  return { token: res.body.accessToken as string, id: me.id as string };
};

describe("notifications", () => {
  it("tells people they were assigned (not themselves), and who commented on their cards", async () => {
    const a = await register(t, "notif");
    const A = api(t, a.token);
    const m = await member(a);
    const M = api(t, m.token);
    const { cards } = await makeProject(t, a.token, "N", ["Задача"]);

    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [m.id, a.userId] }).expect(200);
    const mine = (await M.get("/notifications").expect(200)).body;
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ type: "ASSIGNED", readAt: null, actor: { name: expect.stringContaining("Админ") }, card: { id: cards[0].id } });
    expect((await A.get("/notifications")).body.items).toHaveLength(0); // no self-notification

    await M.post(`/cards/${cards[0].id}/comments`, { text: "сделано" }).expect(201);
    const adminItems = (await A.get("/notifications")).body.items;
    expect(adminItems[0]).toMatchObject({ type: "COMMENTED", text: "сделано" });
  });

  it("cuts long excerpts, ignores mentions of people from other workspaces, marks read", async () => {
    const a = await register(t, "notif2");
    const other = await register(t, "notif2b");
    const A = api(t, a.token);
    const m = await member(a);
    const { cards } = await makeProject(t, a.token, "N", ["x"]);
    await api(t, m.token).post(`/cards/${cards[0].id}/comments`, { text: "я".repeat(300), mentionIds: [a.userId, other.userId] }).expect(201);
    const list = (await A.get("/notifications")).body;
    expect(list.items[0].type).toBe("MENTIONED");
    expect(list.items[0].text.length).toBeLessThanOrEqual(140);
    expect((await api(t, other.token).get("/notifications")).body.items).toHaveLength(0);

    expect(list.unread).toBe(1);
    await A.post("/notifications/read", { ids: [list.items[0].id] }).expect(204);
    expect((await A.get("/notifications")).body.unread).toBe(0);
    await api(t, m.token).post(`/cards/${cards[0].id}/comments`, { text: "ещё" });
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [a.userId] });
    await api(t, m.token).post(`/cards/${cards[0].id}/comments`, { text: "и ещё" });
    expect((await A.get("/notifications")).body.unread).toBeGreaterThan(0);
    await A.post("/notifications/read", {}).expect(204); // no ids: everything
    expect((await A.get("/notifications")).body.unread).toBe(0);
  });

  it("sends mail copies only to people who didn't opt out, and survives a mail outage", async () => {
    const mail = t.app.get(MailService);
    const send = jest.spyOn(mail, "send").mockResolvedValue(true);
    Object.defineProperty(mail, "enabled", { get: () => true, configurable: true });
    const a = await register(t, "mail");
    const A = api(t, a.token);
    const m = await member(a);
    const { cards } = await makeProject(t, a.token, "M", ["x"]);

    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [m.id] }).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(send).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("Вас назначили на"), expect.stringContaining("Открыть карточку"));

    send.mockClear();
    await api(t, m.token).patch("/users/me", { emailNotifications: false }).expect(200);
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [] });
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [m.id] });
    await new Promise((r) => setTimeout(r, 300));
    expect(send).not.toHaveBeenCalled();

    send.mockRejectedValue(new Error("smtp down"));
    await api(t, m.token).patch("/users/me", { emailNotifications: true });
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [] });
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [m.id] }).expect(200); // the action still succeeds
    send.mockRestore();
    delete (mail as unknown as Record<string, unknown>).enabled;
  });
});

describe("recurring tasks", () => {
  const rule = { title: "Еженедельный отчёт", frequency: "WEEKLY", interval: 1, weekday: 1, startDate: "2026-10-05", active: true, checklist: ["собрать", "отправить"], dueInDays: 2, priority: "HIGH" };

  it("creates, edits, toggles, runs on demand and deletes a rule", async () => {
    const a = await register(t, "rec");
    const A = api(t, a.token);
    const { project, board } = await makeProject(t, a.token, "R");
    const created = (await A.post(`/projects/${project.id}/recurring`, { ...rule, assigneeIds: [a.userId] }).expect(201)).body;
    expect(created.nextRunAt).toBe("2026-10-05T06:00:00.000Z"); // a Monday
    expect((await A.get(`/projects/${project.id}/recurring`).expect(200)).body).toHaveLength(1);

    const edited = (await A.put(`/recurring/${created.id}`, { ...rule, title: "Новый заголовок", frequency: "MONTHLY", monthDay: 15, interval: 1, assigneeIds: [a.userId] }).expect(200)).body;
    expect(edited.title).toBe("Новый заголовок");
    expect((await A.patch(`/recurring/${created.id}`, { active: false }).expect(200)).body.active).toBe(false);
    await A.patch(`/recurring/${created.id}`, { active: true });

    const card = (await A.post(`/recurring/${created.id}/run`).expect(201)).body;
    expect(card).toMatchObject({ title: "Новый заголовок", recurringRuleId: created.id });
    const full = (await A.get(`/cards/${card.id}`)).body;
    expect(full.checklist.map((c: { text: string }) => c.text)).toEqual(["собрать", "отправить"]);
    expect(full.assignees).toHaveLength(1);
    expect(full.dueDate).toBeTruthy();
    expect(full.column.id).toBe(board.columns[0].id);

    await A.post(`/projects/${project.id}/recurring`, { ...rule, title: "" }).expect(400);
    await A.post("/recurring/missing/run").expect(404);
    await A.del(`/recurring/${created.id}`).expect(204);
    await A.post(`/recurring/${created.id}/run`).expect(404);
  });

  it("the scheduler creates a card for due rules and moves them forward once", async () => {
    const a = await register(t, "rec2");
    const A = api(t, a.token);
    const { project } = await makeProject(t, a.token, "R");
    const created = (await A.post(`/projects/${project.id}/recurring`, { ...rule, frequency: "DAILY", startDate: "2020-01-01" }).expect(201)).body;
    const svc = t.app.get(RecurringService);
    await svc.runDue();
    await svc.runDue(); // nothing more is due
    const cards = await t.db.card.findMany({ where: { recurringRuleId: created.id } });
    expect(cards).toHaveLength(1);
    const after = await t.db.recurringRule.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(after.lastRunAt).not.toBeNull();
  });

  it("skips inactive rules, archived projects and read-only workspaces", async () => {
    const a = await register(t, "rec3");
    const A = api(t, a.token);
    const { project } = await makeProject(t, a.token, "R");
    const inactive = (await A.post(`/projects/${project.id}/recurring`, { ...rule, frequency: "DAILY", startDate: "2020-01-01", active: false }).expect(201)).body;
    await A.patch(`/recurring/${inactive.id}`, { active: false });
    const live = (await A.post(`/projects/${project.id}/recurring`, { ...rule, title: "Живое", frequency: "DAILY", startDate: "2020-01-01" }).expect(201)).body;
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { status: "LOCKED" } });
    await t.app.get(RecurringService).runDue();
    expect(await t.db.card.count({ where: { recurringRuleId: { in: [inactive.id, live.id] } } })).toBe(0);
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { status: "ACTIVE", trialEndsAt: null, planId: "PRO", currentPeriodEnd: new Date(Date.now() + 86_400_000) } });
    await t.app.get(RecurringService).runDue();
    expect(await t.db.card.count({ where: { recurringRuleId: inactive.id } })).toBe(0);
    expect(await t.db.card.count({ where: { recurringRuleId: live.id } })).toBe(1);
  });

  it("limits rules on the Free plan", async () => {
    const a = await register(t, "rec4");
    const A = api(t, a.token);
    await setPlan(t, a.workspaceId, "FREE");
    const { project } = await makeProject(t, a.token, "R");
    for (let i = 0; i < 3; i++) await A.post(`/projects/${project.id}/recurring`, rule).expect(201);
    expect((await A.post(`/projects/${project.id}/recurring`, rule).expect(402)).body.message).toContain("повторяющихся задач");
  });
});

describe("schedule maths", () => {
  const base = { interval: 1, weekday: null as number | null, monthDay: null as number | null };
  it("runs at 06:00 UTC", () => {
    expect(atRunTime("2026-10-05").toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(atRunTime(new Date("2026-10-05T23:00:00Z")).toISOString()).toBe("2026-10-05T06:00:00.000Z");
  });
  it("steps daily and weekly rules by their interval", () => {
    const d = new Date("2026-10-05T06:00:00Z");
    expect(nextRun({ ...base, frequency: "DAILY", interval: 3, monthDay: null }, d).toISOString()).toBe("2026-10-08T06:00:00.000Z");
    expect(nextRun({ ...base, frequency: "WEEKLY", interval: 2, monthDay: null }, d).toISOString()).toBe("2026-10-19T06:00:00.000Z");
    expect(nextRun({ ...base, frequency: "DAILY", interval: 0, monthDay: null }, d).toISOString()).toBe("2026-10-06T06:00:00.000Z");
  });
  it("keeps the day of month, clamping to short months", () => {
    expect(nextRun({ ...base, frequency: "MONTHLY", monthDay: 31 }, new Date("2026-01-31T06:00:00Z")).toISOString()).toBe("2026-02-28T06:00:00.000Z");
    expect(nextRun({ ...base, frequency: "MONTHLY", monthDay: 15, interval: 2 }, new Date("2026-10-15T06:00:00Z")).toISOString()).toBe("2026-12-15T06:00:00.000Z");
    expect(nextRun({ ...base, frequency: "MONTHLY" }, new Date("2026-03-10T06:00:00Z")).toISOString()).toBe("2026-04-10T06:00:00.000Z");
  });
  it("finds the first matching weekday / day of month on or after the start", () => {
    expect(firstRun({ frequency: "WEEKLY", weekday: 3, monthDay: null }, "2026-10-05").toISOString()).toBe("2026-10-07T06:00:00.000Z"); // Mon -> Wed
    expect(firstRun({ frequency: "WEEKLY", weekday: 1, monthDay: null }, "2026-10-05").toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(firstRun({ frequency: "MONTHLY", weekday: null, monthDay: 3 }, "2026-10-05").toISOString()).toBe("2026-11-03T06:00:00.000Z");
    expect(firstRun({ frequency: "MONTHLY", weekday: null, monthDay: 31 }, "2026-02-01").toISOString()).toBe("2026-02-28T06:00:00.000Z");
    expect(firstRun({ frequency: "DAILY", weekday: null, monthDay: null }, "2026-10-05").toISOString()).toBe("2026-10-05T06:00:00.000Z");
  });
});
