import { test, expect } from "@playwright/test";
test("tools filter by consequence and retain their scope details", async ({
  page,
}) => {
  await page.goto("/tools");
  await page
    .getByLabel("Sensitivity", { exact: true })
    .selectOption("act outward");
  await expect(page.getByRole("link", { name: "Send an email" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Read your calendar" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview unavailable catalogue" })
    .click();
  await expect(
    page.locator('[data-slot="status"][data-state="offline"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The catalogue could not be reached." }),
  ).toBeVisible();
});
