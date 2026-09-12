import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("Reply and emotion contribute without shell wiring and the host caps direct actions", async ({
  page,
}) => {
  const shell = readFileSync(
    new URL("../src/components/shell.tsx", import.meta.url),
    "utf8",
  );
  const host = readFileSync(
    new URL("../src/platform/slots.tsx", import.meta.url),
    "utf8",
  );
  expect(shell + host).not.toMatch(/replyFeature|emotionFeature/);
  await page.goto("/chat/week");
  const message = page.locator('[data-message-id="week-user"]');
  await expect(
    message.locator('[data-slot-name="message.actions"] > button'),
  ).toHaveCount(3);
  await message.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.locator(".reply-attachment")).toContainText(
    "Replying to You",
  );
  await page.getByRole("link", { name: "Back to chats" }).click();
  await page.locator('.contact-pane .session-item[href="/chat/build"]').click();
  await expect(page.locator(".reply-attachment")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to chats" }).click();
  await page.getByRole("link", { name: "Open Companion home" }).click();
  await expect(page.locator(".reply-attachment")).toContainText(
    "Replying to You",
  );
  await expect(
    page.locator('[data-message-id="week-plan"] [data-annotation="emotion"]'),
  ).toHaveText("thoughtful");
  await message.getByRole("button", { name: "More actions" }).click();
  await page.getByLabel("Search actions").fill("Open message link");
  await expect(
    page.getByRole("button", { name: "Open message link" }),
  ).toBeVisible();
});
test("unsupported commands explain why and an optional annotation can disappear without losing history", async ({
  page,
}) => {
  await page.goto("/chat/week");
  await page.getByRole("button", { name: "Composer tools" }).click();
  await expect(
    page.getByRole("button", { name: "Deep search", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Not supported by this fixture connection."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    await fetch("/__fixture/v1/capabilities/emotion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supported: false }),
    });
  });
  // A resource refetch, not a page reload that would reset the mock database.
  await page.getByRole("link", { name: "System", exact: true }).click();
  await page.waitForTimeout(100);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator('[data-annotation="emotion"]')).toHaveCount(0);
  await expect(
    page.locator('[data-message-id="week-plan"] .message-body'),
  ).toContainText("You’ve got room");
});
