import { writeFileSync } from "fs";
import { join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { BoardsService } from "../src/boards/boards.service";
import { SystemPrismaService } from "../src/prisma/system-prisma.service";
import { runInWorkspace } from "../src/prisma/tenant";
import { createApp, register, setPlan, type Account, type TestApp } from "../test/helpers/app";
import { FULL, fillWorkspace, type SeedSize, type Tenant } from "./seed";

// Times the API on a large database. Run with `pnpm bench`; the report goes to
// the console and to bench/last-run.md.

let t: TestApp;
let big: Account;
let tenant: Tenant;
let member: { id: string; token: string };
const queries: { sql: string; ms: number; params: string }[] = [];
const report: string[] = [];
const rows: string[][] = [];

const med = (xs: number[]) => xs[Math.floor(xs.length / 2)];
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];

async function ensureData() {
  const probe = new PrismaClient();
  try {
    const existing = await probe.workspace.findFirst({ where: { name: "BENCH-BIG" } });
    if (existing) {
      const admin = await probe.user.findFirstOrThrow({ where: { workspaceId: existing.id, role: "ADMIN" } });
      return { existing, admin };
    }
  } finally {
    await probe.$disconnect();
  }
  return null;
}

beforeAll(async () => {
  t = await createApp();
  const sys = t.app.get(SystemPrismaService) as unknown as { $on: (e: string, fn: (q: { query: string; duration: number; params: string }) => void) => void };
  sys.$on("query", (q) => queries.push({ sql: q.query, ms: q.duration, params: q.params }));

  const found = await ensureData();
  if (found) {
    // Sign in again as the existing admin.
    const login = await request(t.app.getHttpServer()).post("/auth/login").send({ email: found.admin.email, password: "password-123" }).expect(201);
    big = { token: login.body.accessToken, email: found.admin.email, password: "password-123", workspaceId: found.existing.id, userId: found.admin.id };
    const projects = await t.db.project.findMany({ where: { workspaceId: big.workspaceId }, include: { board: { include: { columns: { orderBy: { position: "asc" } } } } }, orderBy: { createdAt: "asc" } });
    const cards = await t.db.card.findMany({ where: { workspaceId: big.workspaceId }, select: { id: true, projectId: true } });
    const byProject = new Map<string, string[]>();
    for (const c of cards) byProject.set(c.projectId, [...(byProject.get(c.projectId) ?? []), c.id]);
    const users = await t.db.user.findMany({ where: { workspaceId: big.workspaceId }, orderBy: { createdAt: "asc" } });
    tenant = {
      workspaceId: big.workspaceId,
      adminId: big.userId,
      userIds: users.map((u) => u.id),
      labelIds: [],
      projects: projects.map((p) => ({ id: p.id, columns: p.board!.columns.map((c) => c.id), cards: byProject.get(p.id) ?? [] })),
    };
    console.log(`Using the existing benchmark data (${cards.length} cards). BENCH_RESET=1 rebuilds it.`);
  } else {
    const started = Date.now();
    const size: SeedSize = process.env.BENCH_SMALL === "1" ? { members: 9, projects: 12, megaCards: 300, bigProjects: 2, bigProjectCards: 80, regularCards: 20, tenants: 3 } : FULL;
    big = await register(t, "BIG");
    await t.db.workspace.update({ where: { id: big.workspaceId }, data: { name: "BENCH-BIG" } });
    tenant = await fillWorkspace(t.db, big.workspaceId, big.userId, size);
    // Other workspaces share the tables: indexes must stay selective.
    for (let i = 0; i < size.tenants; i++) {
      const other = await register(t, `tenant${i}`);
      await fillWorkspace(t.db, other.workspaceId, other.userId, { members: 5, projects: 8, megaCards: 150, bigProjects: 1, bigProjectCards: 100, regularCards: 60, tenants: 0 });
    }
    await t.db.$executeRawUnsafe("ANALYZE");
    console.log(`Seeded in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  await setPlan(t, big.workspaceId, "BUSINESS");
  const m = await t.db.user.findFirstOrThrow({ where: { id: tenant.userIds[1] } });
  const login = await request(t.app.getHttpServer()).post("/auth/login").send({ email: m.email, password: "password-123" }).expect(201);
  member = { id: m.id, token: login.body.accessToken };
}, 1_800_000);

afterAll(async () => {
  const counts = await t.db.$queryRawUnsafe<{ t: string; n: bigint }[]>(
    `SELECT relname AS t, n_live_tup AS n FROM pg_stat_user_tables WHERE relname IN ('Card','Comment','ActivityLog','AuditLog','ChecklistItem','CardAssignee','Notification','TimeEntry','Project','User') ORDER BY n_live_tup DESC`,
  );
  const size = await t.db.$queryRawUnsafe<{ s: string }[]>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`);
  const head = ["# Benchmark", "", `Database: ${size[0].s}. Rows: ${counts.map((c) => `${c.t} ${Number(c.n)}`).join(", ")}.`, "", "| Request | median ms | p90 ms | max ms | SQL | DB ms | JSON KB | gzip KB |", "|---|---:|---:|---:|---:|---:|---:|---:|"];
  const text = [...head, ...rows.map((r) => `| ${r.join(" | ")} |`), "", ...report].join("\n");
  writeFileSync(join(__dirname, "last-run.md"), text + "\n");
  console.log("\n" + text);
  await t.close();
});

// Like a browser: asks for gzip and does not parse the body, so the time is the
// server's (plus the unavoidable in-process transfer), not the test client's.
interface Res {
  status: number;
  wire: Buffer;
}
const send = (method: "get" | "post" | "patch", path: string, token: string, body?: object): Promise<Res> =>
  new Promise((resolve, reject) => {
    const req = request(t.app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`).set("Accept-Encoding", "gzip").buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    (body ? req.send(body) : req).then((res) => resolve({ status: res.status, wire: res.body as Buffer }), reject);
  });
const plain = (res: Res) => {
  try {
    return gunzipSync(res.wire);
  } catch {
    return res.wire; // small replies are not compressed
  }
};

interface Scenario {
  name: string;
  runs?: number;
  who?: "admin" | "member";
  call: (ctx: { token: string; userId: string; i: number }) => Promise<Res>;
}

async function measure(s: Scenario) {
  const who = s.who === "member" ? member : { token: big.token, id: big.userId };
  const runs = s.runs ?? 15;
  const call = (i: number) => s.call({ token: who.token, userId: who.id, i });
  await call(-1);
  await call(-2);
  const wall: number[] = [];
  let sql = 0;
  let db = 0;
  let wireBytes = 0;
  for (let i = 0; i < runs; i++) {
    queries.length = 0;
    const start = process.hrtime.bigint();
    const res = await call(i);
    wall.push(Number(process.hrtime.bigint() - start) / 1e6);
    if (res.status >= 400) throw new Error(`${s.name}: ${res.status} ${plain(res).toString().slice(0, 200)}`);
    sql += queries.length;
    db += queries.reduce((n, q) => n + q.ms, 0);
    if (i === 0) wireBytes = res.wire.length;
  }
  wall.sort((a, b) => a - b);
  const jsonBytes = plain(await call(0)).length;
  const slowest = [...queries].sort((a, b) => b.ms - a.ms).slice(0, 3);
  rows.push([s.name, med(wall).toFixed(0), pct(wall, 0.9).toFixed(0), wall[wall.length - 1].toFixed(0), String(Math.round(sql / runs)), (db / runs).toFixed(0), (jsonBytes / 1024).toFixed(0), (wireBytes / 1024).toFixed(0)]);
  if (med(wall) > 50) {
    let plan = "";
    try {
      const top = slowest[0];
      const lines = await t.db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN (ANALYZE, BUFFERS) ${top.sql}`, ...(JSON.parse(top.params) as unknown[]));
      plan = lines.map((l) => l["QUERY PLAN"]).filter((l) => /Scan|Execution Time|Sort|Hash Join|Planning/.test(l)).slice(0, 8).map((l) => "    " + l.trim().slice(0, 150)).join("\n");
    } catch {
      plan = "    (plan not available)";
    }
    report.push(`**${s.name}** — slowest SQL: ` + slowest.map((q) => `${q.ms} ms \`${q.sql.replace(/\s+/g, " ").slice(0, 110)}…\``).join("; ") + "\n\n  Plan of the slowest:\n\n```\n" + plan + "\n```");
  }
}

