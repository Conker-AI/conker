import { test, expect } from "@playwright/test";
test("setup is outside the shell and explains password and degraded readiness honestly", async ({
  page,
}) => {
  await page.goto("/setup");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Make this your space" }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Sasha");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Nothing is stored or sent.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Demo passphrase").fill("a pretend passphrase");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Companion’s name").fill("Juniper");
  await page.getByRole("tab", { name: "Gentle" }).click();
  await page.getByRole("button", { name: "Check the space" }).click();
  await expect(
    page.locator('[data-slot="status"][data-state="degraded"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter your space" }).click();
  await expect(page.getByRole("button", { name: "Owner menu" })).toContainText(
    "Sasha",
  );
});
