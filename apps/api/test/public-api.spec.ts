import { createHmac } from "crypto";
import http from "http";
import { AddressInfo } from "net";
import request from "supertest";
import { buildCalendar } from "../src/calendar/ics";
import { open } from "../src/agents/secret";
import { api, createApp, makeProject, register, unique, type TestApp } from "./helpers/app";

let t: TestApp;
let server: http.Server;
let base: string;
interface Got {
  url: string;
  event: string;
  body: any;
  headers: http.IncomingHttpHeaders;
  raw: string;
}
const got: Got[] = [];
let status = 200;
// Each test posts to its own path, so a late delivery of an earlier test can't be mistaken for its own.
let tag = "";
const hits = () => got.filter((g) => g.url === `/hook/${tag}`);
const hookUrl = () => `${base}/${tag}`;

beforeAll(async () => {
  t = await createApp();
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      got.push({ url: req.url ?? "", event: String(req.headers["x-plano-event"]), body: raw ? JSON.parse(raw) : null, headers: req.headers, raw });
      res.writeHead(status);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
afterAll(async () => {
  server.close();
  await t.close();
});
beforeEach(() => {
  tag = unique("h");
  status = 200;
});

const waitFor = async (cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
  expect(cond()).toBe(true);
};

async function member(adminToken: string, tag: string) {
  const email = `${unique(tag)}@iso.test`;
  await api(t, adminToken).post("/users", { email, name: `Сотрудник ${tag}`, password: "password-123" }).expect(201);
  const token = (await request(t.app.getHttpServer()).post("/auth/login").send({ email, password: "password-123" }).expect(201)).body.accessToken;
  return { email, token };
}

describe("API tokens", () => {
  it("act as their owner, are shown once and can be revoked", async () => {
    const a = await register(t, "tk1");
    const A = api(t, a.token);
    const created = (await A.post("/api-tokens", { name: "  CI  " }).expect(201)).body;
    expect(created).toMatchObject({ name: "CI", hint: created.token.slice(-6) });
    const list = (await A.get("/api-tokens").expect(200)).body;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const viaToken = api(t, created.token);
    expect((await viaToken.get("/users/me").expect(200)).body.email).toBe(a.email);
    expect((await A.get("/api-tokens").expect(200)).body[0].lastUsedAt).not.toBeNull();
    // work with the project through the token
    const { columns } = await makeProject(t, a.token, "P");
    const card = (await viaToken.post("/cards", { columnId: columns[0].id, title: "Из API" }).expect(201)).body;
    expect(card.title).toBe("Из API");

    await viaToken.post("/api-tokens", { name: "x" }).expect(403);
    await viaToken.del(`/api-tokens/${created.id}`).expect(403);
    await A.del(`/api-tokens/${created.id}`).expect(204);
    await viaToken.get("/users/me").expect(401);
  });

  it("stop working with their owner, and belong to the owner only", async () => {
    const a = await register(t, "tk2");
    const m = await member(a.token, "tk2m");
    const mine = (await api(t, m.token).post("/api-tokens", { name: "m" }).expect(201)).body;
    const other = await register(t, "tk2o");
    await api(t, other.token).del(`/api-tokens/${mine.id}`).expect(404);
    await api(t, a.token).del(`/api-tokens/${mine.id}`).expect(404); // not even the admin sees it
    await api(t, a.token).post("/api-tokens", {}).expect(400);
    const user = await t.db.user.findUniqueOrThrow({ where: { email: m.email } });
    await t.db.user.update({ where: { id: user.id }, data: { isActive: false } });
    await api(t, mine.token).get("/users/me").expect(401);
  });
});

describe("webhooks", () => {
  it("send signed events for cards and comments, and honour the event filter", async () => {
    const a = await register(t, "wh1");
    const A = api(t, a.token);
    const { columns, cards } = await makeProject(t, a.token, "P", []);
    const hook = (await A.post("/webhooks", { url: hookUrl() }).expect(201)).body;
    expect(hook.secret).toMatch(/^whsec_/);
    const only = (await A.post("/webhooks", { url: hookUrl(), events: ["card.moved"] }).expect(201)).body;
    expect(JSON.stringify((await A.get("/webhooks").expect(200)).body)).not.toContain("whsec_");

    const card = (await A.post("/cards", { columnId: columns[0].id, title: "Новая" }).expect(201)).body;
    await waitFor(() => hits().length >= 1);
    const first = hits()[0];
    expect(first.event).toBe("card.created");
    expect(first.body.card).toMatchObject({ id: card.id, title: "Новая", key: `TSK-${card.number}`, column: { id: columns[0].id } });
    expect(first.body.actor).toMatchObject({ id: a.userId });
    // the signature covers "<timestamp>.<body>" and is made with the secret
    const ts = String(first.headers["x-plano-timestamp"]);
    const expected = createHmac("sha256", hook.secret).update(`${ts}.${first.raw}`).digest("hex");
    expect(first.headers["x-plano-signature"]).toBe(`sha256=${expected}`);
    expect(hits()).toHaveLength(1); // the "moved only" hook stays silent

    await A.patch(`/cards/${card.id}`, { title: "Новое имя" }).expect(200);
    await A.post(`/cards/${card.id}/move`, { columnId: columns[1].id }).expect(201);
    await A.post(`/cards/${card.id}/comments`, { text: "Привет" }).expect(201);
    await waitFor(() => hits().length >= 5); // created, updated, moved x2 (both hooks), comment
    const events = hits().map((g) => g.event).sort();
    expect(events).toEqual(["card.created", "card.moved", "card.moved", "card.updated", "comment.created"]);
    expect(hits().find((g) => g.event === "card.updated")!.body.changes).toEqual(["title"]);
    expect(hits().find((g) => g.event === "card.moved")!.body).toMatchObject({ from: columns[0].title, to: columns[1].title });
    expect(hits().find((g) => g.event === "comment.created")!.body.comment).toMatchObject({ text: "Привет" });

    const before = hits().length;
    await A.del(`/cards/${card.id}`).expect(200);
    await waitFor(() => hits().length > before);
    expect(hits()[before].event).toBe("card.deleted");
    expect(hits()[before].body.card).toMatchObject({ id: card.id, title: "Новое имя" });
    void cards;
    void only;
  });

  it("covers bulk actions, records deliveries, retries failures and can be tested", async () => {
    const a = await register(t, "wh2");
    const A = api(t, a.token);
    const { columns, cards } = await makeProject(t, a.token, "P", ["a", "b"]);
    const hook = (await A.post("/webhooks", { url: hookUrl() }).expect(201)).body;
    await A.post("/cards/bulk", { ids: cards.map((c: { id: string }) => c.id), action: "priority", priority: "HIGH" }).expect(201);
    await A.post("/cards/bulk", { ids: cards.map((c: { id: string }) => c.id), action: "move", columnId: columns[1].id }).expect(201);
    await waitFor(() => hits().length >= 4);
    expect(hits().map((g) => g.event).sort()).toEqual(["card.moved", "card.moved", "card.updated", "card.updated"]);

    const sent = hits().length;
    expect((await A.post(`/webhooks/${hook.id}/test`).expect(200)).body).toEqual({ ok: true });
    expect(hits()[sent]).toMatchObject({ event: "ping" });
    status = 500;
    expect((await A.post(`/webhooks/${hook.id}/test`).expect(200)).body).toEqual({ ok: false });
    const log = (await A.get(`/webhooks/${hook.id}/deliveries`).expect(200)).body;
    expect(log[0]).toMatchObject({ ok: false, statusCode: 500, error: "HTTP 500", event: "ping" });
    expect(log.some((d: { ok: boolean }) => d.ok)).toBe(true);
    const listed = (await A.get("/webhooks").expect(200)).body[0];
    expect(listed.lastDelivery).toMatchObject({ ok: false, statusCode: 500 });
  });

  it("can be changed, paused, re-keyed and deleted, and are managed by permission only", async () => {
    const a = await register(t, "wh3");
    const A = api(t, a.token);
    const m = await member(a.token, "wh3m");
    await api(t, m.token).get("/webhooks").expect(403);
    await api(t, m.token).post("/webhooks", { url: hookUrl() }).expect(403);

    const hook = (await A.post("/webhooks", { url: hookUrl() }).expect(201)).body;
    await A.post("/webhooks", { url: hookUrl(), events: ["nope"] }).expect(400);
    const { columns } = await makeProject(t, a.token, "P");
    await A.patch(`/webhooks/${hook.id}`, { isActive: false }).expect(200);
    await A.post("/cards", { columnId: columns[0].id, title: "тихо" }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(hits()).toHaveLength(0);
    await A.patch(`/webhooks/${hook.id}`, { isActive: true, events: ["card.created"] }).expect(200);

    const { secret } = (await A.post(`/webhooks/${hook.id}/secret`).expect(201)).body;
    expect(secret).not.toBe(hook.secret);
    const stored = await t.db.webhook.findUniqueOrThrow({ where: { id: hook.id } });
    expect(stored.secret).not.toContain(secret); // sealed at rest
    expect(open(stored.secret)).toBe(secret);

    await A.post("/cards", { columnId: columns[0].id, title: "слышно" }).expect(201);
    await waitFor(() => hits().length === 1);
    const ts = String(hits()[0].headers["x-plano-timestamp"]);
    expect(hits()[0].headers["x-plano-signature"]).toBe(`sha256=${createHmac("sha256", secret).update(`${ts}.${hits()[0].raw}`).digest("hex")}`);

    // another workspace can't see or change it
    const other = await register(t, "wh3o");
    await api(t, other.token).patch(`/webhooks/${hook.id}`, { isActive: false }).expect(404);
    await api(t, other.token).del(`/webhooks/${hook.id}`).expect(404);
    expect((await api(t, other.token).get("/webhooks").expect(200)).body).toEqual([]);

    await A.del(`/webhooks/${hook.id}`).expect(204);
    await A.get(`/webhooks/${hook.id}/deliveries`).expect(404);
  });

  it("accept only public https addresses, and no more than ten", async () => {
    const a = await register(t, "wh4");
    const A = api(t, a.token);
    const flag = process.env.AGENTS_ALLOW_PRIVATE_URLS;
    delete process.env.AGENTS_ALLOW_PRIVATE_URLS;
    try {
      for (const url of ["http://example.com/x", "https://localhost/x", "https://192.168.1.5/x", "not a url"]) await A.post("/webhooks", { url }).expect(400);
      await A.post("/webhooks", { url: "https://example.com/hook" }).expect(201);
    } finally {
      process.env.AGENTS_ALLOW_PRIVATE_URLS = flag;
    }
    for (let i = 0; i < 9; i++) await A.post("/webhooks", { url: `${base}/x${i}` }).expect(201);
    await A.post("/webhooks", { url: hookUrl() }).expect(400);
  });
});

describe("calendar feed", () => {
  const path = (url: string) => new URL(url).pathname;

  it("lists the user's open cards with due dates as all-day events", async () => {
    const a = await register(t, "ic1");
    const A = api(t, a.token);
    const { columns, cards } = await makeProject(t, a.token, "Сайт", ["Сдать макет", "Без срока", "Готовое", "Чужое"]);
    const day = (n: number) => new Date(Date.UTC(2026, 10, n)).toISOString();
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [a.userId], startDate: day(3), dueDate: day(5), description: "x" }).expect(200);
    await A.patch(`/cards/${cards[1].id}`, { assigneeIds: [a.userId] }).expect(200);
    await A.patch(`/cards/${cards[2].id}`, { assigneeIds: [a.userId], dueDate: day(7) }).expect(200);
    await A.patch(`/cards/${cards[3].id}`, { dueDate: day(9) }).expect(200);
    await A.post(`/cards/${cards[2].id}/move`, { columnId: columns[columns.length - 1].id }).expect(201);

    const { url } = (await A.get("/calendar/feed").expect(200)).body;
    expect(url).toMatch(/\/calendar\/[0-9a-f]{48}\/plano\.ics$/);
    expect((await A.get("/calendar/feed").expect(200)).body.url).toBe(url); // stable

    const res = await request(t.app.getHttpServer()).get(path(url)).expect(200); // no sign-in needed
    expect(res.headers["content-type"]).toContain("text/calendar");
    const text = res.text;
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain(`UID:${cards[0].id}@plano`);
    expect(text).toContain(`SUMMARY:TSK-${cards[0].number} Сдать макет`);
    expect(text).toContain("DTSTART;VALUE=DATE:20261103");
    expect(text).toContain("DTEND;VALUE=DATE:20261106"); // the due day is included
    expect(text).toContain("X-WR-CALNAME:Plano — мои задачи");
    expect(text).not.toContain(cards[1].id); // no due date
    expect(text).not.toContain(cards[2].id); // finished
    expect(text).not.toContain(cards[3].id); // someone else's
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);

    const next = (await A.post("/calendar/feed/reset").expect(201)).body.url;
    expect(next).not.toBe(url);
    await request(t.app.getHttpServer()).get(path(url)).expect(404);
    await request(t.app.getHttpServer()).get(path(next)).expect(200);
    await request(t.app.getHttpServer()).get("/calendar/nope/plano.ics").expect(404);
    await A.get("/calendar/feed").expect(200);
    await api(t).get("/calendar/feed").expect(401);

    await t.db.user.update({ where: { id: a.userId }, data: { isActive: false } });
    await request(t.app.getHttpServer()).get(path(next)).expect(404);
  });

  it("writes valid iCalendar: escaping and folding of long lines", () => {
    const text = buildCalendar("Имя, с; символами", [
      { uid: "u1@plano", summary: "Строка\nвторая; и, запятая \\ " + "я".repeat(80), start: new Date("2026-11-03"), endExclusive: new Date("2026-11-04"), modified: new Date("2026-11-01T10:00:00Z") },
    ], new Date("2026-11-02T00:00:00Z"));
    expect(text).toContain("X-WR-CALNAME:Имя\\, с\\; символами");
    expect(text).toContain("DTSTAMP:20261102T000000Z");
    const lines = text.split("\r\n");
    expect(lines.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    const unfolded = text.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Строка\\nвторая\\; и\\, запятая \\\\ " + "я".repeat(80));
  });
});
