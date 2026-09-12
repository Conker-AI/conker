import { test, expect } from "@playwright/test";
test("Character Studio saves the profile without implying a live renderer or new authority", async ({
  page,
}) => {
  await page.goto("/companion");
  await page.getByLabel("Name", { exact: true }).fill("Juniper");
  await page.getByRole("button", { name: "Save character" }).click();
  await expect(page.getByText("Saved in this preview.")).toBeVisible();
  await page.getByRole("tab", { name: "Appearance" }).click();
  await page.getByLabel("Renderer", { exact: true }).selectOption("live-3d");
  await expect(
    page.locator("#main").getByRole("img", { name: "Juniper neutral portrait" }),
  ).toBeVisible();
  await expect(
    page.getByText("Live renderer is not installed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save character" }).click();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".contact-pane")).toContainText("Juniper");
});
test("terminal is a disconnected owner workspace and cannot execute commands", async ({
  page,
}) => {
  await page.goto("/terminal");
  await expect(
    page.getByLabel("Terminal command (not connected)"),
  ).toBeDisabled();
  await expect(
    page.getByText("SystemGate remains read-only observation", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview connection requirement" })
    .click();
  await expect(
    page.getByText("no shell service or authenticated connection", {
      exact: false,
    }),
  ).toBeVisible();
});
