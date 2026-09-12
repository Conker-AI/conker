import { test, expect } from "@playwright/test";
test("memory labels word-only search honestly and retains a correction", async ({
  page,
}) => {
  await page.goto("/memory");
  await expect(
    page.getByText("it does not translate your query", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Search memories by exact words").fill("предпочитаю");
  await expect(
    page.getByRole("heading", {
      name: "Я предпочитаю тренироваться перед школой.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  await page
    .getByLabel("Your correction")
    .fill("I prefer evening training during term.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await page.getByLabel("Search memories by exact words").fill("");
  await expect(
    page.getByRole("heading", {
      name: "I prefer evening training during term.",
    }),
  ).toBeVisible();
});
test("forgetting leaves a readable tombstone", async ({ page }) => {
  await page.goto("/memory/judo");
  await page.getByRole("button", { name: "Forget", exact: true }).click();
  await page
    .getByRole("button", { name: "Forget memory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Memory forgotten in this preview" }),
  ).toBeVisible();
});
