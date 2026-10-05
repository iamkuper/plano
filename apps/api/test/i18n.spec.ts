import request from "supertest";
import { MailService } from "../src/mail/mail.service";
import { api, createApp, makeProject, register, unique, type TestApp } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(async () => {
  await t.close();
});

const server = () => t.app.getHttpServer();
const badLogin = (headers: Record<string, string> = {}) => {
  const r = request(server()).post("/auth/login").send({ email: "nobody@iso.test", password: "password-123" });
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r.expect(401);
};

describe("request language", () => {
  it("answers in the language the client asks for, Russian by default", async () => {
    expect((await badLogin()).body.message).toBe("Неверная почта или пароль");
    expect((await badLogin({ "X-Locale": "en" })).body.message).toBe("Wrong email or password");
    expect((await badLogin({ "Accept-Language": "en-US,en;q=0.9" })).body.message).toBe("Wrong email or password");
    expect((await badLogin({ "Accept-Language": "de-DE,ru;q=0.8" })).body.message).toBe("Неверная почта или пароль");
    expect((await badLogin({ "X-Locale": "fr" })).body.message).toBe("Неверная почта или пароль");
  });

  it("translates validation messages too", async () => {
    const body = { workspaceName: "", name: "A", email: "a@iso.test", password: "password-123" };
    const ru = await request(server()).post("/auth/register").send(body).expect(400);
    const en = await request(server()).post("/auth/register").set("X-Locale", "en").send(body).expect(400);
    expect(JSON.stringify(ru.body.message)).toContain("Укажите название компании");
    expect(JSON.stringify(en.body.message)).toContain("Enter the company name");
  });
});

describe("account language", () => {
  it("sign-up in English creates English starter content and remembers the language", async () => {
    const email = `${unique("en")}@iso.test`;
    const res = await request(server()).post("/auth/register").send({ workspaceName: "Acme", name: "Ann", email, password: "password-123", locale: "en" }).expect(201);
    const A = api(t, res.body.accessToken);
    const me = (await A.get("/users/me").expect(200)).body;
    expect(me.locale).toBe("en");
    expect((await A.get("/settings").expect(200)).body.defaultColumns).toEqual(["Backlog", "In progress", "In review", "Done"]);
    expect((await A.get("/labels").expect(200)).body.map((l: { name: string }) => l.name)).toEqual(["Bug", "Feature", "Improvement"]);
  });

  it("changes in the profile and rejects unknown languages", async () => {
    const a = await register(t, "loc");
    const A = api(t, a.token);
    expect((await A.get("/users/me")).body.locale).toBe("ru");
    await A.patch("/users/me", { locale: "en" }).expect(200);
    expect((await A.get("/users/me")).body.locale).toBe("en");
    await A.patch("/users/me", { locale: "de" }).expect(400);
  });

  it("emails follow the recipient's language, not the sender's", async () => {
    const mail = t.app.get(MailService);
    const send = jest.spyOn(mail, "send").mockResolvedValue(true);
    Object.defineProperty(mail, "enabled", { get: () => true, configurable: true });
    const a = await register(t, "mailen");
    const A = api(t, a.token);
    const email = `${unique("m")}@iso.test`;
    await A.post("/users", { email, name: "Member", password: "password-123" }).expect(201);
    const member = await t.db.user.findFirstOrThrow({ where: { email } });
    await t.db.user.update({ where: { id: member.id }, data: { locale: "en" } });
    const { cards } = await makeProject(t, a.token, "M", ["x"]);
    await A.patch(`/cards/${cards[0].id}`, { assigneeIds: [member.id] }).expect(200); // sender works in Russian
    await new Promise((r) => setTimeout(r, 300));
    expect(send).toHaveBeenCalledWith(email, expect.stringContaining("You were assigned to"), expect.stringContaining("Open the card"));
    send.mockRestore();
    delete (mail as unknown as Record<string, unknown>).enabled;
  });

  it("exports CSV headers in the requested language", async () => {
    const a = await register(t, "csv");
    await t.db.subscription.update({ where: { workspaceId: a.workspaceId }, data: { planId: "BUSINESS", status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 86_400_000) } });
    const { project } = await makeProject(t, a.token, "P");
    const csv = (lang: string) =>
      request(server())
        .get(`/projects/${project.id}/export.csv`)
        .set("Authorization", `Bearer ${a.token}`)
        .set("X-Locale", lang)
        .buffer(true)
        .parse((r, cb) => {
          let s = "";
          r.on("data", (c: Buffer) => (s += c.toString("utf8")));
          r.on("end", () => cb(null, s));
        })
        .expect(200);
    expect(((await csv("en")).body as string).split("\r\n")[0]).toContain("Key;Name");
    expect(((await csv("ru")).body as string).split("\r\n")[0]).toContain("Ключ;Название");
  });
});
