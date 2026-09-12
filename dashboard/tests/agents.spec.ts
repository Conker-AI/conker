import { test, expect } from "@playwright/test";
test("standing grants show bounds and preserve budget when frequency changes", async ({ page }) => {
 await page.goto("/agents/conker"); await page.getByRole("button", { name: "Review bounds" }).first().click();
 await page.getByLabel("Maximum uses per day").fill("5"); await expect(page.getByText("Budget stays $0", { exact: false })).toBeVisible();
 await page.getByRole("button", { name: "Apply to preview" }).click(); await expect(page.getByText("5 per day", { exact: true })).toBeVisible();
});
