import { expect, test } from "@playwright/test";
import { apiAs, makeProject, platformAction, signIn, signUp, uid } from "./helpers";

test("inviting a colleague: link, acceptance and a shared workspace", async ({ page, browser }) => {
  const acc = await signUp("inv");
  const colleague = `${uid("c")}@e2e.test`;
  await signIn(page, acc.token, "/settings/users?invite=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Почта").fill(colleague);
  await dialog.getByRole("button", { name: /Пригласить|Создать|Отправить/ }).click();
  const link = await page.getByLabel("Ссылка-приглашение").inputValue();
  expect(link).toContain("/invite/");

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(link);
  await expect(guest.getByText(colleague)).toBeVisible();
  await guest.getByLabel("Ваше имя").fill("Пётр Коллегин");
  await guest.getByLabel("Пароль").fill("password-123");
  await guest.getByRole("button", { name: "Принять приглашение" }).click();
  await expect(guest).toHaveURL(/\/dashboard/);
  // Members see the short checklist, not the owner's.
  await expect(guest.getByRole("dialog", { name: "Добро пожаловать в команду" })).toBeVisible();
  await ctx.close();

  const users = await apiAs(acc.token).get("/users");
  expect(users.map((u: { email: string }) => u.email)).toContain(colleague);
});

test("Business: custom fields appear in a card, Gantt is available", async ({ page }) => {
  const acc = await signUp("biz");
  await platformAction(acc.company, "grant", "BUSINESS");
  const { project } = await makeProject(acc.token, "Стройка", ["Фундамент"]);

  await signIn(page, acc.token, "/settings/fields");
  await page.getByRole("button", { name: "Новое поле" }).click();
  await page.getByRole("dialog").getByLabel("Название").fill("Бюджет");
  await page.getByRole("dialog").getByLabel("Тип").selectOption({ index: 1 });
  await page.getByRole("dialog").getByRole("button", { name: /Сохранить|Создать|Добавить/ }).click();
  await expect(page.getByText("Бюджет").first()).toBeVisible();

  await page.goto(`/projects/${project.id}`);
  await page.getByText("Фундамент").click();
  await expect(page.getByText("Бюджет").first()).toBeVisible();

  await page.goto(`/projects/${project.id}?view=gantt`);
  await expect(page.getByText("Фундамент").first()).toBeVisible();
  await expect(page.getByText(/Доступен в тарифе|Business/)).toHaveCount(0);
});

test("Free plan shows the upgrade hint instead of the Gantt chart", async ({ page }) => {
  const acc = await signUp("gfree");
  await platformAction(acc.company, "free");
  const { project } = await makeProject(acc.token, "Малый", ["Один"]);
  await signIn(page, acc.token, `/projects/${project.id}?view=gantt`);
  await expect(page.getByText(/Business/).first()).toBeVisible();
});
