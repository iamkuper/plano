import http from "http";
import { AddressInfo } from "net";
import { expect, test } from "@playwright/test";
import { apiAs, makeProject, platformAction, signIn, signUp } from "./helpers";

// A stand-in for a model provider: first asks to post a message, then wraps up.
let server: http.Server;
let base: string;
const requests: any[] = [];

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push(body);
      const tools = (body.tools ?? []).length > 0;
      const afterTool = (body.messages ?? []).some((m: any) => m.role === "tool");
      const message = !tools
        ? { content: "OK" }
        : afterTool
          ? { content: "Готово." }
          : { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "add_comment", arguments: JSON.stringify({ text: "Беру в работу, начну с плана." }) } }] };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
test.afterAll(() => server.close());

test("connect an AI agent, assign it a card, and it answers in the card", async ({ page }) => {
  const acc = await signUp("agent");
  await platformAction(acc.company, "grant", "BUSINESS", 3);
  const { project } = await makeProject(acc.token, "Сайт", ["Составить план"]);
  await signIn(page, acc.token, "/settings/agents");

  await page.getByRole("button", { name: "Новый агент" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Имя").fill("Мария-бот");
  await dialog.getByLabel("Провайдер").selectOption("OPENAI_COMPATIBLE");
  await dialog.getByLabel("Модель").fill("test-model");
  await dialog.getByLabel("Адрес API").fill(base);
  await dialog.getByLabel("Ключ API").fill("sk-e2e-key-0001");
  await dialog.getByLabel("Инструкция").fill("Ты помощник менеджера проекта");
  await dialog.getByRole("button", { name: "Проверить подключение" }).click();
  await expect(dialog.getByText(/Подключение работает/)).toBeVisible();
  await dialog.getByRole("button", { name: "Подключить" }).click();
  await expect(page.getByText("Мария-бот").first()).toBeVisible();
  await expect(page.getByText(/…0001/)).toHaveCount(0); // the key is never shown back

  // It takes a seat and sits in the team, but not in the staff list.
  expect((await apiAs(acc.token).get("/billing")).usage.users).toBe(2);
  await page.goto("/settings/users");
  await expect(page.getByText("Мария-бот")).toHaveCount(0);

  // Assign it a card: it reads the card and writes back.
  const agent = (await apiAs(acc.token).get("/agents"))[0];
  const card = (await apiAs(acc.token).get(`/projects/${project.id}/board`)).columns[0].cards[0];
  await apiAs(acc.token).patch(`/cards/${card.id}`, { assigneeIds: [agent.id] });
  await page.goto(`/projects/${project.id}?card=${card.id}`);
  await expect(page.getByText("Беру в работу, начну с плана.")).toBeVisible({ timeout: 15_000 });

  const asked = requests.find((r) => (r.tools ?? []).length > 0);
  expect(asked.messages[0].content).toContain("Ты помощник менеджера проекта");
  expect(asked.messages[1].content).toContain("Составить план");

  // The run is in the history.
  await page.goto("/settings/agents");
  await expect(page.getByText(/сегодня: 1 запуск, 30 токенов/)).toBeVisible(); // two model calls of 10 in + 5 out
  await page.getByRole("button", { name: "Запуски агента «Мария-бот»" }).click();
  await expect(page.getByRole("dialog").getByText(/назначили на карточку · готово/)).toBeVisible();
});

test("below Business the agents page offers an upgrade instead of the form", async ({ page }) => {
  const acc = await signUp("agentpro"); // a Pro trial
  await signIn(page, acc.token, "/settings/agents");
  await expect(page.getByText(/ИИ-агенты есть на тарифе Business/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Новый агент" })).toHaveCount(0);
  await page.getByRole("link", { name: "Тарифы" }).click();
  await expect(page).toHaveURL(/\/settings\/billing/);
  await expect(page.getByText("ИИ-агенты на вашем ключе")).toBeVisible();
});

test("a person without the right sees agents settings read-only", async ({ page, browser }) => {
  const acc = await signUp("agentro");
  const email = `m${Date.now()}@e2e.test`;
  await apiAs(acc.token).post("/users", { email, name: "Участник", password: "password-123" });
  const res = await fetch("http://localhost:3201/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password-123" }) });
  const { accessToken } = await res.json();
  await signIn(page, accessToken, "/settings/agents");
  await expect(page.getByText(/Агентов настраивает администратор/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Новый агент" })).toHaveCount(0);
  void browser;
});
