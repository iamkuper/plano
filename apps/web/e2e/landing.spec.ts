import { expect, test } from "@playwright/test";

const CYRILLIC = /[А-Яа-яЁё]/;

test("the English landing lives at /en, with its own prices, links and language switch", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your team's tasks in one calm place");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru"); // the shell is shared; the page itself says en
  await expect(page.locator('[lang="en"]').first()).toBeVisible();

  // Search engines are told about both versions.
  await expect(page.locator('link[rel="alternate"][hreflang="ru"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en$/);

  // Nothing Russian in the page itself (the footer keeps the legal details and document titles).
  const main = await page.locator("main").first().innerText();
  expect(main.split("\n").filter((l) => CYRILLIC.test(l))).toEqual([]);

  // AI agents are among the features and the Business plan.
  await expect(page.getByRole("heading", { name: "AI agents on your team" })).toBeVisible();
  await expect(page.getByText("On the Business plan").first()).toBeVisible();
  await expect(page.getByText("AI agents on your own key").first()).toBeVisible();

  // Dollars on the English pricing, a year being ten months.
  await page.getByRole("link", { name: "Pricing" }).first().click();
  await expect(page).toHaveURL(/\/en\/pricing$/);
  await expect(page.getByText("$14.99")).toBeVisible();
  await expect(page.getByText("$29.99")).toBeVisible();
  await expect(page.getByText("$0", { exact: true })).toBeVisible();
  await expect(page.locator("main").first()).not.toContainText("₽");
  await page.getByRole("tab", { name: "Yearly — 2 months free" }).click();
  await expect(page.getByText("$12.49")).toBeVisible();
  await expect(page.getByText("$24.99")).toBeVisible();

  // Switching language keeps you on the same page.
  await page.getByRole("link", { name: "ru", exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Тарифы Plano");
  await expect(page.getByText("490 ₽")).toBeVisible();
  await expect(page.getByText("ИИ-агенты на вашем ключе").first()).toBeVisible();

  // Sign-up from the English site is in English.
  await page.goto("/en");
  await page.getByRole("link", { name: /Try free for 14 days/ }).first().click();
  await expect(page).toHaveURL(/\/register\?lang=en/);
  await expect(page.getByRole("heading", { name: "Create a workspace" })).toBeVisible();
});

test("the Russian landing stays at the root and mentions the agents", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Задачи команды в одном спокойном месте");
  await expect(page.getByRole("heading", { name: "ИИ-агенты в команде" })).toBeVisible();
  await expect(page.getByText("На тарифе Business").first()).toBeVisible();
  await page.getByText("Что такое ИИ-агенты и сколько они стоят?").click();
  await expect(page.getByText(/Доступен на тарифе Business/)).toBeVisible();
  await page.getByRole("link", { name: "en", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
});
