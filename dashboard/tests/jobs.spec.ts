import { test, expect } from "@playwright/test";
test("paused jobs cannot run and a replay leaves a result", async ({ page }) => {
 await page.goto("/jobs/backup"); await page.getByRole("button", { name: "Pause", exact: true }).click();
 await expect(page.getByRole("button", { name: "Run now" })).toBeDisabled(); await page.getByRole("button", { name: "Resume schedule" }).click();
 await page.getByRole("button", { name: "Run now" }).click(); await expect(page.getByText("Replayed 1 fixture run.", { exact: false })).toBeVisible();
});
