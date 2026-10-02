// Custom card fields (Business). Run from apps/api with the API running:
//   pnpm exec ts-node --transpile-only test/fields.ts
import { PrismaClient } from "@prisma/client";

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
  return { status: res.status, body: json };
}
function check(name: string, ok: boolean, extra = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${extra}`}`);
}
const register = async (tag: string) => {
  const email = `${tag}-${run}@iso.test`;
  const r = await call(null, "POST", "/auth/register", { workspaceName: tag, name: tag, email, password: "password-123" });
  return { token: r.body.accessToken as string, email, workspaceId: (await db.user.findUniqueOrThrow({ where: { email } })).workspaceId };
};
const plan = (workspaceId: string, planId: string) =>
  db.subscription.update({ where: { workspaceId }, data: { planId, status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } });

async function main() {
  const a = await register("fields-a");
  const b = await register("fields-b");
  const p = (await call(a.token, "POST", "/projects", { title: "P" })).body;
  const board = (await call(a.token, "GET", `/projects/${p.id}/board`)).body;
  const card = (await call(a.token, "POST", "/cards", { columnId: board.columns[0].id, title: "Карточка" })).body;

  check("locked on the trial plan (402)", (await call(a.token, "POST", "/fields", { name: "Бюджет", type: "NUMBER" })).status === 402);
  check("definitions can be read on any plan", (await call(a.token, "GET", "/fields")).status === 200);

  await plan(a.workspaceId, "BUSINESS");
  const mk = async (name: string, type: string, options?: string[]) => (await call(a.token, "POST", "/fields", { name, type, options })).body;
  const budget = await mk("Бюджет", "NUMBER");
  const text = await mk("Заметка", "TEXT");
  const when = await mk("Дата сдачи", "DATE");
  const stage = await mk("Этап", "SELECT", ["Идея", "В разработке", "Готово", "Идея"]);
  const flag = await mk("Согласовано", "CHECKBOX");
  check("five fields created", [budget, text, when, stage, flag].every((f) => f?.id));
  check("select options are cleaned and de-duplicated", stage.options.join() === "Идея,В разработке,Готово", JSON.stringify(stage.options));
  check("duplicate name rejected (409)", (await call(a.token, "POST", "/fields", { name: "бюджет", type: "TEXT" })).status === 409);
  check("select without options rejected", (await call(a.token, "POST", "/fields", { name: "Пустой", type: "SELECT", options: [] })).status === 400);
  check("unknown type rejected", (await call(a.token, "POST", "/fields", { name: "X", type: "FILE" })).status === 400);

  const put = (fieldId: string, value: unknown, token = a.token, cardId = card.id) => call(token, "PUT", `/cards/${cardId}/fields/${fieldId}`, { value });
  check("number saved", (await put(budget.id, 1500.5)).status === 204);
  check("text saved", (await put(text.id, "Привет")).status === 204);
  check("date saved", (await put(when.id, "2026-12-31")).status === 204);
  check("select saved", (await put(stage.id, "Готово")).status === 204);
  check("checkbox saved", (await put(flag.id, true)).status === 204);
  check("text into a number field rejected", (await put(budget.id, "много")).status === 400);
  check("bad date rejected", (await put(when.id, "31.12.2026")).status === 400);
  check("option outside the list rejected", (await put(stage.id, "Другое")).status === 400);
  check("number into a checkbox rejected", (await put(flag.id, 1)).status === 400);

  let detail = (await call(a.token, "GET", `/cards/${card.id}`)).body;
  const val = (id: string) => detail.fieldValues.find((v: any) => v.fieldId === id)?.value;
  check("card detail returns the values", val(budget.id) === 1500.5 && val(text.id) === "Привет" && val(when.id) === "2026-12-31" && val(stage.id) === "Готово" && val(flag.id) === true, JSON.stringify(detail.fieldValues));
  check("clearing removes the value", (await put(text.id, null)).status === 204 && !(await call(a.token, "GET", `/cards/${card.id}`)).body.fieldValues.some((v: any) => v.fieldId === text.id));

  // Other workspace.
  check("B doesn't see A's fields", (await call(b.token, "GET", "/fields")).body.length === 0);
  await plan(b.workspaceId, "BUSINESS");
  check("B can't set a value on A's card (404)", (await put(budget.id, 1, b.token)).status === 404);
  const bp = (await call(b.token, "POST", "/projects", { title: "B" })).body;
  const bBoard = (await call(b.token, "GET", `/projects/${bp.id}/board`)).body;
  const bCard = (await call(b.token, "POST", "/cards", { columnId: bBoard.columns[0].id, title: "B" })).body;
  check("B can't use A's field on its own card (404)", (await put(budget.id, 1, b.token, bCard.id)).status === 404);
  check("B can't rename A's field", (await call(b.token, "PATCH", `/fields/${budget.id}`, { name: "x" })).status === 404);
  check("B can't delete A's field", (await call(b.token, "DELETE", `/fields/${budget.id}`)).status === 404);

  // Permissions: a member without fields.manage sets values but can't define fields.
  const inv = await call(a.token, "POST", "/invitations", { email: `member-${run}@iso.test` });
  const joined = await call(null, "POST", "/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "Сотрудник", password: "password-123" });
  const m = joined.body.accessToken as string;
  check("member can't define fields (403)", (await call(m, "POST", "/fields", { name: "Свой", type: "TEXT" })).status === 403);
  check("member can set values", (await put(budget.id, 2000, m)).status === 204);

  // Rename / options.
  check("rename works", (await call(a.token, "PATCH", `/fields/${budget.id}`, { name: "Бюджет, ₽" })).body.name === "Бюджет, ₽");
  check("options editable", (await call(a.token, "PATCH", `/fields/${stage.id}`, { options: ["Старт", "Финиш"] })).body.options.join() === "Старт,Финиш");

  // Downgrade: values stay readable, writing is locked again.
  await plan(a.workspaceId, "FREE");
  check("after downgrade the values are still shown", (await call(a.token, "GET", `/cards/${card.id}`)).body.fieldValues.length >= 4);
  check("after downgrade writing is locked (402)", (await put(budget.id, 3)).status === 402);

  await plan(a.workspaceId, "BUSINESS");
  check("deleting a field removes it and its values", (await call(a.token, "DELETE", `/fields/${budget.id}`)).status === 204 && !(await call(a.token, "GET", `/cards/${card.id}`)).body.fieldValues.some((v: any) => v.fieldId === budget.id));

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll custom field checks passed");
}

main().catch((e) => { console.error(e); failed++; }).finally(async () => { await db.$disconnect(); process.exit(failed ? 1 : 0); });
