import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const workshop = (page: import("@playwright/test").Page) =>
  page.locator(".contact-pane .contact").filter({ hasText: "Workshop" });
const home = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "Open Companion home" });
test("contact switching preserves each draft and scroll position", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat\/week$/);
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Leave Wednesday free");
  const scroller = page.getByTestId("conversation-scroll");
  await scroller.evaluate((element) => {
    element.scrollTop = 240;
    element.dispatchEvent(new Event("scroll"));
  });
  const scroll = await scroller.evaluate((element) => element.scrollTop);
  await workshop(page).click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Check the WAL first");
  await home(page).click();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("Leave Wednesday free");
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBe(scroll);
  await workshop(page).click();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("Check the WAL first");
});
test("a running session keeps its stream while another contact is open", async ({
  page,
}) => {
  await page.goto("/chat/week");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("One small step, please");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Sending · waiting for acceptance."),
  ).toBeVisible();
  await expect(page.locator('[data-run-state="streaming"]')).toBeVisible();
  const before = await page
    .locator(".role-assistant .message-body")
    .last()
    .innerText();
  await workshop(page).click();
  await page.waitForTimeout(900);
  await home(page).click();
  await expect
    .poll(
      async () =>
        (await page.locator(".role-assistant .message-body").last().innerText())
          .length,
    )
    .toBeGreaterThan(before.length);
  await expect(
    page.locator(".messenger-message").last().locator(".run-detail"),
  ).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.locator(".role-assistant .message-body").last(),
  ).toContainText("no model was called");
});
test("duplicate events do not duplicate reply text", async ({ page }) => {
  await page.goto("/chat/week");
  await page.getByRole("button", { name: "Preview scenario" }).click();
  await page.getByLabel("Next submission scenario").selectOption("duplicate");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Show one reply");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.locator(".messenger-message").last().locator(".run-detail"),
  ).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator(".role-assistant .message-body").last()).toHaveText(
    "Let’s leave a little room. One useful step is enough for now. I’d start with the part you can finish before dinner, then leave the rest for tomorrow. Это предложение, не правило — решать тебе. This reply is a local fixture; no model was called.",
  );
});
test("interrupted delivery recovers the same run without another submission", async ({
  page,
}) => {
  const submitted: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/submissions"))
      submitted.push(request.postData()!);
  });
  await page.goto("/chat/week");
  await page.getByRole("button", { name: "Preview scenario" }).click();
  await page.getByLabel("Next submission scenario").selectOption("interrupted");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Keep the partial reply");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Stream interrupted.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recover existing run" }).click();
  await expect(
    page.locator(".messenger-message").last().locator(".run-detail"),
  ).toBeVisible({
    timeout: 10000,
  });
  expect(submitted).toHaveLength(1);
});
test("lost acceptance is checked by submission identity", async ({ page }) => {
  await page.goto("/chat/week");
  await page.getByRole("button", { name: "Preview scenario" }).click();
  await page.getByLabel("Next submission scenario").selectOption("lost-ack");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Do not send me twice");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Acceptance unknown.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check submission" }).click();
  await expect(
    page.getByText("Do not send me twice", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.locator(".messenger-message").last().locator(".run-detail"),
  ).toBeVisible({
    timeout: 10000,
  });
});
test("group participants are snapshots and delegation never creates a contact", async ({
  page,
}) => {
  await page.goto("/chat/exam");
  await page.locator(".run-detail summary").click();
  await expect(
    page.getByText("group revision 1", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("ephemeral worker finished", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".contact-pane")).not.toContainText(
    "scratch-worker",
  );
  await page.reload();
  await expect(page.locator('[data-message-id="exam-reply"]')).toBeVisible();
});
