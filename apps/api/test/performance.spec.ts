import { clearAuthCache } from "../src/auth/auth-cache";
import { api, createApp, makeProject, register, unique, type TestApp } from "./helpers/app";
import request from "supertest";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(async () => {
  await t.close();
});
afterEach(() => {
  process.env.AUTH_CACHE_MS = "0";
  clearAuthCache();
});

async function member(adminToken: string, tag: string) {
  const email = `${unique(tag)}@iso.test`;
  const created = (await api(t, adminToken).post("/users", { email, name: `Сотрудник ${tag}`, password: "password-123" }).expect(201)).body;
  const token = (await request(t.app.getHttpServer()).post("/auth/login").send({ email, password: "password-123" }).expect(201)).body.accessToken;
  return { id: created.id, email, token };
}

describe("auth cache", () => {
  it("serves repeated requests from memory, but changes made through the app apply at once", async () => {
    process.env.AUTH_CACHE_MS = "60000";
    const a = await register(t, "ac1");
    const m = await member(a.token, "ac1m");
    const M = api(t, m.token);
    await M.get("/users/me").expect(200);

    // A change behind the app's back (another client) is not seen while cached...
    await t.db.user.update({ where: { id: m.id }, data: { isActive: false } });
    await M.get("/users/me").expect(200);
    // ...but the same change through the app is, immediately.
    await t.db.user.update({ where: { id: m.id }, data: { isActive: true } });
    clearAuthCache();
    await M.get("/users/me").expect(200);
    await api(t, a.token).patch(`/users/${m.id}`, { isActive: false }).expect(200);
    await M.get("/users/me").expect(401);
  });

  it("applies a role change and a revoked API token at once", async () => {
    process.env.AUTH_CACHE_MS = "60000";
    const a = await register(t, "ac2");
    const A = api(t, a.token);
    const m = await member(a.token, "ac2m");
    const M = api(t, m.token);
    await M.post("/projects", { title: "x" }).expect(403); // no right yet
    const role = (await A.post("/roles", { name: "Руководитель", permissions: ["projects.create"] }).expect(201)).body;
    await A.patch(`/users/${m.id}`, { roleId: role.id }).expect(200);
    await M.post("/projects", { title: "x" }).expect(201);
    await A.patch(`/roles/${role.id}`, { permissions: [] }).expect(200);
    await M.post("/projects", { title: "y" }).expect(403);

    const token = (await A.post("/api-tokens", { name: "t" }).expect(201)).body;
    await api(t, token.token).get("/users/me").expect(200);
    await A.del(`/api-tokens/${token.id}`).expect(204);
    await api(t, token.token).get("/users/me").expect(401);
  });

  it("is per person: one user's cached rights don't leak to another", async () => {
    process.env.AUTH_CACHE_MS = "60000";
    const a = await register(t, "ac3");
    const m = await member(a.token, "ac3m");
    expect((await api(t, a.token).get("/users/me").expect(200)).body.role).toBe("ADMIN");
    expect((await api(t, m.token).get("/users/me").expect(200)).body.role).toBe("MEMBER");
    expect((await api(t, a.token).get("/users/me").expect(200)).body.role).toBe("ADMIN");
  });
});

describe("responses", () => {
  it("compresses big JSON, leaves small replies alone, and the board still reports unread comments", async () => {
    const a = await register(t, "rs1");
    const A = api(t, a.token);
    const m = await member(a.token, "rs1m");
    const titles = Array.from({ length: 60 }, (_, i) => `Карточка номер ${i + 1}, достаточно длинное название`);
    const { project, cards } = await makeProject(t, a.token, "Большой", titles);
    await A.post(`/cards/${cards[0].id}/comments`, { text: "Привет" }).expect(201);

    const big = await request(t.app.getHttpServer()).get(`/projects/${project.id}/board`).set("Authorization", `Bearer ${m.token}`).set("Accept-Encoding", "gzip").expect(200);
    expect(big.headers["content-encoding"]).toBe("gzip");
    const first = big.body.columns[0].cards.find((c: { id: string }) => c.id === cards[0].id);
    expect(first.unreadComments).toBe(1); // written by someone else
    expect(big.body.columns[0].cards.filter((c: { unreadComments: number }) => c.unreadComments > 0)).toHaveLength(1);

    const own = await A.get(`/projects/${project.id}/board`).expect(200);
    expect(own.body.columns[0].cards.every((c: { unreadComments: number }) => c.unreadComments === 0)).toBe(true); // own messages aren't unread

    const small = await request(t.app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${a.token}`).set("Accept-Encoding", "gzip").expect(200);
    expect(small.headers["content-encoding"]).toBeUndefined();
  });
});
