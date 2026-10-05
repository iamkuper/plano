import http from "http";
import { AddressInfo } from "net";
import { expect, test } from "@playwright/test";
import { API, apiAs, makeProject, signIn, signUp } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("an API token made in settings works against the API, and revoking it stops it", async ({ page }) => {
  const acc = await signUp("tok");
  await signIn(page, acc.token, "/settings/integrations");
  await page.getByRole("button", { name: /Новый токен/ }).click();
  await page.getByLabel("Название").fill("E2E");
  await page.getByRole("button", { name: "Создать токен" }).click();
  const secret = (await page.getByTestId("secret").textContent())!.trim();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByText("E2E")).toBeVisible();

  const me = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${secret}` } });
  expect(me.status).toBe(200);
  expect((await me.json()).email).toBe(acc.email);

  await page.getByRole("button", { name: "Отозвать токен E2E" }).click();
  await page.getByRole("button", { name: "Отозвать", exact: true }).click();
  await expect(page.getByText("Токенов нет")).toBeVisible();
  expect((await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${secret}` } })).status).toBe(401);
});

test("a webhook made in settings receives signed card events", async ({ page }) => {
  const got: { event: string; signature: string }[] = [];
  const server = http.createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      got.push({ event: String(req.headers["x-plano-event"]), signature: String(req.headers["x-plano-signature"]) });
      res.writeHead(200);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  try {
    const acc = await signUp("hook");
    await signIn(page, acc.token, "/settings/integrations");
    await page.getByRole("button", { name: /Новый вебхук/ }).click();
    await page.getByRole("dialog").getByLabel("Адрес").fill(url);
    await page.getByRole("dialog").getByRole("button", { name: "Создать" }).click();
    await expect(page.getByTestId("secret")).toContainText("whsec_");
    await page.getByRole("button", { name: "Готово" }).click();

    await page.getByRole("button", { name: `Отправить тест на ${url}` }).click();
    await expect(page.getByText("Тестовое событие доставлено")).toBeVisible();

    const { board } = await makeProject(acc.token, "Хуки", ["Первая"]);
    await expect.poll(() => got.map((g) => g.event)).toEqual(expect.arrayContaining(["ping", "card.created"]));
    expect(got.every((g) => /^sha256=[0-9a-f]{64}$/.test(g.signature))).toBe(true);
    void board;

    await page.getByRole("button", { name: `Отправки на ${url}` }).click();
    await expect(page.getByRole("dialog").getByText("card.created")).toBeVisible();
  } finally {
    server.close();
  }
});

test("the calendar link in the profile serves the user's tasks", async ({ page }) => {
  const acc = await signUp("cal");
  const { project, board } = await makeProject(acc.token, "Календарь", ["Сдать отчёт"]);
  const me = await apiAs(acc.token).get("/users/me");
  const card = (await apiAs(acc.token).get(`/projects/${project.id}/board`)).columns[0].cards[0];
  await apiAs(acc.token).patch(`/cards/${card.id}`, { assigneeIds: [me.id], dueDate: "2026-12-10T00:00:00.000Z" });
  void board;

  await signIn(page, acc.token, "/profile");
  await page.getByRole("button", { name: "Показать ссылку на календарь" }).click();
  const feed = await page.getByLabel("Адрес календаря").inputValue();
  const res = await fetch(feed);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/calendar");
  const text = await res.text();
  expect(text).toContain("BEGIN:VCALENDAR");
  expect(text).toContain("Сдать отчёт");
  expect(text).toContain("DTSTART;VALUE=DATE:20261210");
});

test("new workspaces start with labels instead of task types", async ({ page }) => {
  const acc = await signUp("lab");
  await signIn(page, acc.token, "/dashboard");
  const labels = await apiAs(acc.token).get<{ name: string }[]>("/labels");
  expect(labels.map((l) => l.name)).toEqual(["Ошибка", "Улучшение", "Фича"]);
  expect((await fetch(`${API}/task-types`, { headers: { Authorization: `Bearer ${acc.token}` } })).status).toBe(404);
});

test("the command palette and keyboard shortcuts move around the app", async ({ page }) => {
  test.slow(); // pages compile on first visit in the dev server
  const acc = await signUp("kbd");
  await makeProject(acc.token, "Сайт компании", ["Первая"]);
  await signIn(page, acc.token, "/dashboard");
  await expect(page.getByRole("button", { name: "Поиск" })).toBeVisible(); // the shell is ready

  await page.keyboard.press(`${mod}+k`);
  const input = page.getByRole("combobox", { name: "Команда или поиск" });
  await expect(input).toBeFocused({ timeout: 20_000 });
  await input.fill("биллинг");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/billing$/, { timeout: 20_000 });

  await page.keyboard.press(`${mod}+k`);
  await page.getByRole("combobox", { name: "Команда или поиск" }).fill("первая");
  await page.getByRole("option", { name: /Первая/ }).click();
  await expect(page).toHaveURL(/\/projects\/[^/?]+\?card=/, { timeout: 20_000 });
  await page.keyboard.press("Escape");

  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Поиск" })).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await expect(page).toHaveURL(/\/projects$/, { timeout: 20_000 });

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Горячие клавиши" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("/");
  await expect(page.getByRole("combobox", { name: "Команда или поиск" })).toBeFocused();
});

test("the API documentation is public, in both languages", async ({ page }) => {
  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { level: 1, name: "API Plano" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Вебхуки" })).toBeVisible();
  await page.goto("/en/docs/api");
  await expect(page.getByRole("heading", { level: 1, name: "Plano API" })).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/[А-Яа-яЁё]/);
});
