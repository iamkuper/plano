import http from "http";
import { AddressInfo } from "net";
import request from "supertest";
import { BillingService } from "../src/billing/billing.service";
import { AgentRunner } from "../src/agents/agent-runner.service";
import { assertPublicUrl } from "../src/agents/llm/http";
import { open, seal } from "../src/agents/secret";
import { complete, LlmError } from "../src/agents/llm";
import { api, createApp, makeProject, register, setPlan, unique, type TestApp } from "./helpers/app";

let t: TestApp;
let server: http.Server;
let base: string;
// What the fake model service saw, and what it should answer next.
const seen: { path: string; headers: http.IncomingHttpHeaders; body: any }[] = [];
let script: ((body: any) => { status?: number; json: unknown })[] = [];

beforeAll(async () => {
  t = await createApp();
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ path: req.url ?? "", headers: req.headers, body });
      const next: (b: any) => { status?: number; json: unknown } = script.shift() ?? (() => ({ json: reply("(no script)") }));
      const out = next(body);
      res.writeHead(out.status ?? 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
  server.close();
  await t.close();
});
beforeEach(() => {
  seen.length = 0;
  script = [];
});

// OpenAI-style answers.
const reply = (text: string) => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const call = (name: string, args: object, id = "c1") => ({
  choices: [{ message: { content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 50, completion_tokens: 10 },
});

const agentBody = (over: object = {}) => ({ name: "Мария-бот", provider: "OPENAI_COMPATIBLE", model: "test-model", baseUrl: base, apiKey: "sk-test-secret-1234", instructions: "Отвечай кратко", ...over });

async function setup(tag: string) {
  const a = await register(t, tag);
  const A = api(t, a.token);
  const agent = (await A.post("/agents", agentBody()).expect(201)).body;
  const { project, cards } = await makeProject(t, a.token, "П", ["Сделать отчёт"]);
  return { a, A, agent, project, card: cards[0] };
}

// The agent works in the background: wait until its latest run settles.
async function settled(agentId: string, count = 1) {
  for (let i = 0; i < 100; i++) {
    const runs = await t.db.agentRun.findMany({ where: { agentId }, orderBy: { createdAt: "asc" } });
    if (runs.length >= count && runs.every((r) => r.status !== "RUNNING")) return runs;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("agent run did not settle");
}

describe("agents: setup", () => {
  it("creates an agent that takes a seat, hides its key and cannot sign in", async () => {
    const a = await register(t, "ag1");
    await setPlan(t, a.workspaceId, "FREE"); // 3 seats
    const A = api(t, a.token);
    const created = (await A.post("/agents", agentBody()).expect(201)).body;
    expect(created).toMatchObject({ name: "Мария-бот", provider: "OPENAI_COMPATIBLE", model: "test-model", keyHint: "…1234", enabled: true, isActive: true });
    expect(JSON.stringify(created)).not.toContain("sk-test-secret");
    const stored = await t.db.agentProfile.findUniqueOrThrow({ where: { userId: created.id } });
    expect(stored.apiKeyEnc).not.toContain("sk-test");
    expect(open(stored.apiKeyEnc)).toBe("sk-test-secret-1234");

    // the agent is a user of the workspace, flagged as one, and counts as a seat
    const users = (await A.get("/users").expect(200)).body as { id: string; kind: string }[];
    expect(users.find((u) => u.id === created.id)?.kind).toBe("AGENT");
    expect((await A.get("/billing").expect(200)).body.usage.users).toBe(2);
    await A.post("/agents", agentBody({ name: "Второй" })).expect(201);
    await A.post("/agents", agentBody({ name: "Третий" })).expect(402); // 3 seats on Free are used

    // no way in
    const user = await t.db.user.findUniqueOrThrow({ where: { id: created.id } });
    await request(t.app.getHttpServer()).post("/auth/login").send({ email: user.email, password: "anything-123" }).expect(401);
    await request(t.app.getHttpServer()).post("/auth/forgot").send({ email: user.email }).expect(204);
  });

  it("validates input and needs the agents.manage permission", async () => {
    const a = await register(t, "ag2");
    const A = api(t, a.token);
    await A.post("/agents", agentBody({ name: "" })).expect(400);
    await A.post("/agents", agentBody({ provider: "SKYNET" })).expect(400);
    await A.post("/agents", agentBody({ apiKey: undefined })).expect(400);
    await A.post("/agents", agentBody({ baseUrl: null })).expect(400); // compatible needs an address
    await A.post("/agents", agentBody({ roleId: "nope" })).expect(404);

    const email = `${unique("m")}@iso.test`;
    await A.post("/users", { email, name: "Участник", password: "password-123" }).expect(201);
    const login = await request(t.app.getHttpServer()).post("/auth/login").send({ email, password: "password-123" }).expect(201);
    const M = api(t, login.body.accessToken);
    await M.get("/agents").expect(403);
    await M.post("/agents", agentBody()).expect(403);
  });

  it("edits, keeps the key unless a new one is sent, tests the connection and removes", async () => {
    const { a, A, agent } = await setup("ag3");
    const edited = (await A.patch(`/agents/${agent.id}`, { name: "Новое имя", model: "other-model", instructions: "Пиши по-английски", enabled: false }).expect(200)).body;
    expect(edited).toMatchObject({ name: "Новое имя", model: "other-model", enabled: false, keyHint: "…1234" });
    const keep = await t.db.agentProfile.findUniqueOrThrow({ where: { userId: agent.id } });
    expect(open(keep.apiKeyEnc)).toBe("sk-test-secret-1234");
    await A.patch(`/agents/${agent.id}`, { apiKey: "sk-new-key-9999" }).expect(200);
    expect(open((await t.db.agentProfile.findUniqueOrThrow({ where: { userId: agent.id } })).apiKeyEnc)).toBe("sk-new-key-9999");

    script = [() => ({ json: reply("OK") })];
    const ok = (await A.post("/agents/test", { agentId: agent.id, provider: "OPENAI_COMPATIBLE", model: "m", baseUrl: base }).expect(200)).body;
    expect(ok).toEqual({ ok: true, reply: "OK" });
    expect(seen[0].headers.authorization).toBe("Bearer sk-new-key-9999"); // the stored key was used
    script = [() => ({ status: 401, json: { error: { message: "Incorrect API key" } } })];
    const bad = await A.post("/agents/test", { provider: "OPENAI_COMPATIBLE", model: "m", baseUrl: base, apiKey: "bad" }).expect(409);
    expect(bad.body.message).toContain("Incorrect API key");
    expect(bad.body.message).not.toContain("bad-key");
    await A.post("/agents/test", { provider: "OPENAI_COMPATIBLE", model: "m", baseUrl: base }).expect(400); // no key at all

    await A.del(`/agents/${agent.id}`).expect(204);
    const gone = await t.db.user.findUniqueOrThrow({ where: { id: agent.id }, include: { agentProfile: true } });
    expect(gone.isActive).toBe(false);
    expect(gone.agentProfile).toMatchObject({ apiKeyEnc: "", enabled: false });
    expect((await A.get("/agents").expect(200)).body[0]).toMatchObject({ isActive: false });
    await A.patch(`/agents/${agent.id}`, { isActive: true }).expect(200); // takes a seat again
    await A.get(`/agents/${agent.id}/runs`).expect(200);
    await api(t).get("/agents").expect(401);
    expect(a.workspaceId).toBeTruthy();
  });

  it("isolates agents between workspaces", async () => {
    const one = await setup("ag4");
    const two = await register(t, "ag5");
    const B = api(t, two.token);
    expect((await B.get("/agents").expect(200)).body).toEqual([]);
    await B.patch(`/agents/${one.agent.id}`, { name: "Чужой" }).expect(404);
    await B.del(`/agents/${one.agent.id}`).expect(404);
    await B.get(`/agents/${one.agent.id}/runs`).expect(404);
  });
});

describe("agents: working on cards", () => {
  it("reacts to an assignment: reads the card, uses tools and posts its answer", async () => {
    const { A, agent, card } = await setup("ag6");
    script = [
      () => ({ json: call("add_subtask", { text: "Собрать данные" }, "a1") }),
      () => ({ json: call("update_card", { priority: "HIGH", due_date: "2026-12-01", estimate_hours: 3 }, "a2") }),
      () => ({ json: call("move_card", { column: "В работе" }, "a3") }),
      () => ({ json: reply("Взялась за отчёт, срок поставила на 1 декабря.") }),
    ];
    await A.patch(`/cards/${card.id}`, { assigneeIds: [agent.id] }).expect(200);
    const [run] = await settled(agent.id);
    expect(run).toMatchObject({ status: "DONE", trigger: "ASSIGNED", steps: 4, inputTokens: 50 + 50 + 50 + 100, outputTokens: 10 + 10 + 10 + 20 });

    // what the model was shown
    expect(seen[0].headers.authorization).toBe("Bearer sk-test-secret-1234");
    expect(seen[0].path).toBe("/v1/chat/completions");
    const system = seen[0].body.messages[0].content as string;
    expect(system).toContain("Мария-бот");
    expect(system).toContain("Отвечай кратко");
    const first = seen[0].body.messages[1].content as string;
    expect(first).toContain("TSK-1: Сделать отчёт");
    expect(first).toContain("You were assigned");
    expect(first).toContain("Columns of the board: Бэклог | В работе");
    expect(seen[0].body.tools.map((x: any) => x.function.name)).toEqual(["add_comment", "move_card", "update_card", "add_subtask", "set_subtask_done", "search_cards"]);
    // tool results went back to the model
    expect(seen[1].body.messages.some((m: any) => m.role === "tool" && /subtask .* added/.test(m.content))).toBe(true);

    // what the agent did, as the agent
    const after = (await A.get(`/cards/${card.id}`).expect(200)).body;
    expect(after).toMatchObject({ priority: "HIGH", estimateHours: 3, column: { title: "В работе" } });
    expect(after.dueDate).toContain("2026-12-01");
    expect(after.checklist.map((i: { text: string }) => i.text)).toEqual(["Собрать данные"]);
    const last = after.comments.at(-1);
    expect(last).toMatchObject({ text: "Взялась за отчёт, срок поставила на 1 декабря.", author: { id: agent.id } });
    expect(after.activity.some((x: { action: string; user: { id: string } }) => x.action === "moved" && x.user.id === agent.id)).toBe(true);
    expect((await A.get(`/agents/${agent.id}/runs`).expect(200)).body[0]).toMatchObject({ status: "DONE", card: { id: card.id } });
  });

  it("answers a mention and posts through add_comment, mentioning a colleague by name", async () => {
    const { a, A, agent, card } = await setup("ag7");
    const admin = (await A.get("/users/me").expect(200)).body;
    script = [() => ({ json: call("add_comment", { text: `@${admin.name} готово`, mention: [admin.name] }) }), () => ({ json: reply("Это не должно дублироваться") })];
    await A.post(`/cards/${card.id}/comments`, { text: `@Мария-бот посмотри`, mentionIds: [agent.id] }).expect(201);
    await settled(agent.id);
    const comments = (await A.get(`/cards/${card.id}`).expect(200)).body.comments;
    expect(comments.map((c: { text: string }) => c.text)).toEqual([`@Мария-бот посмотри`, `@${admin.name} готово`]);
    expect(await t.db.notification.count({ where: { userId: a.userId, cardId: card.id, type: "MENTIONED" } })).toBe(1);
    expect(seen[0].body.messages[1].content).toContain("You were mentioned");
  });

  it("tells the model when a tool fails and lets it recover", async () => {
    const { A, agent, card } = await setup("ag8");
    script = [
      () => ({ json: call("move_card", { column: "Нет такой" }) }),
      () => ({ json: call("set_subtask_done", { id: "x", done: true }) }),
      () => ({ json: call("update_card", { due_date: "завтра" }) }),
      () => ({ json: call("no_such_tool", {}) }),
      () => ({ json: reply("Не получилось переместить, колонки: Бэклог, В работе.") }),
    ];
    await A.patch(`/cards/${card.id}`, { assigneeIds: [agent.id] });
    const [run] = await settled(agent.id);
    expect(run.status).toBe("DONE");
    const toolMessages = seen[4].body.messages.filter((m: any) => m.role === "tool").map((m: any) => m.content as string);
    expect(toolMessages[0]).toMatch(/^error: no such column\. Columns: Бэклог, В работе/);
    expect(toolMessages[1]).toContain("no such subtask");
    expect(toolMessages[2]).toContain("YYYY-MM-DD");
    expect(toolMessages[3]).toContain("unknown tool");
    expect((await A.get(`/cards/${card.id}`)).body.column.title).toBe("Бэклог"); // nothing moved
  });

  it("reports a broken model call on the card without leaking the key", async () => {
    const { A, agent, card } = await setup("ag9");
    script = [() => ({ status: 401, json: { error: { message: "Incorrect API key provided: sk-test-secret-1234" } } })];
    await A.patch(`/cards/${card.id}`, { assigneeIds: [agent.id] });
    const [run] = await settled(agent.id);
    expect(run.status).toBe("FAILED");
    const last = (await A.get(`/cards/${card.id}`)).body.comments.at(-1);
    expect(last.author.id).toBe(agent.id);
    expect(last.text).toContain("401");
    expect(last.text.startsWith("Не получилось ответить")).toBe(true);
  });

  it("stops after too many steps", async () => {
    const { A, agent, card } = await setup("ag10");
    script = Array.from({ length: 12 }, () => () => ({ json: call("search_cards", { query: "x" }) }));
    await A.patch(`/cards/${card.id}`, { assigneeIds: [agent.id] });
    const [run] = await settled(agent.id);
    expect(run).toMatchObject({ status: "FAILED", steps: 8 });
    expect(seen).toHaveLength(8);
  });

  it("follows the language of whoever triggered it", async () => {
    const { a, agent, card } = await setup("ag11");
    script = [() => ({ status: 500, json: { error: { message: "boom" } } })];
    await request(t.app.getHttpServer()).patch(`/cards/${card.id}`).set("Authorization", `Bearer ${a.token}`).set("X-Locale", "en").send({ assigneeIds: [agent.id] }).expect(200);
    await settled(agent.id);
    const comments = (await api(t, a.token).get(`/cards/${card.id}`).expect(200)).body.comments;
    expect(comments.at(-1).text).toMatch(/^Could not answer: 500/);
  });
});

describe("agents: token usage", () => {
  it("adds up tokens for today and the last 30 days, skipping runs that never reached the model", async () => {
    const { a, A, agent, card } = await setup("ag15");
    expect((await A.get("/agents").expect(200)).body[0].usage).toEqual({ today: { runs: 0, inputTokens: 0, outputTokens: 0 }, month: { runs: 0, inputTokens: 0, outputTokens: 0 } });

    script = [() => ({ json: reply("Привет") })];
    await A.patch(`/cards/${card.id}`, { assigneeIds: [agent.id] }).expect(200);
    await settled(agent.id); // 100 in, 20 out

    const make = (daysAgo: number, status: "DONE" | "SKIPPED", input: number, output: number) =>
      t.db.agentRun.create({ data: { workspaceId: a.workspaceId, agentId: agent.id, cardId: card.id, trigger: "COMMENTED", status, inputTokens: input, outputTokens: output, createdAt: new Date(Date.now() - daysAgo * 86_400_000 - 3_600_000) } });
    await make(5, "DONE", 1000, 200); // this month, not today
    await make(40, "DONE", 5000, 900); // too old
    await make(1, "SKIPPED", 777, 777); // never called the model

    const usage = (await A.get("/agents").expect(200)).body[0].usage;
    expect(usage.today).toEqual({ runs: 1, inputTokens: 100, outputTokens: 20 });
    expect(usage.month).toEqual({ runs: 2, inputTokens: 1100, outputTokens: 220 });
    // a single agent read (after an edit) carries the same numbers
    expect((await A.patch(`/agents/${agent.id}`, { name: "Новое" }).expect(200)).body.usage.month.runs).toBe(2);
  });

  it("keeps the numbers of one workspace out of another", async () => {
    const one = await setup("ag16");
    script = [() => ({ json: reply("ок") })];
    await one.A.patch(`/cards/${one.card.id}`, { assigneeIds: [one.agent.id] });
    await settled(one.agent.id);
    const other = await setup("ag17");
    expect((await other.A.get("/agents").expect(200)).body[0].usage.month.runs).toBe(0);
  });
});

describe("agents: limits and guards", () => {
  it("does nothing for disabled, deactivated, over-seat or locked agents", async () => {
    const { a, A, agent, card } = await setup("ag12");
    const wake = async () => {
      await A.patch(`/cards/${card.id}`, { assigneeIds: [] });
      await A.patch(`/cards/${card.id}`, { assigneeIds: [agent.id] });
    };
    await A.patch(`/agents/${agent.id}`, { enabled: false });
    await wake();
    let runs = await settled(agent.id);
    expect(runs.at(-1)).toMatchObject({ status: "SKIPPED", error: "агент выключен" });
    expect(seen).toHaveLength(0);

    await A.patch(`/agents/${agent.id}`, { enabled: true });
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { planId: "FREE", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null } });
    const hog = (n: number) => t.db.user.createMany({ data: Array.from({ length: n }, (_, i) => ({ workspaceId: a.workspaceId, email: `${unique("h")}${i}@iso.test`, name: `H${i}`, passwordHash: "x", createdAt: new Date(Date.now() - 86_400_000) })) });
    await hog(3); // the agent is now the newest of five users on a 3-seat plan
    t.app.get(BillingService).forgetSeats(a.workspaceId);
    await wake();
    runs = await settled(agent.id, 2);
    expect(runs.at(-1)).toMatchObject({ status: "SKIPPED", error: "нет оплаченного места" });

    // A locked workspace refuses the writes that would wake an agent, so ask the runner directly.
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { status: "LOCKED" } });
    await t.app.get(AgentRunner).enqueue({ workspaceId: a.workspaceId, agentId: agent.id, cardId: card.id, actorId: a.userId, type: "COMMENTED", text: "?", locale: "ru" });
    runs = await settled(agent.id, 3);
    expect(runs.at(-1)?.status).toBe("SKIPPED");
    expect(seen).toHaveLength(0);
  });

  it("limits runs per card per hour and per workspace per day", async () => {
    const { a, A, agent, card } = await setup("ag13");
    await t.db.agentRun.createMany({ data: Array.from({ length: 6 }, () => ({ workspaceId: a.workspaceId, agentId: agent.id, cardId: card.id, trigger: "ASSIGNED" as const, status: "DONE" as const })) });
    await A.patch(`/cards/${card.id}`, { assigneeIds: [agent.id] });
    const runs = await settled(agent.id, 7);
    expect(runs.at(-1)).toMatchObject({ status: "SKIPPED", error: "лимит запусков на одну карточку в час" });
    expect(seen).toHaveLength(0);
  });

  it("collapses events that arrive while a run is in progress into one more run", async () => {
    const { A, agent, card, a } = await setup("ag14");
    const runner = t.app.get(AgentRunner);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    script = [() => ({ json: reply("первый") }), () => ({ json: reply("второй") })];
    const origin = global.fetch;
    let first = true;
    jest.spyOn(global, "fetch").mockImplementation(async (...args) => {
      if (first) {
        first = false;
        await gate;
      }
      return origin(...args);
    });
    const ev = { workspaceId: a.workspaceId, agentId: agent.id, cardId: card.id, actorId: a.userId, type: "COMMENTED" as const, text: "раз", locale: "ru" as const };
    const done = runner.enqueue(ev);
    await new Promise((r) => setTimeout(r, 100));
    void runner.enqueue({ ...ev, text: "два" });
    void runner.enqueue({ ...ev, text: "три" });
    release();
    await done;
    (global.fetch as jest.Mock).mockRestore();
    const runs = await t.db.agentRun.findMany({ where: { agentId: agent.id } });
    expect(runs).toHaveLength(2); // the first, plus one for the two that waited
    expect(seen).toHaveLength(2);
    void A;
  });
});

