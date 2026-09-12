import { test, expect } from "@playwright/test";
test("chat exposes tool evidence, parked approval and a stoppable fixture reply", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/chat\/week/);
  await expect(
    page.getByRole("heading", { name: "A place to think out loud." }),
  ).toBeVisible();
  await page.getByText("Checked your week", { exact: true }).click();
  await expect(
    page.getByText('"calendar": "Personal"', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review in Inbox" }),
  ).toHaveAttribute("href", "/inbox/coach");
  await page.getByLabel("Message Conker").fill("Help me think");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Stop reply" })).toBeVisible();
  await page.getByRole("button", { name: "Stop reply" }).click();
});
test("a missing reply can be recovered without repeating the recorded action", async ({
  page,
}) => {
  await page.goto("/chat/server");
  await page.getByRole("button", { name: "Ask only for the reply" }).click();
  await expect(page.getByRole("status")).toContainText(
    "did not invoke the tool again",
  );
});
