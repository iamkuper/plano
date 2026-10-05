import { expect, test } from "@playwright/test";
import { apiAs, makeProject, signIn, signUp } from "./helpers";

test("the board text filter finds a word that is only in a description", async ({ page }) => {
  const acc = await signUp("desc");
  const { project } = await makeProject(acc.token, "Поиск", ["Альфа", "Бета", "Гамма"]);
  const cards = (await apiAs(acc.token).get(`/projects/${project.id}/board`)).columns[0].cards;
  await apiAs(acc.token).patch(`/cards/${cards.find((c: { title: string }) => c.title === "Бета").id}`, { description: "Позвонить в бухгалтерию до обеда" });

  await signIn(page, acc.token, `/projects/${project.id}`);
  await expect(page.getByText("Альфа")).toBeVisible();
  await page.getByLabel("Найти карточку на доске").fill("бухгалтер");
  await expect(page.getByText("Бета")).toBeVisible();
  await expect(page.getByText("Альфа")).toHaveCount(0);
  await expect(page.getByText("Гамма")).toHaveCount(0);
  await page.getByLabel("Найти карточку на доске").fill("Гамма");
  await expect(page.getByText("Гамма")).toBeVisible();
  await expect(page.getByText("Бета")).toHaveCount(0);
});

test("a colleague's change patches one card in without reloading the board", async ({ page }) => {
  const acc = await signUp("live");
  const { project } = await makeProject(acc.token, "Живая", ["Первая", "Вторая"]);
  const board = await apiAs(acc.token).get(`/projects/${project.id}/board`);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await signIn(page, acc.token, `/projects/${project.id}`);
  await expect(page.getByText("Первая")).toBeVisible();
  await page.waitForTimeout(500); // the socket joins its room
  const boardCalls = () => requests.filter((p) => p === `/projects/${project.id}/board`).length;
  const loads = boardCalls(); // the dev server may read it twice

  const first = (await apiAs(acc.token).get(`/projects/${project.id}/board`)).columns[0].cards[0];
  const target = board.columns[1].id;
  const before = requests.length;
  await apiAs(acc.token).post(`/cards/${first.id}/move`, { columnId: target });
  const column = page.getByRole("region", { name: board.columns[1].title }).or(page.locator(`[aria-label="${board.columns[1].title}"]`));
  await expect(column.getByText("Первая")).toBeVisible({ timeout: 10_000 });
  const after = requests.slice(before);
  expect(after.some((p) => p === `/cards/${first.id}/tile`)).toBe(true);
  expect(after.filter((p) => p === `/projects/${project.id}/board`)).toHaveLength(0); // the tile and the project header were fetched, not the board
  expect(boardCalls() - loads).toBe(0);
});

test("the time report sums up on the server, loads a group when opened and exports a file", async ({ page }) => {
  const acc = await signUp("time");
  const { project } = await makeProject(acc.token, "Учёт", ["Вёрстка"]);
  const card = (await apiAs(acc.token).get(`/projects/${project.id}/board`)).columns[0].cards[0];
  const today = new Date().toISOString().slice(0, 10);
  await apiAs(acc.token).post(`/cards/${card.id}/time`, { minutes: 90, date: today, note: "правки" });
  await apiAs(acc.token).post(`/cards/${card.id}/time`, { minutes: 30, date: today });

  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await signIn(page, acc.token, "/reports/time");
  await expect(page.getByRole("button", { name: new RegExp(acc.name) })).toBeVisible();
  await expect(page.getByText("2 ч", { exact: true }).first()).toBeVisible();
  expect(requests).toContain("/reports/time/summary");
  expect(requests).not.toContain("/reports/time/entries"); // nothing but totals until a group is opened

  await page.getByRole("button", { name: new RegExp(acc.name) }).click();
  await expect(page.getByText(/— правки/)).toBeVisible();
  expect(requests).toContain("/reports/time/entries");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Выгрузить в Excel/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^uchet-vremeni_.*\.csv$/);
});