describe("providers", () => {
  const base64 = (s: string) => Buffer.from(s).toString("base64");
  void base64;
  const spy = (json: unknown, status = 200) => jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(json), { status }));
  afterEach(() => jest.restoreAllMocks());
  const req = (provider: any, over: object = {}) => ({
    provider,
    model: "m",
    apiKey: "KEY",
    system: "SYS",
    messages: [
      { role: "user" as const, text: "hi" },
      { role: "assistant" as const, text: "calling", toolCalls: [{ id: "t1", name: "move_card", args: { column: "A" } }] },
      { role: "tool" as const, results: [{ id: "t1", name: "move_card", content: "ok" }] },
    ],
    tools: [{ name: "move_card", description: "d", parameters: { type: "object" as const, properties: { column: { type: "string" } } } }],
    maxTokens: 100,
    ...over,
  });

  it("speaks Anthropic's messages API", async () => {
    const f = spy({ content: [{ type: "text", text: "done" }, { type: "tool_use", id: "u1", name: "add_comment", input: { text: "x" } }], usage: { input_tokens: 7, output_tokens: 3 } });
    const res = await complete(req("ANTHROPIC"));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("KEY");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("SYS");
    expect(body.tools[0].input_schema.type).toBe("object");
    expect(body.messages[1].content[1]).toMatchObject({ type: "tool_use", id: "t1" });
    expect(body.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(res).toEqual({ text: "done", toolCalls: [{ id: "u1", name: "add_comment", args: { text: "x" } }], inputTokens: 7, outputTokens: 3 });
  });

  it("speaks OpenAI's chat completions, with the right token parameter", async () => {
    const f = spy({ choices: [{ message: { content: "hey", tool_calls: [{ id: "o1", function: { name: "add_subtask", arguments: '{"text":"y"}' } }, { id: "o2", function: { name: "x", arguments: "{broken" } }] } }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
    const res = await complete(req("OPENAI"));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.max_completion_tokens).toBe(100);
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages[2].tool_calls[0].function.arguments).toBe('{"column":"A"}');
    expect(body.messages[3]).toMatchObject({ role: "tool", tool_call_id: "t1" });
    expect(res.toolCalls).toEqual([{ id: "o1", name: "add_subtask", args: { text: "y" } }, { id: "o2", name: "x", args: {} }]);

    jest.restoreAllMocks();
    spy({ choices: [{ message: { content: "ok" } }] });
    await complete(req("OPENAI_COMPATIBLE", { baseUrl: "https://openrouter.ai/api/v1/" }));
    const [url2, init2] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url2).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(init2.body as string).max_tokens).toBe(100);
    await expect(complete(req("OPENAI_COMPATIBLE"))).rejects.toThrow("base URL is required");
  });

  it("speaks Google's generateContent", async () => {
    const f = spy({ candidates: [{ content: { parts: [{ text: "g" }, { functionCall: { name: "move_card", args: { column: "B" } } }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } });
    const res = await complete(req("GOOGLE", { model: "gemini x" }));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini%20x:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
    const body = JSON.parse(init.body as string);
    expect(body.contents[1]).toMatchObject({ role: "model" });
    expect(body.contents[2].parts[0].functionResponse.name).toBe("move_card");
    expect(res).toEqual({ text: "g", toolCalls: [{ id: "move_card-0", name: "move_card", args: { column: "B" } }], inputTokens: 9, outputTokens: 4 });
  });

  it("turns failures into short errors without the key", async () => {
    spy({ error: { message: "x".repeat(500) } }, 429);
    const err = await complete(req("OPENAI")).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(429);
    expect(err.message.length).toBeLessThan(320);
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED KEY"));
    expect((await complete(req("OPENAI")).catch((e) => e)).message).toBe("the model service is unreachable");
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    jest.spyOn(global, "fetch").mockRejectedValue(timeout);
    expect((await complete(req("GOOGLE")).catch((e) => e)).message).toContain("in time");
  });
});

describe("safety helpers", () => {
  it("refuses private addresses unless allowed for development", () => {
    const flag = process.env.AGENTS_ALLOW_PRIVATE_URLS;
    delete process.env.AGENTS_ALLOW_PRIVATE_URLS;
    try {
      for (const bad of ["http://api.example.com", "https://localhost/v1", "https://127.0.0.1/", "https://10.0.0.5/", "https://192.168.1.2/", "https://172.20.0.1/", "https://169.254.169.254/", "https://db.internal/", "https://[::1]/", "not a url"]) {
        expect(() => assertPublicUrl(bad)).toThrow(LlmError);
      }
      expect(assertPublicUrl("https://api.deepseek.com/v1").hostname).toBe("api.deepseek.com");
    } finally {
      process.env.AGENTS_ALLOW_PRIVATE_URLS = flag;
    }
    expect(assertPublicUrl("http://localhost:11434/v1").port).toBe("11434");
  });

  it("seals keys so that only this server can read them", () => {
    const sealed = seal("secret-key");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("secret-key");
    expect(open(sealed)).toBe("secret-key");
    expect(seal("secret-key")).not.toBe(sealed); // fresh nonce each time
    expect(() => open("v1:" + Buffer.from("garbage-garbage-garbage-garbage-garbage").toString("base64"))).toThrow();
    expect(() => open("plain")).toThrow();
  });
});
