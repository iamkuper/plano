import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiAs, platformAction, signIn, signUp, makeProject } from "./helpers";

// The bank stand-in hydrates late in dev mode; clicking too early does nothing.
async function mockPay(page: Page, label: "Оплатить" | "Отклонить платёж") {
  await page.waitForURL(/\/billing\/mock-pay/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: label }).click();
}

test("paying through the test terminal activates the plan", async ({ page }) => {
  const acc = await signUp("pay");
  await signIn(page, acc.token, "/settings/billing");
  await expect(page.getByText("Платежи идут через тестовый режим")).toBeVisible();
  await page.getByRole("button", { name: "Выбрать" }).first().click();
  await mockPay(page, "Оплатить");
  await expect(page).toHaveURL(/\/settings\/billing\?paid=1/);
  await expect(page.getByRole("button", { name: "Текущий тариф" }).first()).toBeVisible();
  await expect(page.getByText("Платежи", { exact: true })).toBeVisible();
});

test("a declined payment leaves the plan unchanged", async ({ page }) => {
  const acc = await signUp("decl");
  await signIn(page, acc.token, "/settings/billing");
  await page.getByRole("button", { name: "Выбрать" }).first().click();
  await mockPay(page, "Отклонить платёж");
  await expect(page).toHaveURL(/paid=0/);
  const b = await apiAs(acc.token).get("/billing");
  expect(b.subscription.status).toBe("TRIALING");
});

test("an expired plan locks the workspace to read-only but keeps billing open", async ({ page }) => {
  const acc = await signUp("lock");
  const { project } = await makeProject(acc.token, "Сайт", ["Первая"]);
  await platformAction(acc.company, "lock");

  await signIn(page, acc.token, `/projects/${project.id}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Тариф закончился: данные доступны только для чтения");
  await expect(page.getByText("Первая")).toBeVisible();

  // Writes are refused by the server, reads and billing still work.
  const res = await page.evaluate(async ([api, token, id]) => {
    const post = await fetch(`${api}/projects`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "Нельзя" }) });
    const get = await fetch(`${api}/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await post.json();
    return { post: post.status, code: body.code, get: get.status };
  }, ["http://localhost:3201", acc.token, project.id]);
  expect(res).toEqual({ post: 402, code: "WORKSPACE_LOCKED", get: 200 });

  await page.getByRole("link", { name: "Оплатить тариф" }).click();
  await expect(page).toHaveURL(/\/settings\/billing/);
  await expect(page.getByText(/закончился/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Перейти на бесплатный" })).toBeVisible();

  // Paying brings the workspace back to life.
  await page.getByRole("button", { name: "Выбрать" }).first().click();
  await mockPay(page, "Оплатить");
  await expect(page).toHaveURL(/paid=1/);
  await expect(page.getByRole("main").getByRole("alert")).toBeHidden();
  const create = await fetch("http://localhost:3201/projects", { method: "POST", headers: { Authorization: `Bearer ${acc.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "Теперь можно" }) });
  expect(create.status).toBe(201);
});

test("a locked workspace can step down to the free plan", async ({ page }) => {
  const acc = await signUp("free");
  await platformAction(acc.company, "lock");
  await signIn(page, acc.token, "/settings/billing");
  await page.getByRole("button", { name: "Перейти на бесплатный" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeHidden();
  expect((await apiAs(acc.token).get("/billing")).plan.id).toBe("FREE");
});
