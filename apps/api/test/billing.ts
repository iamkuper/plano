// Billing check against a running API with the test payment provider
// (no TBANK_* env). Uses HTTP for what a customer does and the DB plus
// BillingService.runDue() for time travel.
//   pnpm --filter @amo-kanban/api exec ts-node --transpile-only test/billing.ts
import { PrismaClient } from "@prisma/client";
import { BillingService } from "../src/billing/billing.service";
import { MockProvider, mockNotification } from "../src/billing/mock.provider";
import { tbankToken } from "../src/billing/tbank.provider";

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

async function main() {
  const email = `bill-${run}@iso.test`;
  const reg = await call(null, "POST", "/auth/register", { workspaceName: "Биллинг", name: "Б", email, password: "password-123" });
  const t = reg.body.accessToken as string;
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const ws = user.workspaceId;

  // Trial.
  let o = (await call(t, "GET", "/billing")).body;
  check("new workspace is on a Pro trial", o.plan.id === "PRO" && o.subscription.status === "TRIALING" && !!o.subscription.trialEndsAt);
  check("test provider is reported", o.testMode === true);
  check("3 plans listed", o.plans.length === 3);

  // Trial expires -> FREE limits apply.
  await db.subscription.update({ where: { workspaceId: ws }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
  o = (await call(t, "GET", "/billing")).body;
  check("expired trial counts as Free", o.plan.id === "FREE");
  for (let i = 1; i <= 3; i++) await call(t, "POST", "/projects", { title: `P${i}` });
  check("4th project blocked (402)", (await call(t, "POST", "/projects", { title: "P4" })).status === 402);
  const proj = (await call(t, "GET", "/projects")).body[0];
  const board = (await call(t, "GET", `/projects/${proj.id}/board`)).body;
  const card = (await call(t, "POST", "/cards", { columnId: board.columns[0].id, title: "c" })).body;
  check("time entry blocked on Free", (await call(t, "POST", `/cards/${card.id}/time`, { minutes: 10, date: "2026-01-01" })).status === 402);
  check("time report blocked on Free", (await call(t, "GET", "/reports/time?from=2026-01-01&to=2026-12-31")).status === 402);
  check("custom role blocked on Free", (await call(t, "POST", "/roles", { name: "R", permissions: [] })).status === 402);
  for (let i = 1; i <= 2; i++) await call(t, "POST", "/users", { email: `m${i}-${run}@iso.test`, name: `M${i}`, password: "password-123" });
  check("4th user blocked on Free", (await call(t, "POST", "/users", { email: `m3-${run}@iso.test`, name: "M3", password: "password-123" })).status === 402);

  // Checkout validation.
  check("checkout of FREE rejected", (await call(t, "POST", "/billing/checkout", { planId: "FREE", interval: "MONTH" })).status === 400);
  check("checkout of unknown plan rejected", (await call(t, "POST", "/billing/checkout", { planId: "NOPE", interval: "MONTH" })).status === 400);

  // Failed payment changes nothing.
  let co = await call(t, "POST", "/billing/checkout", { planId: "PRO", interval: "MONTH" });
  const order1 = new URL(co.body.paymentUrl).searchParams.get("order")!;
  await call(t, "POST", `/billing/dev/pay/${order1}`, { success: false });
  o = (await call(t, "GET", "/billing")).body;
  check("declined payment: still Free, payment FAILED", o.plan.id === "FREE" && o.payments[0].status === "FAILED");

  // Successful payment: 3 users x 490 RUB.
  co = await call(t, "POST", "/billing/checkout", { planId: "PRO", interval: "MONTH" });
  const order2 = new URL(co.body.paymentUrl).searchParams.get("order")!;
  const pending = await db.payment.findUniqueOrThrow({ where: { orderId: order2 } });
  check("amount = 3 seats x 490 RUB, in kopecks", pending.amount === 3 * 49000 && pending.seats === 3, String(pending.amount));
  await call(t, "POST", `/billing/dev/pay/${order2}`, { success: true });
  await call(t, "POST", `/billing/dev/pay/${order2}`, { success: true }); // repeated notification
  o = (await call(t, "GET", "/billing")).body;
  check("paid: Pro, ACTIVE, period set, card saved", o.plan.id === "PRO" && o.subscription.status === "ACTIVE" && !!o.subscription.currentPeriodEnd && !!o.subscription.cardMask);
  check("repeated notification did not double-activate", (await db.payment.count({ where: { workspaceId: ws, status: "PAID" } })) === 1);
  check("4th project allowed on Pro", (await call(t, "POST", "/projects", { title: "P4" })).status === 201);
  check("time entry allowed on Pro", (await call(t, "POST", `/cards/${card.id}/time`, { minutes: 10, date: "2026-01-01" })).status === 201);

  // Year costs 10 months.
  co = await call(t, "POST", "/billing/checkout", { planId: "BUSINESS", interval: "YEAR" });
  const yearly = await db.payment.findFirstOrThrow({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" } });
  check("Business yearly = 3 x 990 RUB x 10", yearly.amount === 3 * 99000 * 10, String(yearly.amount));
  await db.payment.update({ where: { id: yearly.id }, data: { status: "FAILED" } });

  // Webhook authenticity.
  const forged = { OrderId: order2, PaymentId: "x", Amount: pending.amount, Status: "CONFIRMED", Token: "deadbeef" };
  check("webhook with bad token rejected", (await call(null, "POST", "/billing/webhooks/tbank", forged)).status === 401);
  const good = mockNotification({ OrderId: "unknown-order", PaymentId: "x", Amount: 1, Status: "CONFIRMED", Success: true });
  check("webhook for unknown order -> 404", (await call(null, "POST", "/billing/webhooks/tbank", good)).status === 404);
  check("token algorithm matches the documented example shape", tbankToken({ TerminalKey: "A", Amount: 100, OrderId: "1" }, "p") === tbankToken({ OrderId: "1", Amount: 100, TerminalKey: "A", Token: "ignored" }, "p"));

  // Renewal.
  const ok = new BillingService(db as any, new MockProvider("http://x", false));
  const bad = new BillingService(db as any, new MockProvider("http://x", true));
  const endBefore = (await db.subscription.findUniqueOrThrow({ where: { workspaceId: ws } })).currentPeriodEnd!;
  const past = new Date(Date.now() - 3600_000);
  await db.subscription.update({ where: { workspaceId: ws }, data: { currentPeriodEnd: past } });
  await ok.runDue();
  let s = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ws } });
  check("renewal charged and period extended", s.status === "ACTIVE" && s.currentPeriodEnd! > new Date() && (await db.payment.count({ where: { workspaceId: ws, kind: "RENEWAL", status: "PAID" } })) === 1);
  check("renewal continues from the old period end", s.currentPeriodEnd!.getTime() > past.getTime() + 27 * 86_400_000 && endBefore > past);

  // Failed renewals: retry, then downgrade after 3.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await db.subscription.update({ where: { workspaceId: ws }, data: { currentPeriodEnd: past, nextAttemptAt: null } });
    await bad.runDue();
    s = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ws } });
    if (attempt < 3) check(`failed renewal #${attempt}: PAST_DUE, keeps Pro`, s.status === "PAST_DUE" && s.planId === "PRO" && s.failedAttempts === attempt);
  }
  check("3rd failed renewal: back to Free", s.planId === "FREE" && s.rebillId === null);

  // Cancel at period end.
  co = await call(t, "POST", "/billing/checkout", { planId: "PRO", interval: "MONTH" });
  await call(t, "POST", `/billing/dev/pay/${new URL(co.body.paymentUrl).searchParams.get("order")}`, { success: true });
  check("cancel", (await call(t, "POST", "/billing/cancel", { cancel: true })).status === 204);
  const renewalsBefore = await db.payment.count({ where: { workspaceId: ws, kind: "RENEWAL" } });
  await db.subscription.update({ where: { workspaceId: ws }, data: { currentPeriodEnd: past } });
  await ok.runDue();
  s = await db.subscription.findUniqueOrThrow({ where: { workspaceId: ws } });
  check("cancelled subscription is not renewed, drops to Free", s.planId === "FREE" && (await db.payment.count({ where: { workspaceId: ws, kind: "RENEWAL" } })) === renewalsBefore);

  // Non-admin cannot pay.
  const member = await call(null, "POST", "/auth/login", { email: `m1-${run}@iso.test`, password: "password-123" });
  check("member cannot start checkout (403)", (await call(member.body.accessToken, "POST", "/billing/checkout", { planId: "PRO", interval: "MONTH" })).status === 403);
  check("member can see the plan", (await call(member.body.accessToken, "GET", "/billing")).status === 200);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll billing checks passed");
}

main().catch((e) => { console.error(e); failed++; }).finally(async () => { await db.$disconnect(); process.exit(failed ? 1 : 0); });
