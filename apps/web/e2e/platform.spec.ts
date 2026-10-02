import { expect, test } from "@playwright/test";
import { OWNER, ownerToken, signIn, signUp } from "./helpers";

test("the back-office is invisible to everyone but the owner", async ({ page }) => {
  const acc = await signUp("plain");
  await signIn(page, acc.token, "/dashboard");
  await expect(page.locator('a[href="/platform"]')).toHaveCount(0);
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/dashboard/);

  const res = await fetch("http://localhost:3201/platform/stats", { headers: { Authorization: `Bearer ${acc.token}` } });
  expect(res.status).toBe(404);
});

test("the owner finds a workspace and grants it a plan", async ({ page }) => {
  const acc = await signUp("grant");
  const token = await ownerToken();
  expect(OWNER.email).toBe("owner@e2e.test");
  await signIn(page, token, "/platform");
  await page.getByLabel("Поиск").fill(acc.company);
  const row = page.getByRole("row", { name: new RegExp(acc.company) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("dialog")).toContainText(acc.company);
});
