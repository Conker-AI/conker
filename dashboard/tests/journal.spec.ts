import { test, expect } from "@playwright/test";
test("journal filters by actor and date", async ({ page }) => {
 await page.goto("/journal"); await page.getByLabel("Filter by actor").selectOption("Workshop");
 await expect(page.getByText("Deletion requested while summarising reading notes")).toBeVisible();
 await page.getByLabel("Filter by date").fill("2026-09-10"); await expect(page.getByText("No events in this view.")).toBeVisible();
});
