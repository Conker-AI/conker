import { test, expect } from "@playwright/test";
test("onboarding is short and separate from full Character Studio", async ({
  page,
}) => {
  await page.goto("/setup");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Enter the preview" }).click();
  await expect(
    page.getByText("No real service was contacted.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Sasha");
  await page
    .getByRole("button", { name: "Open your first conversation" })
    .click();
  await expect(page.getByRole("button", { name: "Owner menu" })).toContainText(
    "Sasha",
  );
});
