import { createHash } from "crypto";
import request from "supertest";
import { api, createApp, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

describe("registration", () => {
  it("creates a workspace, an admin, a Pro trial and the starter template", async () => {
    const a = await register(t, "reg");
    const user = await t.db.user.findUniqueOrThrow({ where: { id: a.userId }, include: { workspace: { include: { subscription: true, templates: true } } } });
    expect(user.role).toBe("ADMIN");
    expect(user.workspace.subscription).toMatchObject({ planId: "PRO", status: "TRIALING" });
    expect(user.workspace.subscription!.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(user.workspace.templates.map((x) => x.name)).toContain("Типовой проект");
  });

  it("rejects duplicates regardless of case, and bad input", async () => {
    const a = await register(t, "dup");
    const server = t.app.getHttpServer();
    await request(server).post("/auth/register").send({ workspaceName: "X", name: "X", email: a.email.toUpperCase(), password: "password-123" }).expect(409);
    await request(server).post("/auth/register").send({ workspaceName: "X", name: "X", email: "not-an-email", password: "password-123" }).expect(400);
    await request(server).post("/auth/register").send({ workspaceName: "X", name: "X", email: `${unique("s")}@iso.test`, password: "short" }).expect(400);
    await request(server).post("/auth/register").send({ workspaceName: "", name: "X", email: `${unique("s")}@iso.test`, password: "password-123" }).expect(400);
  });
});

describe("login and sessions", () => {
  it("logs in with the right password only", async () => {
    const a = await register(t, "login");
    const server = t.app.getHttpServer();
    const ok = await request(server).post("/auth/login").send({ email: a.email, password: a.password }).expect(201);
    expect(ok.body.accessToken).toEqual(expect.any(String));
    await request(server).post("/auth/login").send({ email: a.email, password: "wrong-password" }).expect(401);
    await request(server).post("/auth/login").send({ email: "nobody@iso.test", password: "password-123" }).expect(401);
  });

  it("refuses requests without a token or with a bad one", async () => {
    await api(t).get("/projects").expect(401);
    await api(t, "garbage").get("/projects").expect(401);
  });

  it("stops a deactivated user at once, with the old token", async () => {
    const a = await register(t, "off");
    const inv = await api(t, a.token).post("/invitations", { email: `${unique("guest")}@iso.test` }).expect(201);
    const joined = await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "Гость", password: "password-123" }).expect(201);
    await api(t, joined.body.accessToken).get("/users/me").expect(200);
    const guest = await t.db.user.findFirstOrThrow({ where: { workspaceId: a.workspaceId, role: "MEMBER" } });
    await api(t, a.token).patch(`/users/${guest.id}`, { isActive: false }).expect(200);
    await api(t, joined.body.accessToken).get("/users/me").expect(401);
    await request(t.app.getHttpServer()).post("/auth/login").send({ email: guest.email, password: "password-123" }).expect(401);
  });
});

