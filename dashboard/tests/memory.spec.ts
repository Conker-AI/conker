import { test, expect } from "@playwright/test";
test("memory correction and forgetting are shared resource transitions", async ({ page }) => {
 await page.goto("/memory/judo"); await expect(page.getByText("Meaning search is unavailable.", { exact: false })).toBeVisible();
 await page.getByRole("button", { name: "Correct", exact: true }).click(); await page.getByLabel("Your correction").fill("Judo is Wednesday at 18:00.");
 await page.getByRole("button", { name: "Save correction" }).click(); await expect(page.getByRole("heading", { name: "Judo is Wednesday at 18:00." })).toBeVisible();
 await page.getByRole("button", { name: "Forget", exact: true }).click(); await page.getByRole("button", { name: "Forget memory" }).click();
 await expect(page.getByText("Memory forgotten. A content-free tombstone", { exact: false })).toBeVisible();
});
