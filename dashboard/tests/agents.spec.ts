import { test, expect } from "@playwright/test";
test("agents render bounded grants and show the before and after of an edit", async ({
  page,
}) => {
  await page.goto("/agents/conker");
  await expect(
    page.getByRole("heading", { name: "Standing grants" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review bounds" }).first().click();
  await page.getByLabel("Maximum uses per day").fill("12");
  await expect(page.getByText("Proposed: 12 per day")).toBeVisible();
  await page.getByRole("button", { name: "Apply to preview" }).click();
  await expect(page.getByRole("status")).toContainText("No live permission");
});
