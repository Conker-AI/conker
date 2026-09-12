import { test, expect } from "@playwright/test";
test("approval remains pending until acknowledgement and receipt is shared across surfaces", async ({ page }) => {
  await page.goto("/inbox/coach");
  await expect(page.getByText("You asked", { exact: true })).toBeVisible();
  await expect(page.getByText("It wants to", { exact: true })).toBeVisible();
  await page.getByText("Full detail & binding", { exact: true }).click();
  await expect(page.getByText("120 seconds after approval", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Approve once" }).click();
  await expect(page.getByText("Decision pending.", { exact: false })).toBeVisible();
  await expect(page.getByText("Approved, awaiting an execution receipt.", { exact: false })).toBeVisible();
  await expect(page.getByText("sample action completed", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve once" })).toBeDisabled();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator('[data-action-id="action-coach"]')).toContainText("sample action completed");
  await page.getByRole("link", { name: "Journal", exact: true }).click();
  await page.getByText("Approved email.send", { exact: true }).click();
  await expect(page.locator('[data-action-id="action-coach"]').first()).toContainText("sample action completed");
});
test("missing execution receipt stays unknown and checking never dispatches again", async ({ page }) => {
  await page.goto("/inbox/coach"); await page.getByText("Preview a different outcome", { exact: true }).click();
  await page.getByLabel("Decision scenario").selectOption("unknown");
  await page.getByRole("button", { name: "Approve once" }).click();
  await expect(page.getByText("Outcome unknown.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Check existing action" }).click();
  await expect(page.getByText("No second dispatch was made.", { exact: false })).toBeVisible();
  await expect(page.getByText("sample action completed", { exact: false })).toHaveCount(0);
});
test("expiry before acceptance cannot become approval", async ({ page }) => {
  await page.goto("/inbox/coach"); await page.getByText("Preview a different outcome", { exact: true }).click();
  await page.getByLabel("Decision scenario").selectOption("expired");
  await page.getByRole("button", { name: "Approve once" }).click();
  await expect(page.getByText("Authority expired or the request changed.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve once" })).toBeDisabled();
  await expect(page.getByText("sample action completed", { exact: false })).toHaveCount(0);
});
test("a deleted citation is a tombstone, not a dangling source or retained quote", async ({ page }) => {
  await page.goto("/chat/week"); await page.getByRole("button", { name: "Preview scenario" }).click();
  await page.getByRole("button", { name: "Preview deleted citation" }).click(); await page.keyboard.press("Escape");
  await expect(page.getByText("Source message was forgotten.", { exact: false })).toBeVisible();
  await expect(page.locator('[data-message-id="week-user"]')).toContainText("content-free tombstone");
  await expect(page.locator('[data-message-id="week-user"]')).not.toContainText("Judo is Tuesday");
});
test("reply recovery never re-invokes a completed action", async ({ page }) => {
  await page.goto("/chat/server"); await page.getByRole("button", { name: "Ask only for the reply" }).click();
  await expect(page.getByText("This reply did not invoke the tool again.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask only for the reply" })).toHaveCount(0);
});
