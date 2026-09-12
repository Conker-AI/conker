import { test, expect } from "@playwright/test";
test("message actions remain inline and no approval modal blocks the thread", async ({ page }) => {
 await page.goto("/chat/week");
 await expect(page.locator("[data-action-id=calendar]")).toContainText("calendar.read");
 await expect(page.getByRole("link", { name: "Review in Inbox" })).toHaveAttribute("href", "/inbox/coach");
 await expect(page.getByRole("dialog")).toHaveCount(0);
});
