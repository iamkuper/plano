import { existsSync } from "fs";
import { join } from "path";
import request from "supertest";
import { UPLOAD_DIR } from "../src/attachments/attachments.service";
import { api, createApp, makeProject, register, setPlan, TestApp, unique } from "./helpers/app";

let t: TestApp;
beforeAll(async () => {
  t = await createApp();
});
afterAll(() => t.close());

const upload = (token: string, cardId: string, name = "файл.txt", content: Buffer | string = "hello", type = "text/plain") =>
  request(t.app.getHttpServer()).post(`/cards/${cardId}/attachments`).set("Authorization", `Bearer ${token}`).attach("file", Buffer.from(content), { filename: name, contentType: type });

describe("attachments", () => {
  it("uploads to a card, serves it through a signed link and removes the file with the row", async () => {
    const a = await register(t, "att");
    const { cards } = await makeProject(t, a.token, "A", ["c"]);
    const res = await upload(a.token, cards[0].id, "отчёт.txt", "содержимое").expect(201);
    expect(res.body).toMatchObject({ name: "отчёт.txt", mime: "text/plain", size: Buffer.byteLength("содержимое") });
    expect(res.body.url).toMatch(/^\/attachments\/.+\/file\?exp=\d+&sig=/);

    const row = await t.db.attachment.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(existsSync(join(UPLOAD_DIR, row.storageKey))).toBe(true);

    const file = await request(t.app.getHttpServer()).get(res.body.url).expect(200);
    expect(file.text).toBe("содержимое");
    expect(file.headers["content-disposition"]).toContain("inline"); // text is shown in the browser
    expect(file.headers["x-content-type-options"]).toBe("nosniff");

    const detail = (await api(t, a.token).get(`/cards/${cards[0].id}`)).body;
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0].url).toContain("sig=");

    await api(t, a.token).del(`/attachments/${res.body.id}`).expect(204);
    expect(existsSync(join(UPLOAD_DIR, row.storageKey))).toBe(false);
    await api(t, a.token).del(`/attachments/${res.body.id}`).expect(404);
  });

  it("shows images inline and links them to a message", async () => {
    const a = await register(t, "att2");
    const { cards } = await makeProject(t, a.token, "A", ["c"]);
    const img = await upload(a.token, cards[0].id, "снимок.png", Buffer.from([137, 80, 78, 71]), "image/png").expect(201);
    const view = await request(t.app.getHttpServer()).get(img.body.url).expect(200);
    expect(view.headers["content-disposition"]).toContain("inline");
    const zip = await upload(a.token, cards[0].id, "архив.zip", "PK", "application/zip").expect(201);
    expect((await request(t.app.getHttpServer()).get(zip.body.url).expect(200)).headers["content-disposition"]).toContain("attachment");
    await api(t, a.token).post(`/cards/${cards[0].id}/comments`, { text: "", attachmentIds: [img.body.id] }).expect(201);
    const detail = (await api(t, a.token).get(`/cards/${cards[0].id}`)).body;
    expect(detail.comments[0].attachments).toHaveLength(1);
  });

  it("rejects forged, expired and unknown links, and uploads without a file", async () => {
    const a = await register(t, "att3");
    const { cards } = await makeProject(t, a.token, "A", ["c"]);
    const res = await upload(a.token, cards[0].id).expect(201);
    const url = new URL(res.body.url, "http://x");
    await request(t.app.getHttpServer()).get(`${url.pathname}?exp=${url.searchParams.get("exp")}&sig=forged`).expect(403);
    await request(t.app.getHttpServer()).get(`${url.pathname}?exp=1&sig=${url.searchParams.get("sig")}`).expect(403);
    await request(t.app.getHttpServer()).get(`/attachments/missing/file?exp=${Date.now() + 1000}&sig=x`).expect(403);
    await request(t.app.getHttpServer()).post(`/cards/${cards[0].id}/attachments`).set("Authorization", `Bearer ${a.token}`).expect(400);
    await upload(a.token, "missing").expect(404);
    await request(t.app.getHttpServer()).post(`/cards/${cards[0].id}/attachments`).attach("file", Buffer.from("x"), "a.txt").expect(401);
  });

  it("only the uploader or an admin may delete; other workspaces can't touch it", async () => {
    const a = await register(t, "att4");
    const b = await register(t, "att4b");
    const { cards } = await makeProject(t, a.token, "A", ["c"]);
    const inv = await api(t, a.token).post("/invitations", { email: `${unique("m")}@iso.test` });
    const m = (await api(t).post("/auth/accept-invite", { token: inv.body.link.split("/").pop(), name: "М", password: "password-123" })).body.accessToken;
    const mine = await upload(m, cards[0].id, "m.txt").expect(201);
    const adminsFile = await upload(a.token, cards[0].id, "a.txt").expect(201);
    await api(t, m).del(`/attachments/${adminsFile.body.id}`).expect(403);
    await upload(b.token, cards[0].id).expect(404);
    await api(t, b.token).del(`/attachments/${mine.body.id}`).expect(404);
    await api(t, a.token).del(`/attachments/${mine.body.id}`).expect(204);
  });

  it("deleting a card or project removes its files from disk", async () => {
    const a = await register(t, "att5");
    const { cards, project } = await makeProject(t, a.token, "A", ["c1", "c2"]);
    const f1 = await upload(a.token, cards[0].id).expect(201);
    const f2 = await upload(a.token, cards[1].id).expect(201);
    const keys = await t.db.attachment.findMany({ where: { id: { in: [f1.body.id, f2.body.id] } } });
    await api(t, a.token).del(`/cards/${cards[0].id}`).expect(200);
    expect(existsSync(join(UPLOAD_DIR, keys.find((k) => k.id === f1.body.id)!.storageKey))).toBe(false);
    await api(t, a.token).del(`/projects/${project.id}`).expect(204);
    expect(existsSync(join(UPLOAD_DIR, keys.find((k) => k.id === f2.body.id)!.storageKey))).toBe(false);
  });

  it("refuses uploads beyond the plan's storage", async () => {
    const a = await register(t, "att6");
    const { cards } = await makeProject(t, a.token, "A", ["c"]);
    await setPlan(t, a.workspaceId, "FREE"); // 1 GB in total
    await t.db.attachment.create({ data: { cardId: cards[0].id, uploaderId: a.userId, name: "big", mime: "x/y", size: 1024 * 1024 * 1024, storageKey: unique("big") } });
    const res = await upload(a.token, cards[0].id).expect(402);
    expect(res.body.message).toContain("Место для файлов закончилось");
  });
});