describe("invitations", () => {
  it("full cycle: invite, preview, accept, single use", async () => {
    const admin = await register(t, "inv");
    const guest = `${unique("guest")}@iso.test`;
    const inv = await api(t, admin.token).post("/invitations", { email: guest }).expect(201);
    expect(inv.body).toMatchObject({ email: guest, emailSent: false });
    const token = inv.body.link.split("/").pop();
    expect(await t.db.invitation.count({ where: { tokenHash: token } })).toBe(0); // only the hash is stored
    expect(await t.db.invitation.count({ where: { tokenHash: hash(token) } })).toBe(1);

    expect((await api(t).get(`/auth/invitations/${token}`).expect(200)).body).toEqual({ email: guest, workspaceName: expect.stringContaining("Компания") });
    expect((await api(t, admin.token).get("/invitations").expect(200)).body.map((i: { email: string }) => i.email)).toContain(guest);

    const accepted = await api(t).post("/auth/accept-invite", { token, name: "Гость", password: "password-123" }).expect(201);
    const user = await t.db.user.findUniqueOrThrow({ where: { email: guest } });
    expect(user).toMatchObject({ workspaceId: admin.workspaceId, role: "MEMBER", name: "Гость" });
    await api(t, accepted.body.accessToken).post("/invitations", { email: "x@iso.test" }).expect(403);
    await api(t).post("/auth/accept-invite", { token, name: "Ещё", password: "password-123" }).expect(404);
    expect((await api(t, admin.token).get("/invitations")).body.map((i: { email: string }) => i.email)).not.toContain(guest);
  });

  it("rejects registered addresses, expired links and unknown tokens; replaces and revokes", async () => {
    const admin = await register(t, "inv2");
    await api(t, admin.token).post("/invitations", { email: admin.email }).expect(409);
    await api(t).get("/auth/invitations/nope").expect(404);

    const exp = await api(t, admin.token).post("/invitations", { email: `${unique("exp")}@iso.test` }).expect(201);
    await t.db.invitation.update({ where: { id: exp.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await api(t).get(`/auth/invitations/${exp.body.link.split("/").pop()}`).expect(404);

    const email = `${unique("re")}@iso.test`;
    const first = await api(t, admin.token).post("/invitations", { email }).expect(201);
    const second = await api(t, admin.token).post("/invitations", { email }).expect(201);
    await api(t).get(`/auth/invitations/${first.body.link.split("/").pop()}`).expect(404);
    await api(t).get(`/auth/invitations/${second.body.link.split("/").pop()}`).expect(200);
    await api(t, admin.token).del(`/invitations/${second.body.id}`).expect(204);
    await api(t).get(`/auth/invitations/${second.body.link.split("/").pop()}`).expect(404);
  });

  it("is scoped to the workspace and honours the plan's seat limit", async () => {
    const a = await register(t, "invA");
    const b = await register(t, "invB");
    const inv = await api(t, a.token).post("/invitations", { email: `${unique("x")}@iso.test` }).expect(201);
    expect((await api(t, b.token).get("/invitations")).body).toEqual([]);
    await api(t, b.token).del(`/invitations/${inv.body.id}`).expect(404);

    await setPlan(t, a.workspaceId, "FREE"); // 3 seats
    // admin + the pending invitation already hold 2 of them
    await api(t, a.token).del(`/invitations/${inv.body.id}`).expect(204);
    const e1 = await api(t, a.token).post("/invitations", { email: `${unique("s1")}@iso.test` }).expect(201);
    await api(t).post("/auth/accept-invite", { token: e1.body.link.split("/").pop(), name: "Второй", password: "password-123" }).expect(201);
    const e2 = await api(t, a.token).post("/invitations", { email: `${unique("s2")}@iso.test` }).expect(201);
    await api(t).post("/auth/accept-invite", { token: e2.body.link.split("/").pop(), name: "Третий", password: "password-123" }).expect(201);
    const e3 = await api(t, a.token).post("/invitations", { email: `${unique("s3")}@iso.test` }).expect(402);
    expect(e3.body.message).toContain("не больше 3");
  });

  it("refuses to accept into a workspace that became read-only", async () => {
    const a = await register(t, "invLock");
    const inv = await api(t, a.token).post("/invitations", { email: `${unique("l")}@iso.test` }).expect(201);
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { status: "LOCKED" } });
    const res = await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "Гость", password: "password-123" }).expect(400);
    expect(res.body.message).toContain("режиме чтения");
  });
});

describe("password reset", () => {
  it("answers alike for unknown addresses, throttles, and resets once", async () => {
    const a = await register(t, "pw");
    await api(t).post("/auth/forgot", { email: `nobody-${unique("n")}@iso.test` }).expect(204);
    expect(await t.db.passwordReset.count({ where: { userId: a.userId } })).toBe(0);
    await api(t).post("/auth/forgot", { email: a.email.toUpperCase() }).expect(204);
    await api(t).post("/auth/forgot", { email: a.email }).expect(204);
    expect(await t.db.passwordReset.count({ where: { userId: a.userId } })).toBe(1); // throttled
    await api(t).post("/auth/forgot", { email: "not-an-email" }).expect(400);

    const raw = unique("reset-token");
    await t.db.passwordReset.create({ data: { userId: a.userId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 3600_000) } });
    await api(t).post("/auth/reset", { token: raw, password: "short" }).expect(400);
    await api(t).post("/auth/reset", { token: raw, password: "brand-new-pass-1" }).expect(204);
    await api(t).post("/auth/login", { email: a.email, password: a.password }).expect(401);
    await api(t).post("/auth/login", { email: a.email, password: "brand-new-pass-1" }).expect(201);
    await api(t).post("/auth/reset", { token: raw, password: "another-pass-123" }).expect(400);
  });

  it("rejects expired and unknown tokens, and cancels sibling links", async () => {
    const a = await register(t, "pw2");
    const old = unique("old");
    await t.db.passwordReset.create({ data: { userId: a.userId, tokenHash: hash(old), expiresAt: new Date(Date.now() - 1000) } });
    await api(t).post("/auth/reset", { token: old, password: "another-pass-123" }).expect(400);
    await api(t).post("/auth/reset", { token: "unknown", password: "another-pass-123" }).expect(400);

    const one = unique("one");
    const two = unique("two");
    for (const raw of [one, two]) await t.db.passwordReset.create({ data: { userId: a.userId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 3600_000) } });
    await api(t).post("/auth/reset", { token: one, password: "fresh-password-1" }).expect(204);
    await api(t).post("/auth/reset", { token: two, password: "fresh-password-2" }).expect(400);
  });
});
