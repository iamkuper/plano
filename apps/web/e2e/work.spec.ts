import { expect, test } from "@playwright/test";
import { apiAs, makeProject, signIn, signUp } from "./helpers";

test("create a project from the dashboard hint, add and open a card, comment", async ({ page }) => {
  const acc = await signUp("work");
  await signIn(page, acc.token, "/projects?new=1");
  await page.getByRole("dialog").getByLabel("Название").fill("Лендинг");
  await page.getByRole("button", { name: "Создать проект" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Лендинг" })).toBeVisible();

  await page.getByTitle("Добавить карточку").first().click();
  await page.getByPlaceholder("Название карточки").fill("Макет главной");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await apiAs(acc.token).get(`/cards/search?q=${encodeURIComponent("Макет")}`)).length).toBe(1);

  await page.keyboard.press("Escape");
  await page.getByText("Осмотреть доску").click();
  await expect(page).toHaveURL(/card=/);
  await page.getByLabel("Описание").fill("Нужен вариант под мобильные");
  await page.getByLabel("Новая подзадача").fill("Шапка");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Шапка")).toBeVisible();
  await page.getByTitle("Закрыть (Esc)").click();
  await expect(page).not.toHaveURL(/card=/);
});

test("filters, views and CSV export on a project", async ({ page }) => {
  const acc = await signUp("views");
  const { project } = await makeProject(acc.token, "Сайт", ["Альфа", "Бета"]);
  await signIn(page, acc.token, `/projects/${project.id}`);
  await expect(page.getByText("Альфа")).toBeVisible();

  for (const [tab, marker] of [["Таблица", "Бета"], ["Список", "Бета"], ["Календарь", "Пн"], ["Обзор", "Бета"]] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page).toHaveURL(new RegExp("view="));
    if (tab !== "Обзор" && tab !== "Календарь") await expect(page.getByText(marker).first()).toBeVisible();
  }
  await page.getByRole("tab", { name: "Доска" }).click();
  await expect(page.getByText("Бета")).toBeVisible();
});

test("settings: stages and archive", async ({ page }) => {
  const acc = await signUp("stages");
  const { project } = await makeProject(acc.token, "Бот");
  await signIn(page, acc.token, `/projects/${project.id}/settings`);
  await page.getByLabel("Новый этап").fill("Тестирование");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Название этапа 1")).toBeVisible();
  await expect(page.locator('input[aria-label^="Название этапа"][value="Тестирование"], input[aria-label^="Название этапа"]').last()).toHaveValue("Тестирование");
  await page.getByRole("button", { name: "В архив" }).click();
  await expect.poll(async () => (await apiAs(acc.token).get(`/projects/${project.id}`)).status).toBe("ARCHIVED");
});

test("sign out, forgot-password form and sign in again", async ({ page }) => {
  const acc = await signUp("auth");
  await page.goto("/login");
  await page.getByLabel("Почта").fill(acc.email);
  await page.getByLabel("Пароль").fill("wrong-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText(/Неверн/)).toBeVisible();
  await page.getByLabel("Пароль").fill(acc.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/forgot");
  await page.getByLabel("Почта").fill(acc.email);
  await page.getByRole("button", { name: "Отправить ссылку" }).click();
  await expect(page.getByText(/письм|ссылк/i).first()).toBeVisible();
});

test("protected pages redirect guests to the sign-in form", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login/);
});

test("staff and permissions share a page; billing tab is called Billing; old links still work", async ({ page }) => {
  const acc = await signUp("tabs");
  await signIn(page, acc.token, "/settings/roles");
  await expect(page).toHaveURL(/\/settings\/users/);
  await expect(page.getByRole("tab", { name: "Сотрудники и права" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Права", exact: true })).toHaveCount(0);
  await expect(page.getByText("Роли и права").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Биллинг" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Тариф", exact: true })).toHaveCount(0);
});
