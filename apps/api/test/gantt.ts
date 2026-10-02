// Gantt data (start dates, dependencies) and the Business gate.
//   pnpm exec ts-node --transpile-only test/gantt.ts   (from apps/api, API running)
import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:3101";
const db = new PrismaClient();
const run = Date.now().toString(36);
let failed = 0;

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = text;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json };
}
function check(name: string, ok: boolean, extra = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${extra}`}`);
}
const register = async (tag: string) => {
  const email = `${tag}-${run}@iso.test`;
  const r = await call(null, "POST", "/auth/register", { workspaceName: tag, name: tag, email, password: "password-123" });
  return { token: r.body.accessToken as string, workspaceId: (await db.user.findUniqueOrThrow({ where: { email } })).workspaceId };
};

async function main() {
  const a = await register("gantt-a");
  const b = await register("gantt-b");
  const mk = async (token: string, title: string) => {
    const p = (await call(token, "POST", "/projects", { title })).body;
    const board = (await call(token, "GET", `/projects/${p.id}/board`)).body;
    const col = board.columns[0].id;
    const cards = [];
    for (const t of ["A", "B", "C"]) cards.push((await call(token, "POST", "/cards", { columnId: col, title: t })).body);
    return { project: p, cards };
  };
  const pa = await mk(a.token, "P1");
  const pa2 = await mk(a.token, "P2");
  const pb = await mk(b.token, "Other");
  const [c1, c2, c3] = pa.cards;

  // Gate: trial counts as Pro (no gantt), so locked until Business.
  check("Gantt data locked on the trial plan (402)", (await call(a.token, "GET", `/projects/${pa.project.id}/dependencies`)).status === 402);
  check("creating a dependency locked too (402)", (await call(a.token, "POST", `/cards/${c2.id}/dependencies`, { dependsOnId: c1.id })).status === 402);

  // Start dates are a plain card field on every plan.
  const set = await call(a.token, "PATCH", `/cards/${c1.id}`, { startDate: "2026-10-05", dueDate: "2026-10-09" });
  check("start and due dates are saved", set.status === 200 && set.body.startDate?.startsWith("2026-10-05") && set.body.dueDate?.startsWith("2026-10-09"), JSON.stringify(set.body));
  check("start after due is rejected", (await call(a.token, "PATCH", `/cards/${c1.id}`, { startDate: "2026-10-20" })).status === 400);
  check("moving due before the stored start is rejected", (await call(a.token, "PATCH", `/cards/${c1.id}`, { dueDate: "2026-10-01" })).status === 400);
  check("start can be cleared", (await call(a.token, "PATCH", `/cards/${c3.id}`, { startDate: "2026-10-05" })).status === 200 && (await call(a.token, "PATCH", `/cards/${c3.id}`, { startDate: null })).body.startDate === null);

  // Business.
  await db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { planId: "BUSINESS", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });
  const dep = await call(a.token, "POST", `/cards/${c2.id}/dependencies`, { dependsOnId: c1.id });
  check("Business: dependency created", dep.status === 201, JSON.stringify(dep.body));
  check("repeating it is harmless", (await call(a.token, "POST", `/cards/${c2.id}/dependencies`, { dependsOnId: c1.id })).status === 201);
  check("chain C -> B is allowed", (await call(a.token, "POST", `/cards/${c3.id}/dependencies`, { dependsOnId: c2.id })).status === 201);
  check("self dependency rejected", (await call(a.token, "POST", `/cards/${c1.id}/dependencies`, { dependsOnId: c1.id })).status === 400);
  check("direct cycle rejected", (await call(a.token, "POST", `/cards/${c1.id}/dependencies`, { dependsOnId: c2.id })).status === 400);
  check("indirect cycle rejected", (await call(a.token, "POST", `/cards/${c1.id}/dependencies`, { dependsOnId: c3.id })).status === 400);
  check("other project's card rejected", (await call(a.token, "POST", `/cards/${c1.id}/dependencies`, { dependsOnId: pa2.cards[0].id })).status === 400);
  check("other workspace's card rejected", (await call(a.token, "POST", `/cards/${c1.id}/dependencies`, { dependsOnId: pb.cards[0].id })).status === 404);
  const list = (await call(a.token, "GET", `/projects/${pa.project.id}/dependencies`)).body;
  check("list returns the 2 links of the project", list.length === 2 && list.some((d: any) => d.cardId === c2.id && d.dependsOnId === c1.id), JSON.stringify(list));
  check("other project lists none", (await call(a.token, "GET", `/projects/${pa2.project.id}/dependencies`)).body.length === 0);
  check("other workspace can't read A's links", (await call(b.token, "GET", `/projects/${pa.project.id}/dependencies`)).status === 402 || (await call(b.token, "GET", `/projects/${pa.project.id}/dependencies`)).body.length === 0);
  check("other workspace can't delete A's link", (await call(b.token, "DELETE", `/cards/${c2.id}/dependencies/${c1.id}`)).status !== 204 || (await call(a.token, "GET", `/projects/${pa.project.id}/dependencies`)).body.length === 2);
  check("link removal", (await call(a.token, "DELETE", `/cards/${c3.id}/dependencies/${c2.id}`)).status === 204 && (await call(a.token, "GET", `/projects/${pa.project.id}/dependencies`)).body.length === 1);
  await call(a.token, "DELETE", `/cards/${c1.id}`);
  check("deleting a card removes its links", (await call(a.token, "GET", `/projects/${pa.project.id}/dependencies`)).body.length === 0);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll Gantt checks passed");
}

main().catch((e) => { console.error(e); failed++; }).finally(async () => { await db.$disconnect(); process.exit(failed ? 1 : 0); });
