// Audit log and CSV export (Business). Run from apps/api with the API running:
//   pnpm exec ts-node --transpile-only test/audit-export.ts
import { PrismaClient } from "@prisma/client";
import { csvCell } from "../src/export/export.controller";

const API = process.env.API_URL ?? "http://localhost:3101";
const db = new PrismaClient();
const run = Date.now().toString(36);
let failed = 0;

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = text;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json, text, type: res.headers.get("content-type") ?? "" };
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
const plan = (workspaceId: string, planId: string) =>
  db.subscription.update({ where: { workspaceId }, data: { planId, status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });

async function main() {
  const a = await register("audit-a");
  const b = await register("audit-b");

  // CSV cell escaping.
  check("csv: plain text untouched", csvCell("Привет") === "Привет");
  check("csv: quotes, semicolons and newlines are quoted", csvCell('a;"b"\nc') === '"a;""b""\nc"');
  check("csv: formula injection is defused", csvCell("=SUM(1)") === "'=SUM(1)" && csvCell("+1") === "'+1" && csvCell("@x") === "'@x" && csvCell("-5") === "'-5");
  check("csv: numbers and empty values", csvCell(0) === "0" && csvCell(null) === "" && csvCell(undefined) === "");

  // Gate on the trial plan.
  const p = (await call(a.token, "POST", "/projects", { title: "Экспорт" })).body;
  check("export locked off Business (402)", (await call(a.token, "GET", `/projects/${p.id}/export.csv`)).status === 402);
  check("audit locked off Business (402)", (await call(a.token, "GET", "/audit")).status === 402);

  await plan(a.workspaceId, "BUSINESS");
  await plan(b.workspaceId, "BUSINESS");

  // Data to export.
  const board = (await call(a.token, "GET", `/projects/${p.id}/board`)).body;
  const field = (await call(a.token, "POST", "/fields", { name: "Бюджет", type: "NUMBER" })).body;
  const label = (await call(a.token, "POST", "/labels", { name: "Срочно", color: "red" })).body;
  const card = (await call(a.token, "POST", "/cards", { columnId: board.columns[0].id, title: "=cmd|calc", description: "Строка 1\nСтрока 2; с запятой" })).body;
  await call(a.token, "PATCH", `/cards/${card.id}`, { startDate: "2026-10-05", dueDate: "2026-10-09", labelIds: [label.id], estimateHours: 4 });
  await call(a.token, "PUT", `/cards/${card.id}/fields/${field.id}`, { value: 1500 });
  await call(a.token, "POST", `/cards/${card.id}/time`, { minutes: 90, date: "2026-10-06" });

  const csv = await call(a.token, "GET", `/projects/${p.id}/export.csv`);
  const raw = new Uint8Array(await (await fetch(`${API}/projects/${p.id}/export.csv`, { headers: { authorization: `Bearer ${a.token}` } })).arrayBuffer());
  check("export returns CSV with a UTF-8 BOM", csv.status === 200 && csv.type.includes("text/csv") && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, csv.type);
  const rows = csv.text.replace("﻿", "").trim().split("\r\n");
  check("header has the custom field column", rows[0].endsWith(";Бюджет") && rows[0].startsWith("Ключ;Название"), rows[0]);
  check("title formula is neutralised", csv.text.includes("'=cmd|calc"));
  check("multiline description is quoted", csv.text.includes('"Строка 1\nСтрока 2; с запятой"'));
  check("dates, label, hours, minutes and field value present", csv.text.includes(";Срочно;2026-10-05;2026-10-09;4;90;") && csv.text.trimEnd().endsWith(";1500"), csv.text.slice(-200));
  check("other workspace can't export A's project (404)", (await call(b.token, "GET", `/projects/${p.id}/export.csv`)).status === 404);

  // Audit.
  await call(a.token, "PATCH", `/projects/${p.id}`, { title: "Экспорт 2" });
  await call(a.token, "POST", "/roles", { name: "Менеджер", permissions: [] });
  await call(a.token, "POST", "/invitations", { email: `inv-${run}@iso.test` });
  await call(a.token, "DELETE", `/cards/${card.id}`);
  const log = await call(a.token, "GET", "/audit");
  const actions = (log.body.items as any[]).map((i) => i.action);
  for (const want of ["project.create", "project.update", "role.create", "invitation.create", "card.delete", "field.create", "export.project"]) {
    check(`journal has ${want}`, actions.includes(want), actions.join());
  }
  check("entries carry the author", (log.body.items as any[]).every((i) => i.user?.name === "audit-a"));
  check("newest first", (log.body.items as any[]).every((it, k, arr) => k === 0 || arr[k - 1].createdAt >= it.createdAt));
  check("group filter works", (await call(a.token, "GET", "/audit?group=role")).body.items.every((i: any) => i.action.startsWith("role.")));
  check("B's journal doesn't contain A's entries", (await call(b.token, "GET", "/audit")).body.items.length === 0);

  // Pagination.
  for (let i = 0; i < 55; i++) await db.auditLog.create({ data: { workspaceId: a.workspaceId, action: "test.bulk", summary: `n${i}` } });
  const page1 = (await call(a.token, "GET", "/audit")).body;
  check("page of 50 with a cursor", page1.items.length === 50 && !!page1.next);
  const page2 = (await call(a.token, "GET", `/audit?before=${page1.next}`)).body;
  check("second page continues without overlap", page2.items.length > 0 && !page2.items.some((i: any) => page1.items.some((j: any) => j.id === i.id)));

  // Permission: member without audit.view.
  const inv = await call(a.token, "POST", "/invitations", { email: `m-${run}@iso.test` });
  const m = (await call(null, "POST", "/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken;
  check("member without audit.view gets 403", (await call(m, "GET", "/audit")).status === 403);

  // Downgrade keeps history but locks reading.
  await plan(a.workspaceId, "FREE");
  check("after downgrade the journal is locked (402)", (await call(a.token, "GET", "/audit")).status === 402);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll audit/export checks passed");
}

main().catch((e) => { console.error(e); failed++; }).finally(async () => { await db.$disconnect(); process.exit(failed ? 1 : 0); });
