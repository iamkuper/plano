import { expect, test } from "@playwright/test";
import { apiAs, makeProject, signIn, signUp } from "./helpers";

test("task types: create in settings, pick in a card, filter the board", async ({ page }) => {
  const acc = await signUp("types");
  const { project } = await makeProject(acc.token, "Сайт", ["Первая", "Вторая"]);

  await signIn(page, acc.token, "/settings/types");
  await expect(page.getByText("По умолчанию", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Новый тип" }).click();
  await page.getByRole("dialog").getByLabel("Название").fill("Ошибка");
  await page.getByRole("radio", { name: "red" }).click();
  await page.getByRole("button", { name: "Создать тип" }).click();
  await expect(page.getByText("Ошибка").first()).toBeVisible();

  await page.goto(`/projects/${project.id}`);
  await page.getByText("Первая").click();
  await page.getByLabel("Тип").selectOption({ label: "Ошибка" });
  await expect.poll(async () => {
    const board = await apiAs(acc.token).get(`/projects/${project.id}/board`);
    return board.columns[0].cards.map((c: { type: { name: string } }) => c.type.name).sort();
  }).toEqual(["Задача", "Ошибка"]);
});
