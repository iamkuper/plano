// Invitations and password reset against a running API.
//   pnpm exec ts-node --transpile-only test/invitations.ts   (from apps/api)
import { PrismaClient } from "@prisma/client";
import { hashToken } from "../src/auth/tokens";

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
const tokenOf = (link: string) => link.split("/").pop()!;

async function main() {
  const adminEmail = `inv-admin-${run}@iso.test`;
  const admin = (await call(null, "POST", "/auth/register", { workspaceName: "Приглашения", name: "Админ", email: adminEmail, password: "password-123" })).body.accessToken as string;
  const other = (await call(null, "POST", "/auth/register", { workspaceName: "Чужая", name: "Чужой", email: `inv-other-${run}@iso.test`, password: "password-123" })).body.accessToken as string;
  const wsId = (await db.user.findUniqueOrThrow({ where: { email: adminEmail } })).workspaceId;

  // Inviting.
  const guest = `guest-${run}@iso.test`;
  const inv = await call(admin, "POST", "/invitations", { email: guest });
  check("admin creates an invitation with a link", inv.status === 201 && inv.body.link.includes("/invite/"), JSON.stringify(inv.body));
  const token = tokenOf(inv.body.link);
  check("the token itself is not stored", (await db.invitation.count({ where: { tokenHash: token } })) === 0 && (await db.invitation.count({ where: { tokenHash: hashToken(token) } })) === 1);
  check("list shows the pending invitation", (await call(admin, "GET", "/invitations")).body.some((i: any) => i.email === guest));
  check("other workspace doesn't see it", (await call(other, "GET", "/invitations")).body.length === 0);
  check("other workspace can't revoke it", (await call(other, "DELETE", `/invitations/${inv.body.id}`)).status === 404);
  check("registered email can't be invited", (await call(admin, "POST", "/invitations", { email: adminEmail })).status === 409);

  const peek = await call(null, "GET", `/auth/invitations/${token}`);
  check("anyone with the link sees workspace name and email", peek.status === 200 && peek.body.workspaceName === "Приглашения" && peek.body.email === guest);
  check("unknown token → 404", (await call(null, "GET", "/auth/invitations/nope")).status === 404);

  // Member can't invite.
  const accepted = await call(null, "POST", "/auth/accept-invite", { token, name: "Гость", password: "password-123" });
  check("accepting creates a session", accepted.status === 201 && !!accepted.body.accessToken, JSON.stringify(accepted.body));
  const guestUser = await db.user.findUniqueOrThrow({ where: { email: guest } });
  check("user joined the inviting workspace as a member", guestUser.workspaceId === wsId && guestUser.role === "MEMBER");
  check("link is single-use", (await call(null, "POST", "/auth/accept-invite", { token, name: "Ещё", password: "password-123" })).status === 404);
  check("member can't invite (403)", (await call(accepted.body.accessToken, "POST", "/invitations", { email: `x-${run}@iso.test` })).status === 403);
  check("accepted invitation leaves the list", !(await call(admin, "GET", "/invitations")).body.some((i: any) => i.email === guest));

  // Expiry, revoke, replace.
  const exp = await call(admin, "POST", "/invitations", { email: `exp-${run}@iso.test` });
  await db.invitation.update({ where: { id: exp.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check("expired invitation is rejected", (await call(null, "GET", `/auth/invitations/${tokenOf(exp.body.link)}`)).status === 404);
  const first = await call(admin, "POST", "/invitations", { email: `re-${run}@iso.test` });
  const second = await call(admin, "POST", "/invitations", { email: `re-${run}@iso.test` });
  check("re-inviting replaces the old link", (await call(null, "GET", `/auth/invitations/${tokenOf(first.body.link)}`)).status === 404 && (await call(null, "GET", `/auth/invitations/${tokenOf(second.body.link)}`)).status === 200);
  check("admin revokes", (await call(admin, "DELETE", `/invitations/${second.body.id}`)).status === 204 && (await call(null, "GET", `/auth/invitations/${tokenOf(second.body.link)}`)).status === 404);

  // Free plan seat limit (3 users): admin + guest + one more fills it.
  await db.subscription.update({ where: { workspaceId: wsId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
  const third = await call(admin, "POST", "/invitations", { email: `third-${run}@iso.test` });
  check("third seat can be invited", third.status === 201);
  await call(null, "POST", "/auth/accept-invite", { token: tokenOf(third.body.link), name: "Третий", password: "password-123" });
  check("no invitations once the plan is full (402)", (await call(admin, "POST", "/invitations", { email: `fourth-${run}@iso.test` })).status === 402);
  check("reactivating beyond the limit is blocked (402)", await (async () => {
    const u = await db.user.create({ data: { workspaceId: wsId, email: `off-${run}@iso.test`, name: "Off", passwordHash: "x", isActive: false } });
    return (await call(admin, "PATCH", `/users/${u.id}`, { isActive: true })).status === 402;
  })());

  // Password reset.
  check("forgot for unknown address answers the same (204)", (await call(null, "POST", "/auth/forgot", { email: `nobody-${run}@iso.test` })).status === 204);
  check("forgot for a real address answers 204", (await call(null, "POST", "/auth/forgot", { email: adminEmail.toUpperCase() })).status === 204);
  const adminRow = await db.user.findUniqueOrThrow({ where: { email: adminEmail } });
  check("a reset token was created only for the real user", (await db.passwordReset.count({ where: { userId: adminRow.id } })) === 1);
  await call(null, "POST", "/auth/forgot", { email: adminEmail });
  check("repeated requests within a minute are throttled", (await db.passwordReset.count({ where: { userId: adminRow.id } })) === 1);

  const raw = "reset-token-for-test-" + run;
  await db.passwordReset.create({ data: { userId: adminRow.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 3600_000) } });
  check("short password rejected", (await call(null, "POST", "/auth/reset", { token: raw, password: "short" })).status === 400);
  check("reset with the token works", (await call(null, "POST", "/auth/reset", { token: raw, password: "brand-new-pass-1" })).status === 204);
  check("old password no longer works", (await call(null, "POST", "/auth/login", { email: adminEmail, password: "password-123" })).status === 401);
  check("new password works", (await call(null, "POST", "/auth/login", { email: adminEmail, password: "brand-new-pass-1" })).status === 201);
  check("token is single-use", (await call(null, "POST", "/auth/reset", { token: raw, password: "another-pass-123" })).status === 400);
  const old = "expired-token-" + run;
  await db.passwordReset.create({ data: { userId: adminRow.id, tokenHash: hashToken(old), expiresAt: new Date(Date.now() - 1000) } });
  check("expired token rejected", (await call(null, "POST", "/auth/reset", { token: old, password: "another-pass-123" })).status === 400);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll invitation checks passed");
}

main().catch((e) => { console.error(e); failed++; }).finally(async () => { await db.$disconnect(); process.exit(failed ? 1 : 0); });
