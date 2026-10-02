import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";

export interface TestApp {
  app: INestApplication;
  db: PrismaClient;
  close(): Promise<void>;
}

export async function createApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  const db = new PrismaClient();
  return {
    app,
    db,
    close: async () => {
      await db.$disconnect();
      await app.close();
    },
  };
}

let counter = 0;
export const unique = (tag: string) => `${tag}-${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface Account {
  token: string;
  email: string;
  password: string;
  workspaceId: string;
  userId: string;
}

// Registers a new workspace (with a 14-day Pro trial) and returns its admin.
export async function register(t: TestApp, tag = "t"): Promise<Account> {
  const email = `${unique(tag)}@iso.test`;
  const password = "password-123";
  const res = await request(t.app.getHttpServer()).post("/auth/register").send({ workspaceName: `Компания ${tag}`, name: `Админ ${tag}`, email, password }).expect(201);
  const user = await t.db.user.findUniqueOrThrow({ where: { email } });
  return { token: res.body.accessToken, email, password, workspaceId: user.workspaceId, userId: user.id };
}

// Request helper bound to a token: api(token).get("/x").
export function api(t: TestApp, token?: string) {
  const server = t.app.getHttpServer();
  const wrap = (r: request.Test) => (token ? r.set("Authorization", `Bearer ${token}`) : r);
  return {
    get: (url: string) => wrap(request(server).get(url)),
    post: (url: string, body?: object) => wrap(request(server).post(url)).send(body),
    put: (url: string, body?: object) => wrap(request(server).put(url)).send(body),
    patch: (url: string, body?: object) => wrap(request(server).patch(url)).send(body),
    del: (url: string) => wrap(request(server).delete(url)),
    raw: (method: "get" | "post" | "put" | "patch" | "delete", url: string) => wrap(request(server)[method](url)),
  };
}

const MONTH = 30 * 86_400_000;
export type PlanId = "FREE" | "PRO" | "BUSINESS";

// Puts the workspace on a plan, paid for a month (or free).
export const setPlan = (t: TestApp, workspaceId: string, planId: PlanId) =>
  t.db.subscription.update({
    where: { workspaceId },
    data: { planId, status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: planId === "FREE" ? null : new Date(Date.now() + MONTH), cancelAtPeriodEnd: false },
  });

// A project with a board; returns ids of the project, its columns and first-column cards.
export async function makeProject(t: TestApp, token: string, title = "Проект", cardTitles: string[] = []) {
  const a = api(t, token);
  const project = (await a.post("/projects", { title }).expect(201)).body;
  const board = (await a.get(`/projects/${project.id}/board`).expect(200)).body;
  const cards = [];
  for (const cardTitle of cardTitles) cards.push((await a.post("/cards", { columnId: board.columns[0].id, title: cardTitle }).expect(201)).body);
  return { project, board, columns: board.columns as { id: string; title: string }[], cards };
}
