import { test, expect } from "@playwright/test";
test("a paused job cannot run and resumes with its fixture outcome", async ({
  page,
}) => {
  await page.goto("/jobs/nightly");
  await expect(page.getByText("msg_fixture_0184")).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run now" })).toBeDisabled();
  await page.getByRole("button", { name: "Resume schedule" }).click();
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(
    page.getByText("Replayed 1 fixture run.", { exact: false }),
  ).toBeVisible();
});
