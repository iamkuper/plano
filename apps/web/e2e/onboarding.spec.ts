import { expect, test } from "@playwright/test";
import { apiAs, signIn, signUp, uid } from "./helpers";

test("registration through the form leads to the welcome dialog; it can be closed for good", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Название компании").fill(`Студия ${uid("a")}`);
  await page.getByLabel("Ваше имя").fill("Мария Орлова");
  await page.getByLabel("Почта").fill(`${uid("m")}@e2e.test`);
  await page.getByLabel("Пароль").fill("password-123");
  await page.getByRole("button", { name: "Создать" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  const welcome = page.getByRole("dialog");
  await expect(welcome).toBeVisible();
  await welcome.getByRole("button", { name: "Не нужно, закрыть" }).click();
  await expect(welcome).toBeHidden();
  await expect(page.getByText("Начало работы")).toBeHidden();

  // The choice is stored on the server, not in the browser.
  await page.reload();
  await expect(page.getByText("Начало работы")).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("checklist progresses with real actions and can be hidden, then reopened from the profile", async ({ page }) => {
  const acc = await signUp("onb");
  await signIn(page, acc.token);
  await page.getByRole("dialog").getByRole("button", { name: "Начать" }).click();
  const card = page.locator("section,div").filter({ hasText: "Начало работы" }).first();
  await expect(page.getByText("Выполнено 0 из 5")).toBeVisible();

  const a = apiAs(acc.token);
  const project = await a.post("/projects", { title: "Первый" });
  const board = await a.get(`/projects/${project.id}/board`);
  await a.post("/cards", { columnId: board.columns[0].id, title: "Задача" });
  await page.reload();
  await expect(page.getByText("Выполнено 2 из 5")).toBeVisible();
  await expect(page.locator('[data-step="project"]')).toHaveAttribute("data-done", "true");
  await expect(card).toBeVisible();

  await page.getByRole("button", { name: "Скрыть начало работы" }).click();
  await expect(page.getByText("Выполнено 2 из 5")).toBeHidden();

  await page.goto("/profile");
  await page.getByRole("button", { name: "Показать начало работы" }).click();
  await page.goto("/dashboard");
  await expect(page.getByText("Выполнено 2 из 5")).toBeVisible();
});

test("the sample project button fills the workspace", async ({ page }) => {
  const acc = await signUp("smp");
  await signIn(page, acc.token);
  await page.getByRole("button", { name: "Создать пример проекта" }).click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByRole("heading").first()).toBeVisible();
});