const get = (path: string) => (c: { token: string }) => send("get", path, c.token);
const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

describe("benchmark", () => {
  it("page loads", async () => {
    const proj = (i: number) => tenant.projects[Math.min(i, tenant.projects.length - 1)];
    const mega = () => proj(0);
    const regular = () => proj(40);
    const scenarios: Scenario[] = [
      { name: "GET /users/me", runs: 40, call: get("/users/me") },
      { name: "GET /settings", runs: 30, call: get("/settings") },
      { name: "GET /billing", runs: 30, call: get("/billing") },
      { name: "GET /users (60 people)", call: get("/users") },
      { name: "GET /labels", runs: 30, call: get("/labels") },
      { name: "GET /notifications", call: get("/notifications") },
      { name: "GET /projects?status=ACTIVE (120)", call: get("/projects?status=ACTIVE") },
      { name: "GET /projects (150)", call: get("/projects") },
      { name: "GET /team-board?assigneeId=admin (urgent counter, ~2000 cards)", call: (c) => send("get", `/team-board?assigneeId=${c.userId}`, c.token) },
      { name: "GET /team-board?assigneeId=member (~500 cards)", who: "member", call: (c) => send("get", `/team-board?assigneeId=${c.userId}`, c.token) },
      { name: "GET /team-board (everything active)", runs: 6, call: get("/team-board") },
      { name: "GET board, regular project (100 cards)", call: (c) => send("get", `/projects/${regular().id}/board`, c.token) },
      { name: "GET board, big project (800 cards)", call: (c) => send("get", `/projects/${proj(1).id}/board`, c.token) },
      { name: "GET board, mega project (3000 cards)", runs: 10, call: (c) => send("get", `/projects/${mega().id}/board`, c.token) },
      { name: "GET /projects/:mega/dependencies", call: (c) => send("get", `/projects/${mega().id}/dependencies`, c.token) },
      { name: "GET /cards/search?q=платёж", call: get("/cards/search?q=" + encodeURIComponent("платёж")) },
      { name: "GET /cards/search?q=TSK-1500", call: get("/cards/search?q=TSK-1500") },
      { name: "GET /cards/:id (with 6 comments)", call: async (c) => send("get", `/cards/${(await t.db.comment.findFirstOrThrow({ select: { cardId: true }, where: { card: { workspaceId: big.workspaceId } } })).cardId}`, c.token) },
      { name: "GET /reports/time (30 days)", call: get(`/reports/time?from=${monthAgo}&to=${today}`) },
      { name: "GET /audit", call: get("/audit") },
      { name: "GET /projects/:mega/export.csv (3000 cards)", runs: 6, call: (c) => send("get", `/projects/${mega().id}/export.csv`, c.token) },
    ];
    for (const s of scenarios) await measure(s);
  });

  it("writes", async () => {
    const p = () => tenant.projects[Math.min(41, tenant.projects.length - 1)];
    const scenarios: Scenario[] = [
      { name: "POST /cards", call: (c) => send("post", "/cards", c.token, { columnId: p().columns[0], title: `Замер ${c.i}` }) },
      { name: "PATCH /cards/:id (title)", call: (c) => send("patch", `/cards/${p().cards[c.i < 0 ? 0 : c.i]}`, c.token, { title: `Новое имя ${c.i}` }) },
      { name: "POST /cards/:id/move", call: (c) => send("post", `/cards/${p().cards[5]}/move`, c.token, { columnId: p().columns[c.i % 2 ? 1 : 2] }) },
      { name: "POST /cards/:id/comments", call: (c) => send("post", `/cards/${p().cards[6]}/comments`, c.token, { text: `комментарий ${c.i}` }) },
    ];
    for (const s of scenarios) await measure(s);
  });

  it("a page load and parallel users", async () => {
    // What the app fires when you open the dashboard (all at once).
    const load = () =>
      Promise.all(
        ["/users/me", "/settings", "/billing", "/users", `/team-board?assigneeId=${big.userId}`, "/projects?status=ACTIVE", "/notifications", "/labels"].map((path) => send("get", path, big.token)),
      );
    await load();
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const s = process.hrtime.bigint();
      await load();
      times.push(Number(process.hrtime.bigint() - s) / 1e6);
    }
    times.sort((a, b) => a - b);
    report.push(`**Opening the dashboard** (8 requests in parallel, one user): median ${med(times).toFixed(0)} ms, p90 ${pct(times, 0.9).toFixed(0)} ms.`);

    for (const n of [10, 30]) {
      const start = process.hrtime.bigint();
      await Promise.all(Array.from({ length: n }, (_, i) => (i % 2 ? (send("get", `/projects/${tenant.projects[1 + (i % Math.min(9, tenant.projects.length - 1))].id}/board`, member.token)) : (send("get", `/team-board?assigneeId=${big.userId}`, big.token)))));
      const total = Number(process.hrtime.bigint() - start) / 1e6;
      report.push(`**${n} heavy requests at once** (boards of 800 cards and the urgent counter): ${total.toFixed(0)} ms in total (${(total / n).toFixed(0)} ms per request on average).`);
    }
  });

  it("where the time goes: query, assembling, JSON, gzip", async () => {
    const boards = t.app.get(BoardsService);
    const layers = async (name: string, fn: () => Promise<unknown>) => {
      await runInWorkspace(big.workspaceId, fn, big.userId);
      const q: number[] = [];
      const j: number[] = [];
      const z: number[] = [];
      let size = 0;
      for (let i = 0; i < 8; i++) {
        queries.length = 0;
        let s0 = process.hrtime.bigint();
        const data = await runInWorkspace(big.workspaceId, fn, big.userId);
        q.push(Number(process.hrtime.bigint() - s0) / 1e6);
        s0 = process.hrtime.bigint();
        const json = JSON.stringify(data);
        j.push(Number(process.hrtime.bigint() - s0) / 1e6);
        s0 = process.hrtime.bigint();
        gzipSync(json);
        z.push(Number(process.hrtime.bigint() - s0) / 1e6);
        size = json.length;
      }
      const m = (xs: number[]) => med([...xs].sort((a, b) => a - b)).toFixed(0);
      report.push(`**Layers, ${name}** (${(size / 1024).toFixed(0)} KB JSON): service ${m(q)} ms (of which SQL ${(queries.reduce((n, x) => n + x.ms, 0)).toFixed(0)} ms in the last run), JSON.stringify ${m(j)} ms, gzip ${m(z)} ms.`);
    };
    await layers("urgent counter (team board of the admin)", () => boards.team(big.userId, big.userId));
    await layers("mega project board (3000 cards)", () => boards.getByProject(tenant.projects[0].id, big.userId));
  });
});
