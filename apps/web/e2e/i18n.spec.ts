import { expect, test, type Page } from "@playwright/test";
import { apiAs, signIn, signUp, uid } from "./helpers";

const CYRILLIC = /[А-Яа-яЁё]/;

async function expectEnglish(page: Page, where: string) {
  // Let data and the first paint settle before reading the page text.
  await page.waitForLoadState("networkidle");
  const text = await page.locator("body").innerText();
  // Language names are shown in their own language on purpose.
  const found = text.split("\n").filter((l) => CYRILLIC.test(l) && l.trim() !== "Русский");
  expect(found, `Cyrillic text left on ${where}`).toEqual([]);
}

test("sign up in English: the whole product speaks English, the choice sticks", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("link", { name: "Create a workspace" }).click();
  await page.getByLabel("Company name").fill(`Studio ${uid("e")}`);
  await page.getByLabel("Your name").fill("Ann Miller");
  await page.getByLabel("Email").fill(`${uid("ann")}@e2e.test`);
  await page.getByLabel("Password").fill("password-123");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  const welcome = page.getByRole("dialog");
  await expect(welcome).toContainText("Welcome to Plano");
  await expectEnglish(page, "welcome");
  await welcome.getByRole("button", { name: "Create a sample project" }).click();

  // The starter project is the onboarding funnel, in English.
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByText("Look around the board")).toBeVisible();
  await expect(page.getByText("Backlog").first()).toBeVisible();
  await expectEnglish(page, "the starter board");

  await page.getByText("Look around the board").click();
  await expect(page.getByText("Discussion")).toBeVisible();
  await expectEnglish(page, "a card");
  await page.getByTitle("Close (Esc)").click();

  for (const view of ["Table", "List", "Calendar", "Gantt", "Overview"]) {
    await page.getByRole("tab", { name: view }).click();
    await expectEnglish(page, `the ${view} view`);
  }

  // Survives a reload and a new visit.
  await page.reload();
  await expect(page.getByRole("tab", { name: "Table" })).toBeVisible();
});

test("every settings page and the dashboard are fully English", async ({ page }) => {
  const acc = await signUp("eng", "en");
  await signIn(page, acc.token, "/dashboard");
  await page.getByRole("button", { name: "Close", exact: false }).first().click().catch(() => {});
  for (const path of ["/dashboard", "/projects", "/team", "/reports/time", "/settings", "/settings/users", "/settings/templates", "/settings/roles", "/settings/types", "/settings/agents", "/settings/fields", "/settings/audit", "/settings/billing", "/profile"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expectEnglish(page, path);
  }
});

test("switching the language in the profile is saved on the account", async ({ page }) => {
  const acc = await signUp("sw");
  await signIn(page, acc.token, "/profile");
  await page.getByLabel("Язык интерфейса").selectOption("en");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  expect((await apiAs(acc.token).get("/users/me")).locale).toBe("en");
  await page.getByLabel("Interface language").selectOption("ru");
  await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();
  expect((await apiAs(acc.token).get("/users/me")).locale).toBe("ru");
});

test.describe("cookie notice", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is shown in the visitor's language until accepted", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("dialog", { name: "Использование cookie" })).toBeVisible();
    await page.getByRole("button", { name: "English" }).click();
    const banner = page.getByRole("dialog", { name: "Cookie notice" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Accept" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Cookie notice" })).toBeHidden();
  });
});
