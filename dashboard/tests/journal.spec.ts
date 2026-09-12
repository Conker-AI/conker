import { test, expect } from "@playwright/test";
test("journal filters audit records by actor and date", async ({ page }) => {
  await page.goto("/journal?actor=Workshop");
  await expect(
    page.getByText("Deletion requested while summarising reading notes"),
  ).toBeVisible();
  await expect(
    page.getByText("Read three events from your calendar"),
  ).toHaveCount(0);
  await page.getByLabel("Filter by date").fill("2026-09-10");
  await expect(
    page.getByRole("heading", { name: "No events in this view." }),
  ).toBeVisible();
});
test("preview decisions appear in the same trail", async ({ page }) => {
  await page.goto("/inbox/coach");
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await page.getByRole("link", { name: "Journal", exact: true }).click();
  await expect(page.getByText("Denied coach · preview only")).toBeVisible();
});
