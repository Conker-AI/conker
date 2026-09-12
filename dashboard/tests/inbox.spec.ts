import { test, expect } from "@playwright/test";
test("approval exposes provenance, exact arguments and two clocks before a local decision", async ({
  page,
}) => {
  await page.goto("/inbox/coach");
  await expect(page.getByText("You asked", { exact: true })).toBeVisible();
  await expect(page.getByText("It wants to", { exact: true })).toBeVisible();
  await page.getByText("Full detail & binding", { exact: true }).click();
  await expect(
    page.getByText("120 seconds after approval", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("sha256:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Approve once" }).click();
  await expect(
    page.getByRole("button", { name: "Approve once" }),
  ).toBeDisabled();
  await expect(
    page.getByText("nothing was sent or deleted", { exact: false }),
  ).toBeVisible();
});
test("mismatched deletion remains legible and expired approvals cannot run", async ({
  page,
}) => {
  await page.goto("/inbox/cleanup");
  await expect(
    page.getByText("Intent mismatch:", { exact: false }),
  ).toBeVisible();
  await page.goto("/inbox/expired");
  await expect(
    page.getByRole("button", { name: "Approve once" }),
  ).toBeDisabled();
});
