import { createHash } from "crypto";
import { BadGatewayException, UnauthorizedException } from "@nestjs/common";
import request from "supertest";
import { BillingService } from "../src/billing/billing.service";
import { MailService } from "../src/mail/mail.service";
import { createProvider } from "../src/billing/billing.module";
import { MOCK_PASSWORD, MockProvider, mockNotification } from "../src/billing/mock.provider";
import { allowedWhileLocked, isLocked } from "../src/billing/subscription-state";
import { TbankProvider, tbankToken } from "../src/billing/tbank.provider";
import { api, createApp, makeProject, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
let billing: BillingService;
beforeAll(async () => {
  t = await createApp();
  billing = t.app.get(BillingService);
});
afterAll(() => t.close());

const DAY = 86_400_000;
const orderOf = (url: string) => new URL(url).searchParams.get("order")!;
const sub = (workspaceId: string) => t.db.subscription.findUniqueOrThrow({ where: { workspaceId } });
const useProvider = (p: unknown) => ((billing as unknown as { provider: unknown }).provider = p);
const goodCard = () => new MockProvider("http://x", false);
const badCard = () => new MockProvider("http://x", true);

afterEach(() => useProvider(goodCard()));

describe("overview and the trial", () => {
  it("starts on a Pro trial, lists three plans and the payment mode", async () => {
    const a = await register(t, "bill");
    const o = (await api(t, a.token).get("/billing").expect(200)).body;
    expect(o).toMatchObject({ locked: false, testMode: true, plan: { id: "PRO" }, subscription: { status: "TRIALING", planId: "PRO", cardMask: null }, usage: { users: 1, projects: 0 } });
    expect(o.plans.map((p: { id: string }) => p.id)).toEqual(["FREE", "PRO", "BUSINESS"]);
    expect(o.plans[2].features).toEqual(expect.arrayContaining(["gantt", "fields", "audit", "export"]));
    expect(o.plans[2].features).not.toContain("api");
    expect(o.storageLimitMb).toBe(20480);
    await api(t).get("/billing").expect(401);
  });
});

describe("checkout and payment", () => {
  it("prices by active users and interval, and rejects free or unknown plans", async () => {
    const a = await register(t, "price");
    const A = api(t, a.token);
    await A.post("/users", { email: `${unique("u")}@iso.test`, name: "U", password: "password-123" }).expect(201);
    await A.post("/users", { email: `${unique("u")}@iso.test`, name: "U", password: "password-123" }).expect(201);
    const month = (await A.post("/billing/checkout", { planId: "PRO", interval: "MONTH" }).expect(201)).body;
    const year = (await A.post("/billing/checkout", { planId: "BUSINESS", interval: "YEAR" }).expect(201)).body;
    const m = await t.db.payment.findUniqueOrThrow({ where: { orderId: orderOf(month.paymentUrl) } });
    const y = await t.db.payment.findUniqueOrThrow({ where: { orderId: orderOf(year.paymentUrl) } });
    expect([m.amount, m.seats, m.status, m.kind]).toEqual([3 * 49000, 3, "PENDING", "INITIAL"]);
    expect([y.amount, y.interval]).toEqual([3 * 99000 * 10, "YEAR"]);
    await A.post("/billing/checkout", { planId: "FREE", interval: "MONTH" }).expect(400);
    await A.post("/billing/checkout", { planId: "NOPE", interval: "MONTH" }).expect(400);
    await A.post("/billing/checkout", { planId: "PRO", interval: "WEEK" }).expect(400);
  });

  it("a declined payment changes nothing; an approved one activates, once", async () => {
    const a = await register(t, "pay");
    const A = api(t, a.token);
    const first = (await A.post("/billing/checkout", { planId: "PRO", interval: "MONTH" })).body;
    await A.post(`/billing/dev/pay/${orderOf(first.paymentUrl)}`, { success: false }).expect(204);
    expect((await sub(a.workspaceId)).status).toBe("TRIALING");
    expect((await A.get("/billing")).body.payments[0].status).toBe("FAILED");

    const second = (await A.post("/billing/checkout", { planId: "PRO", interval: "MONTH" })).body;
    const order = orderOf(second.paymentUrl);
    await A.post(`/billing/dev/pay/${order}`, { success: true }).expect(204);
    await A.post(`/billing/dev/pay/${order}`, { success: true }).expect(204); // repeated notification
    const s = await sub(a.workspaceId);
    expect(s).toMatchObject({ planId: "PRO", status: "ACTIVE", trialEndsAt: null, cancelAtPeriodEnd: false, cardMask: null });
    expect(s.rebillId).toBeNull(); // one-off card payment, no saved card
    expect(s.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
    expect(await t.db.payment.count({ where: { workspaceId: a.workspaceId, status: "PAID" } })).toBe(1);
    expect((await t.db.auditLog.findFirst({ where: { workspaceId: a.workspaceId, action: "billing.paid" } }))?.summary).toContain("Оплачен тариф PRO");
  });

  it("only people with billing.manage can pay; the page is visible to all", async () => {
    const a = await register(t, "payperm");
    const inv = await api(t, a.token).post("/invitations", { email: `${unique("m")}@iso.test` });
    const m = api(t, (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken);
    await m.post("/billing/checkout", { planId: "PRO", interval: "MONTH" }).expect(403);
    await m.post("/billing/free", {}).expect(403);
    await m.get("/billing").expect(200);
  });

  it("dev payment is unavailable for other workspaces' orders and unknown ones", async () => {
    const a = await register(t, "dev");
    const b = await register(t, "devb");
    const co = (await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH" })).body;
    await api(t, b.token).post(`/billing/dev/pay/${orderOf(co.paymentUrl)}`, { success: true }).expect(404);
    await api(t, a.token).post("/billing/dev/pay/unknown", { success: true }).expect(404);
  });

  it("a failed provider call marks the payment failed and reports the error", async () => {
    const a = await register(t, "initfail");
    useProvider({ test: true, init: async () => { throw new BadGatewayException("bank down"); } });
    await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH" }).expect(502);
    expect((await t.db.payment.findFirstOrThrow({ where: { workspaceId: a.workspaceId } })).status).toBe("FAILED");
  });
});

describe("bank notifications (webhook)", () => {
  it("rejects bad tokens and unknown orders, accepts signed ones, checks the amount", async () => {
    const a = await register(t, "hook");
    const co = (await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH" })).body;
    const order = orderOf(co.paymentUrl);
    const payment = await t.db.payment.findUniqueOrThrow({ where: { orderId: order } });
    const server = t.app.getHttpServer();
    await request(server).post("/billing/webhooks/tbank").send({ OrderId: order, Amount: payment.amount, Status: "CONFIRMED", Token: "deadbeef" }).expect(401);
    await request(server).post("/billing/webhooks/tbank").send(mockNotification({ OrderId: "unknown", PaymentId: "1", Amount: 1, Status: "CONFIRMED" })).expect(404);
    const wrong = await request(server).post("/billing/webhooks/tbank").send(mockNotification({ OrderId: order, PaymentId: "1", Amount: payment.amount - 1, Status: "CONFIRMED" }));
    expect(wrong.status).toBe(400);
    expect((await sub(a.workspaceId)).status).toBe("TRIALING");
    const ok = await request(server).post("/billing/webhooks/tbank").send(mockNotification({ OrderId: order, PaymentId: "1", Amount: payment.amount, Status: "CONFIRMED", Success: true }));
    expect([ok.status, ok.text]).toEqual([200, "OK"]);
    expect((await sub(a.workspaceId)).status).toBe("ACTIVE");
    // intermediate statuses are ignored
    const ignored = await request(server).post("/billing/webhooks/tbank").send(mockNotification({ OrderId: order, PaymentId: "1", Amount: payment.amount, Status: "AUTHORIZED" }));
    expect(ignored.status).toBe(200);
  });
});

describe("paid periods and the lock", () => {
  const paid = async (tag: string, planId: "PRO" | "BUSINESS" = "PRO", seats = 1) => {
    const a = await register(t, tag);
    const co = (await api(t, a.token).post("/billing/checkout", { planId, interval: "MONTH", seats })).body;
    await api(t, a.token).post(`/billing/dev/pay/${orderOf(co.paymentUrl)}`, { success: true }).expect(204);
    return a;
  };
  const expire = (workspaceId: string, extra: object = {}) => t.db.subscription.update({ where: { workspaceId }, data: { currentPeriodEnd: new Date(Date.now() - 3600_000), ...extra } });

  it("never charges automatically: the period ends, then after the grace the workspace locks", async () => {
    const a = await paid("noauto", "PRO", 2);
    expect((await sub(a.workspaceId)).rebillId).toBeNull(); // no card is kept
    await expire(a.workspaceId); // ended an hour ago: still within the grace
    await billing.runDue();
    expect((await sub(a.workspaceId)).status).toBe("ACTIVE");
    await expire(a.workspaceId, { currentPeriodEnd: new Date(Date.now() - 4 * DAY) });
    await billing.runDue();
    expect((await sub(a.workspaceId)).status).toBe("LOCKED");
    expect(await t.db.payment.count({ where: { workspaceId: a.workspaceId, kind: "RENEWAL" } })).toBe(0);
  });

  it("paying the same plan early extends from the current end; a change starts anew", async () => {
    const a = await paid("prolong", "PRO", 2);
    const end = (await sub(a.workspaceId)).currentPeriodEnd!;
    const pay = async (body: object) => {
      const co = (await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH", ...body }).expect(201)).body;
      await api(t, a.token).post(`/billing/dev/pay/${orderOf(co.paymentUrl)}`, { success: true }).expect(204);
    };
    await pay({ seats: 2 });
    const extended = (await sub(a.workspaceId)).currentPeriodEnd!;
    expect(extended.getTime()).toBeGreaterThan(end.getTime() + 27 * DAY);
    await pay({ seats: 3 });
    const fresh = await sub(a.workspaceId);
    expect(fresh.seats).toBe(3);
    expect(fresh.currentPeriodEnd!.getTime()).toBeLessThan(extended.getTime());
  });

  it("paying a locked or past-due workspace unlocks it", async () => {
    const a = await paid("unlock");
    await expire(a.workspaceId, { status: "LOCKED" });
    expect((await api(t, a.token).get("/billing")).body.locked).toBe(true);
    const co = (await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH" }).expect(201)).body;
    await api(t, a.token).post(`/billing/dev/pay/${orderOf(co.paymentUrl)}`, { success: true }).expect(204);
    expect((await api(t, a.token).get("/billing")).body.locked).toBe(false);
    await api(t, a.token).post("/projects", { title: "Снова можно" }).expect(201);
  });

  it("locks an expired trial when the scheduler runs", async () => {
    const a = await register(t, "trial");
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    expect(await billing.runDue()).toMatchObject({ trials: expect.any(Number) });
    expect((await sub(a.workspaceId)).status).toBe("LOCKED");
    expect((await t.db.auditLog.findFirst({ where: { workspaceId: a.workspaceId, action: "billing.locked" } }))).not.toBeNull();
  });

  it("treats a lapsed period as locked even before the scheduler notices", async () => {
    const a = await paid("lazy");
    await expire(a.workspaceId, { currentPeriodEnd: new Date(Date.now() - 4 * DAY) });
    await api(t, a.token).post("/projects", { title: "Нельзя" }).expect(402);
    expect((await api(t, a.token).get("/billing")).body).toMatchObject({ locked: true });
  });
});

describe("read-only mode", () => {
  const lock = (workspaceId: string) => t.db.subscription.update({ where: { workspaceId }, data: { status: "LOCKED" } });

  it("keeps every read and the payment pages, refuses every other write with 402", async () => {
    const a = await register(t, "ro");
    const A = api(t, a.token);
    const { project, cards } = await makeProject(t, a.token, "P", ["x"]);
    await lock(a.workspaceId);

    for (const path of ["/projects", `/projects/${project.id}`, `/projects/${project.id}/board`, `/cards/${cards[0].id}`, "/team-board", "/users", "/roles", "/templates", "/settings", "/labels", "/fields", "/notifications", "/billing", "/onboarding", `/projects/${project.id}/recurring`]) {
      await A.get(path).expect(200);
    }
    const refused = await A.post("/projects", { title: "Нельзя" }).expect(402);
    expect(refused.body).toMatchObject({ code: "WORKSPACE_LOCKED", message: expect.stringContaining("только для чтения") });
    await A.patch(`/cards/${cards[0].id}`, { title: "Нельзя" }).expect(402);
    await A.post("/cards", { columnId: "x", title: "Нельзя" }).expect(402);
    await A.del(`/cards/${cards[0].id}`).expect(402);
    await A.post(`/cards/${cards[0].id}/comments`, { text: "нельзя" }).expect(402);
    await A.patch("/settings", { workspaceName: "Нельзя" }).expect(402);
    await A.post("/invitations", { email: "x@iso.test" }).expect(402);
    await A.post("/users", { email: "x@iso.test", name: "x", password: "password-123" }).expect(402);
    await A.put(`/cards/${cards[0].id}/fields/x`, { value: 1 }).expect(402);
    await A.post("/labels", { name: "x", color: "red" }).expect(402);
    expect((await A.get(`/cards/${cards[0].id}`)).body.title).toBe("x");
  });

  it("still allows paying, choosing Free, the profile, reading notifications and marking cards read", async () => {
    const a = await register(t, "ro2");
    const A = api(t, a.token);
    const { cards } = await makeProject(t, a.token, "P", ["x"]);
    await lock(a.workspaceId);
    await A.patch("/users/me", { name: "Новое имя" }).expect(200);
    await A.post("/users/me/password", { currentPassword: a.password, newPassword: "another-pass-1" }).expect(204);
    await A.post("/notifications/read", {}).expect(204);
    await A.post(`/cards/${cards[0].id}/read`).expect(204);
    await A.post("/onboarding/close").expect(204);
    await A.post("/billing/checkout", { planId: "PRO", interval: "MONTH" }).expect(201);
    await api(t).post("/auth/login", { email: a.email, password: "another-pass-1" }).expect(201);
  });

  it("choosing Free ends the lock; existing data stays and Free limits apply to new items", async () => {
    const a = await register(t, "ro3");
    const A = api(t, a.token);
    for (let i = 0; i < 4; i++) await A.post("/projects", { title: `P${i}` }).expect(201); // trial: unlimited
    await lock(a.workspaceId);
    await A.post("/billing/free", {}).expect(204);
    const o = (await A.get("/billing")).body;
    expect(o).toMatchObject({ locked: false, plan: { id: "FREE" }, subscription: { status: "ACTIVE" } });
    expect((await A.get("/projects")).body).toHaveLength(4); // nothing is deleted
    await A.post("/projects", { title: "Пятый" }).expect(402); // over the Free limit, with a plan message
  });

  it("the trial can move to Free at once, but a paid period can't be dropped mid-way", async () => {
    const a = await register(t, "ro4");
    await api(t, a.token).post("/billing/free", {}).expect(204);
    const b = await register(t, "ro5");
    const co = (await api(t, b.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH" })).body;
    await api(t, b.token).post(`/billing/dev/pay/${orderOf(co.paymentUrl)}`, { success: true });
    const res = await api(t, b.token).post("/billing/free", {}).expect(400);
    expect(res.body.message).toContain("действует до конца периода");
  });

  it("no due-date reminders are sent to a locked workspace", async () => {
    const { DueRemindersService } = await import("../src/notifications/due-reminders.service");
    const a = await register(t, "ro6");
    const { cards } = await makeProject(t, a.token, "P", ["x"]);
    const today = new Date().toISOString().slice(0, 10);
    await api(t, a.token).patch(`/cards/${cards[0].id}`, { assigneeIds: [a.userId], dueDate: today });
    await lock(a.workspaceId);
    await t.app.get(DueRemindersService).run();
    expect(await t.db.notification.count({ where: { cardId: cards[0].id, type: "DUE_SOON" } })).toBe(0);
  });
});

describe("subscription state helpers", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const sub = (o: object) => ({ planId: "PRO", status: "ACTIVE" as const, trialEndsAt: null, currentPeriodEnd: null, ...o });
  it("derives the lock from status and dates", () => {
    expect(isLocked(null)).toBe(false);
    expect(isLocked(sub({ status: "LOCKED" }), now)).toBe(true);
    expect(isLocked(sub({ status: "TRIALING", trialEndsAt: new Date("2026-10-11") }), now)).toBe(false);
    expect(isLocked(sub({ status: "TRIALING", trialEndsAt: new Date("2026-10-10") }), now)).toBe(true);
    expect(isLocked(sub({ status: "TRIALING" }), now)).toBe(true);
    expect(isLocked(sub({ currentPeriodEnd: new Date("2026-10-09") }), now)).toBe(false); // inside the 3-day grace
    expect(isLocked(sub({ currentPeriodEnd: new Date("2026-10-06") }), now)).toBe(true);
    expect(isLocked(sub({ planId: "FREE", currentPeriodEnd: new Date("2020-01-01") }), now)).toBe(false);
    expect(isLocked(sub({ status: "PAST_DUE", currentPeriodEnd: new Date("2026-10-09") }), now)).toBe(false);
  });
  it("lists what stays allowed while locked", () => {
    expect(allowedWhileLocked("GET", "/projects")).toBe(true);
    expect(allowedWhileLocked("POST", "/billing/checkout")).toBe(true);
    expect(allowedWhileLocked("POST", "/auth/login")).toBe(true);
    expect(allowedWhileLocked("PATCH", "/users/me")).toBe(true);
    expect(allowedWhileLocked("POST", "/users/me/password")).toBe(true);
    expect(allowedWhileLocked("POST", "/cards/abc/read")).toBe(true);
    expect(allowedWhileLocked("POST", "/notifications/read")).toBe(true);
    expect(allowedWhileLocked("POST", "/onboarding/close")).toBe(true);
    expect(allowedWhileLocked("POST", "/platform/workspaces/x/subscription")).toBe(true);
    expect(allowedWhileLocked("POST", "/projects")).toBe(false);
    expect(allowedWhileLocked("PATCH", "/users/other")).toBe(false);
    expect(allowedWhileLocked("DELETE", "/cards/abc")).toBe(false);
    expect(allowedWhileLocked("POST", "/cards/abc/comments")).toBe(false);
  });
});

describe("T-Bank provider", () => {
  const cfg = { terminalKey: "T", password: "secret", apiUrl: "https://bank.test/v2", successUrl: "https://app/ok", failUrl: "https://app/fail", notificationUrl: "https://api/hook", tax: "none" };
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const fetchMock = jest.spyOn(global, "fetch");
  afterEach(() => fetchMock.mockReset());
  const respond = (body: object) => fetchMock.mockResolvedValue({ json: async () => body } as Response);

  it("signs by sorting scalar fields, appending the password, ignoring objects and Token", () => {
    expect(tbankToken({ TerminalKey: "T", Amount: 100, OrderId: "1", Receipt: { a: 1 }, Token: "x" }, "secret")).toBe(sha("100" + "1" + "secret" + "T"));
    expect(tbankToken({ Success: true, Z: null, A: undefined, B: "b" }, "p")).toBe(sha("b" + "p" + "true"));
  });

  it("Init sends a signed request with the recurrent flag and optional receipt, and returns the pay URL", async () => {
    respond({ Success: true, PaymentId: 777, PaymentURL: "https://pay.test/777" });
    const provider = new TbankProvider({ ...cfg, taxation: "usn_income" });
    const res = await provider.init({ orderId: "o1", amount: 49000, description: "Тариф", customerKey: "ws", recurrent: true, email: "a@b.c" });
    expect(res).toEqual({ providerPaymentId: "777", paymentUrl: "https://pay.test/777" });
    const [url, init] = fetchMock.mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(url).toBe("https://bank.test/v2/Init");
    expect(sent).toMatchObject({ TerminalKey: "T", Amount: 49000, OrderId: "o1", CustomerKey: "ws", Recurrent: "Y", SuccessURL: "https://app/ok", FailURL: "https://app/fail", NotificationURL: "https://api/hook" });
    expect(sent.Receipt).toMatchObject({ Email: "a@b.c", Taxation: "usn_income", Items: [{ Amount: 49000, Quantity: 1, Tax: "none" }] });
    expect(sent.Token).toBe(tbankToken(sent, "secret"));
  });

  it("Init omits the receipt without taxation and Recurrent for renewals; failures become 502", async () => {
    respond({ Success: true, PaymentId: 1, PaymentURL: "u" });
    await new TbankProvider(cfg).init({ orderId: "o", amount: 1, description: "d", customerKey: "k", recurrent: false, email: "a@b.c" });
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).not.toHaveProperty("Receipt");
    expect(sent).not.toHaveProperty("Recurrent");

    respond({ Success: false, Message: "bad", Details: "terminal" });
    await expect(new TbankProvider(cfg).init({ orderId: "o", amount: 1, description: "d", customerKey: "k", recurrent: false })).rejects.toBeInstanceOf(BadGatewayException);
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(new TbankProvider(cfg).init({ orderId: "o", amount: 1, description: "d", customerKey: "k", recurrent: false })).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("Charge reports confirmation or the bank's reason", async () => {
    respond({ Success: true, Status: "CONFIRMED" });
    expect(await new TbankProvider(cfg).charge("77", "rebill")).toEqual({ confirmed: true });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ PaymentId: "77", RebillId: "rebill" });
    respond({ Success: false, Status: "REJECTED", Details: "Недостаточно средств" });
    expect(await new TbankProvider(cfg).charge("77", "rebill")).toEqual({ confirmed: false, reason: "Недостаточно средств" });
    respond({ Success: false });
    expect((await new TbankProvider(cfg).charge("77", "rebill")).reason).toBe("Платёж отклонён");
  });

  it("verifies notifications and maps their statuses", () => {
    const p = new TbankProvider(cfg);
    const sign = (o: Record<string, unknown>) => ({ ...o, Token: tbankToken(o, "secret") });
    expect(p.parseNotification(sign({ OrderId: "o", PaymentId: 5, Amount: 100, Status: "CONFIRMED", RebillId: 9, Pan: "430000******0777" }))).toEqual({
      orderId: "o", providerPaymentId: "5", status: "CONFIRMED", amount: 100, rebillId: "9", cardMask: "430000******0777", reason: "CONFIRMED",
    });
    expect(p.parseNotification(sign({ OrderId: "o", PaymentId: 5, Amount: 100, Status: "REJECTED", Message: "no" })).status).toBe("FAILED");
    for (const status of ["CANCELED", "DEADLINE_EXPIRED", "AUTH_FAIL", "REVERSED"]) expect(p.parseNotification(sign({ OrderId: "o", Status: status })).status).toBe("FAILED");
    expect(p.parseNotification(sign({ OrderId: "o", Status: "AUTHORIZED" })).status).toBe("IGNORE");
    expect(() => p.parseNotification({ OrderId: "o", Status: "CONFIRMED", Token: "bad" })).toThrow(UnauthorizedException);
    expect(() => p.parseNotification({ OrderId: "o" })).toThrow(UnauthorizedException);
  });

  it("the mock provider signs and verifies the same way", async () => {
    const m = new MockProvider("http://app/", false);
    const init = await m.init({ orderId: "o 1", amount: 1, description: "d", customerKey: "k", recurrent: true });
    expect(init.paymentUrl).toBe("http://app//billing/mock-pay?order=o%201");
    expect(init.providerPaymentId).toMatch(/^mock_/);
    expect(await m.charge()).toEqual({ confirmed: true });
    expect(await new MockProvider("x", true).charge()).toMatchObject({ confirmed: false });
    expect(m.parseNotification(mockNotification({ OrderId: "o", PaymentId: "p", Amount: 5, Status: "CONFIRMED" }))).toMatchObject({ status: "CONFIRMED", rebillId: expect.stringContaining("mock-rebill") });
    expect(m.parseNotification(mockNotification({ OrderId: "o", PaymentId: "p", Amount: 5, Status: "REJECTED" })).status).toBe("FAILED");
    expect(() => m.parseNotification({ OrderId: "o", Token: tbankToken({ OrderId: "o" }, "other") })).toThrow(UnauthorizedException);
    expect(MOCK_PASSWORD).toBeTruthy();
  });

  it("chooses the real terminal only when both keys are set", () => {
    expect(createProvider({ APP_URL: "http://a" } as NodeJS.ProcessEnv).test).toBe(true);
    expect(createProvider({ TBANK_TERMINAL_KEY: "T" } as NodeJS.ProcessEnv).test).toBe(true);
    const real = createProvider({ TBANK_TERMINAL_KEY: "T", TBANK_PASSWORD: "p", API_PUBLIC_URL: "https://api.test/", APP_URL: "https://app.test/", TBANK_API_URL: "https://bank.test/v2/" } as NodeJS.ProcessEnv);
    expect(real.test).toBe(false);
    respond({ Success: true, PaymentId: 1, PaymentURL: "u" });
    void real.init({ orderId: "o", amount: 1, description: "d", customerKey: "k", recurrent: true }).then(() => {
      const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(sent).toMatchObject({ NotificationURL: "https://api.test/billing/webhooks/tbank", SuccessURL: "https://app.test/settings/billing?paid=1" });
    });
    expect(createProvider({ MOCK_CHARGE_FAIL: "1" } as NodeJS.ProcessEnv)).toBeInstanceOf(MockProvider);
  });
});

describe("paid seats", () => {
  const pay = async (a: { token: string }, seats: number) => {
    const co = (await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH", seats }).expect(201)).body;
    await api(t, a.token).post(`/billing/dev/pay/${orderOf(co.paymentUrl)}`, { success: true }).expect(204);
  };
  const addUser = (a: { token: string }) => api(t, a.token).post("/users", { email: `${unique("s")}@iso.test`, name: "S", password: "password-123" });

  it("has no seat limit during the trial", async () => {
    const a = await register(t, "trialseats");
    for (let i = 0; i < 4; i++) await addUser(a).expect(201);
    const o = (await api(t, a.token).get("/billing").expect(200)).body;
    expect([o.seatLimit, o.subscription.seats, o.usage.users]).toEqual([null, null, 5]);
  });

  it("charges for the chosen seats and refuses users beyond them", async () => {
    const a = await register(t, "seats");
    await addUser(a).expect(201);
    // fewer seats than active users is refused
    await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH", seats: 1 }).expect(400);
    await pay(a, 3);
    const payment = await t.db.payment.findFirstOrThrow({ where: { workspaceId: a.workspaceId, status: "PAID" } });
    expect([payment.seats, payment.amount]).toEqual([3, 3 * 49000]);
    const o = (await api(t, a.token).get("/billing").expect(200)).body;
    expect([o.seatLimit, o.subscription.seats]).toEqual([3, 3]);

    await addUser(a).expect(201); // 3 of 3
    const refused = await addUser(a).expect(402);
    expect(refused.body.message).toContain("Оплачено мест: 3");
    await api(t, a.token).post("/invitations", { email: `${unique("inv")}@iso.test` }).expect(402);

    // freeing a seat lets one back in; reactivating needs a free seat too
    const users = (await api(t, a.token).get("/users").expect(200)).body as { id: string; role: string }[];
    const member = users.find((u) => u.role !== "ADMIN")!;
    await api(t, a.token).patch(`/users/${member.id}`, { isActive: false }).expect(200);
    await api(t, a.token).post("/invitations", { email: `${unique("inv")}@iso.test` }).expect(201); // reserves the seat
    await api(t, a.token).patch(`/users/${member.id}`, { isActive: true }).expect(402);
  });

  it("counts file storage from the paid seats, not the active users", async () => {
    const a = await register(t, "seatstorage");
    await pay(a, 3);
    const o = (await api(t, a.token).get("/billing").expect(200)).body;
    const pro = o.plans.find((p: { id: string }) => p.id === "PRO");
    expect(o.usage.users).toBe(1);
    expect(o.storageLimitMb).toBe(pro.storageMbBase + 3 * pro.storageMbPerSeat);
  });

});

describe("users beyond the paid seats", () => {
  it("locks out the newest extra users and flags them in the staff list", async () => {
    const a = await register(t, "overseat");
    const extra = [];
    for (let i = 0; i < 2; i++) {
      const email = `${unique("o")}@iso.test`;
      await api(t, a.token).post("/users", { email, name: `O${i}`, password: "password-123" }).expect(201);
      extra.push(email);
    }
    // 3 active users, but only 2 seats paid (e.g. an old subscription)
    await setPlan(t, a.workspaceId, "PRO");
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { seats: 2 } });
    billing.forgetSeats(a.workspaceId);

    const list = (await api(t, a.token).get("/users").expect(200)).body as { email: string; overSeat: boolean }[];
    expect(list.filter((u) => u.overSeat).map((u) => u.email)).toEqual([extra[1]]);
    const server = t.app.getHttpServer();
    const refused = await request(server).post("/auth/login").send({ email: extra[1], password: "password-123" }).expect(403);
    expect(refused.body.message).toContain("нет оплаченного места");
    await request(server).post("/auth/login").send({ email: extra[0], password: "password-123" }).expect(201);

    // freeing a seat lets them back in
    const first = (await t.db.user.findUniqueOrThrow({ where: { email: extra[0] } })).id;
    await api(t, a.token).patch(`/users/${first}`, { isActive: false }).expect(200);
    await request(server).post("/auth/login").send({ email: extra[1], password: "password-123" }).expect(201);
  });
});

describe("period-end reminders", () => {
  it("mails billing managers before and after the end, once each", async () => {
    const mail = t.app.get(MailService);
    const sent: { to: string; subject: string }[] = [];
    const spy = jest.spyOn(mail, "send").mockImplementation(async (to, subject) => {
      sent.push({ to, subject });
      return true;
    });
    try {
      const a = await register(t, "remind");
      const member = `${unique("m")}@iso.test`;
      await api(t, a.token).post("/users", { email: member, name: "M", password: "password-123" }).expect(201);
      const co = (await api(t, a.token).post("/billing/checkout", { planId: "PRO", interval: "MONTH", seats: 2 })).body;
      await api(t, a.token).post(`/billing/dev/pay/${orderOf(co.paymentUrl)}`, { success: true }).expect(204);
      const mine = () => sent.filter((m) => m.to === a.email);

      await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { currentPeriodEnd: new Date(Date.now() + 2 * DAY) } });
      await billing.runDue();
      await billing.runDue();
      expect(mine().map((m) => m.subject)).toEqual([expect.stringContaining("заканчивается")]);
      expect(sent.some((m) => m.to === member)).toBe(false); // no billing.manage

      await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { currentPeriodEnd: new Date(Date.now() - 3600_000) } });
      await billing.runDue();
      await billing.runDue();
      expect(mine().map((m) => m.subject)).toEqual([expect.stringContaining("заканчивается"), expect.stringContaining("закончился")]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("bank transfer by invoice", () => {
  const payer = { payerName: "ООО «Ромашка»", payerInn: "7701234567", payerKpp: "770101001", payerAddress: "Москва, ул. Пример, 1", payerEmail: "buh@romashka.test" };

  it("records the request, mails the platform owner, and activates when marked paid", async () => {
    const mail = t.app.get(MailService);
    const sent: string[] = [];
    const spy = jest.spyOn(mail, "send").mockImplementation(async (to) => {
      sent.push(to);
      return true;
    });
    const before = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = "owner@plano.test";
    try {
      const a = await register(t, "invoice");
      const A = api(t, a.token);
      await A.post("/billing/invoice", { ...payer, payerInn: "123", planId: "PRO", interval: "MONTH", seats: 2 }).expect(400);
      const first = (await A.post("/billing/invoice", { ...payer, planId: "PRO", interval: "MONTH", seats: 2 }).expect(201)).body;
      const inv = (await A.post("/billing/invoice", { ...payer, planId: "PRO", interval: "YEAR", seats: 2 }).expect(201)).body;
      expect(inv.invoiceNumber).toBeGreaterThan(first.invoiceNumber);
      expect(sent).toEqual(expect.arrayContaining(["owner@plano.test", payer.payerEmail]));

      const o = (await A.get("/billing").expect(200)).body;
      expect(o.subscription.status).toBe("TRIALING"); // nothing changes until paid
      expect(o.lastPayer).toMatchObject({ payerInn: payer.payerInn });
      const states = Object.fromEntries(o.payments.map((p: { id: string; status: string }) => [p.id, p.status]));
      expect([states[first.id], states[inv.id]]).toEqual(["FAILED", "PENDING"]); // replaced by the newer one

      // only the platform owner can mark it paid
      await A.post(`/platform/invoices/${inv.id}/paid`).expect(404);
      const owner = await register(t, "owner");
      await t.db.user.update({ where: { id: owner.userId }, data: { email: "owner@plano.test" } });
      const O = api(t, (await request(t.app.getHttpServer()).post("/auth/login").send({ email: "owner@plano.test", password: owner.password })).body.accessToken);
      expect((await O.get("/platform/invoices").expect(200)).body.map((p: { id: string }) => p.id)).toContain(inv.id);
      await O.post(`/platform/invoices/${inv.id}/paid`).expect(204);
      await O.post(`/platform/invoices/${inv.id}/paid`).expect(204); // idempotent
      const s = await sub(a.workspaceId);
      expect([s.status, s.planId, s.interval, s.seats]).toEqual(["ACTIVE", "PRO", "YEAR", 2]);
      await O.post(`/platform/invoices/${first.id}/paid`).expect(400); // replaced invoice
    } finally {
      process.env.PLATFORM_ADMIN_EMAILS = before;
      spy.mockRestore();
    }
  });

  it("a pending invoice can be cancelled by the workspace", async () => {
    const a = await register(t, "invcancel");
    const inv = (await api(t, a.token).post("/billing/invoice", { ...payer, planId: "PRO", interval: "MONTH" }).expect(201)).body;
    await api(t, a.token).post(`/billing/invoice/${inv.id}/cancel`).expect(204);
    await api(t, a.token).post(`/billing/invoice/${inv.id}/cancel`).expect(404);
  });
});
