import { test, expect } from "@playwright/test";
test("tools expose consequence and scope through the shared inspector", async ({ page }) => {
 await page.goto("/tools"); await page.getByLabel("Search tools").fill("email.send");
 await page.locator(".resource-title").click(); await expect(page.getByText("Scoped agents", { exact: true })).toBeVisible();
 await expect(page.getByText("act outward", { exact: true })).toBeVisible();
});
