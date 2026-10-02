import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:3201";
export const TOKEN_KEY = "amo-kanban.token";
export const OWNER = { email: "owner@e2e.test", password: "password-123" };

let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;

async function call<T = any>(path: string, token: string | null, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface Account { token: string; email: string; password: string; company: string; name: string }

// Creates a workspace through the API (fast); the UI sign-up has its own test.
export async function signUp(tag = "ws"): Promise<Account> {
  const company = `Компания ${uid(tag)}`;
  const email = `${uid(tag)}@e2e.test`;
  const name = "Админ Тестов";
  const password = "password-123";
  const res = await call<{ accessToken: string }>("/auth/register", null, "POST", { workspaceName: company, name, email, password });
  return { token: res.accessToken, email, password, company, name };
}

export const apiAs = (token: string) => ({
  get: <T = any>(p: string) => call<T>(p, token),
  post: <T = any>(p: string, b?: unknown) => call<T>(p, token, "POST", b ?? {}),
  patch: <T = any>(p: string, b?: unknown) => call<T>(p, token, "PATCH", b ?? {}),
});

// Logs the browser in by planting the token, skipping the sign-in form.
export async function signIn(page: Page, token: string, path = "/dashboard") {
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [TOKEN_KEY, token] as const);
  await page.goto(path);
}

export async function ownerToken() {
  try {
    return (await call<{ accessToken: string }>("/auth/login", null, "POST", OWNER)).accessToken;
  } catch {
    return (await call<{ accessToken: string }>("/auth/register", null, "POST", { workspaceName: "Владелец", name: "Владелец", ...OWNER })).accessToken;
  }
}

// Owner-only helper: changes the subscription of the workspace with this company name.
export async function platformAction(company: string, action: "grant" | "lock" | "free" | "extend-trial", planId?: string) {
  const owner = await ownerToken();
  const list = await call<{ items: { id: string; name: string }[] }>(`/platform/workspaces?q=${encodeURIComponent(company)}`, owner);
  const ws = list.items.find((w) => w.name === company);
  expect(ws, "workspace in platform list").toBeTruthy();
  await call(`/platform/workspaces/${ws!.id}/subscription`, owner, "POST", { action, planId, days: 30 });
}

export async function makeProject(token: string, title: string, cards: string[] = []) {
  const a = apiAs(token);
  const project = await a.post("/projects", { title });
  const board = await a.get(`/projects/${project.id}/board`);
  for (const t of cards) await a.post("/cards", { columnId: board.columns[0].id, title: t });
  return { project, board };
}
