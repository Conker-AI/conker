import { test, expect } from "@playwright/test";
test("mismatched deletion and historic expiry remain legible", async ({ page }) => {
 await page.goto("/inbox/cleanup"); await expect(page.getByText("Intent mismatch:", { exact: false })).toBeVisible();
 await page.goto("/inbox/expired"); await expect(page.getByRole("button", { name: "Approve once" })).toBeDisabled();
});
