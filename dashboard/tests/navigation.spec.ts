import { test, expect } from "@playwright/test";

test("Chats is a full-width list and search retains the Sessions or Agents mode", async ({
  page,
}) => {
  await page.goto("/chat");
  const list = page.getByRole("complementary", { name: "Chats list" });
  await expect(list.locator(".session-item")).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: "Conversation", exact: true }),
  ).toHaveCount(0);
  expect(
    await list.evaluate(
      (el) => el.clientWidth / document.querySelector("#main")!.clientWidth,
    ),
  ).toBeGreaterThan(0.98);
  await expect(
    page.getByRole("tab", { name: "Sessions", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(list.locator(".session-item").first()).toContainText(
    "Make room for the week",
  );
  await page.getByLabel("Search contacts and conversations").fill("Workshop");
  await expect(list.locator(".session-item")).toHaveCount(2);
  await page.getByRole("tab", { name: "Agents", exact: true }).click();
  await expect(list.locator(".session-item")).toHaveCount(2); // Workshop and Study room (Conker + Workshop).
  await expect(list.locator(".session-item")).not.toContainText([
    "Reading notes",
    "The backup",
  ]);
  await page.getByLabel("Search contacts and conversations").fill("");
  await expect(list.locator(".session-item")).toHaveCount(3);
  await expect(list.locator(".session-item").first()).toContainText("pinned");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.getByRole("button", { name: "Start with Workshop" }).click();
  await expect(
    page.getByRole("region", { name: "Conversation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeVisible();
});

test("Home and the title face share the remembered Companion conversation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/chat\/week$/);
  await expect(
    page.getByRole("region", { name: "Conversation", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to chats" }).click();
  await page.locator('.session-item[href="/chat/server"]').click();
  await page.getByRole("link", { name: "Chats", exact: true }).click();
  const face = page
    .locator(".sidebar-brand")
    .getByRole("link", { name: "Companion home", exact: true });
  await expect(face).toHaveAttribute("href", "/");
  await face.click();
  await expect(page).toHaveURL(/chat\/server$/);
  await page.locator('.desktop-sidebar a[href="/inbox"]').click();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/chat\/server$/);
});

test("chrome toggles independently hide panels and survive navigation and reload", async ({
  page,
}) => {
  await page.goto("/chat/week");
  const nav = page.locator(".desktop-sidebar");
  const contacts = page.getByRole("complementary", {
    name: "Conversation contacts",
  });
  await expect(nav).toBeVisible();
  await expect(contacts).toBeVisible();
  await page
    .getByRole("button", { name: "Hide navigation", exact: true })
    .click();
  await expect(nav).not.toBeVisible();
  await expect(contacts).toBeVisible();
  await page
    .getByRole("button", { name: "Hide contacts", exact: true })
    .click();
  await expect(contacts).toHaveCount(0);
  const conversation = page.getByRole("region", {
    name: "Conversation",
    exact: true,
  });
  expect(
    await conversation.evaluate((el) => el.clientWidth / innerWidth),
  ).toBeGreaterThan(0.98);
  await page.getByRole("link", { name: "Back to chats" }).click();
  await expect(
    page.getByRole("complementary", { name: "Chats list" }),
  ).toBeVisible();
  await page.locator('.session-item[href="/chat/build"]').click();
  await expect(nav).not.toBeVisible();
  await expect(contacts).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show contacts", exact: true }),
  ).toBeVisible();
  await expect(nav).not.toBeVisible();
  await page
    .getByRole("button", { name: "Show contacts", exact: true })
    .click();
  await expect(contacts).toBeVisible();
  await expect(nav).not.toBeVisible();
  await page
    .getByRole("button", { name: "Show navigation", exact: true })
    .click();
  await expect(nav).toBeVisible();
});

test("Inbox rows lead to approval or proposal detail without preopening either", async ({
  page,
}) => {
  await page.goto("/inbox");
  await expect(page.locator(".inbox-list > a")).toHaveCount(3);
  await expect(page.locator(".ticket-detail")).toHaveCount(0);
  await expect(
    page.locator('.inbox-list > a[href="/inbox/coach"]'),
  ).toContainText("Spend window 2 min once approved");
  await page.locator('.inbox-list > a[href="/inbox/coach"]').click();
  await expect(
    page.getByRole("button", { name: "Approve once" }),
  ).toBeVisible();
  await expect(page.getByLabel("Authority requested")).toContainText(
    "Current:",
  );
  await page.getByRole("link", { name: "All decisions" }).click();
  await page.locator('.inbox-list > a[href="/inbox/revision"]').click();
  await expect(
    page.getByRole("button", { name: "Prepare the blocks" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All decisions" }).click();
  await page.getByRole("tab", { name: "Decision history" }).click();
  await expect(page.locator(".inbox-list > a")).toHaveCount(2);
  await expect(page.locator(".ticket-detail")).toHaveCount(0);
});

test("every management collection opens only a list before selection", async ({
  page,
}) => {
  for (const resource of ["agents", "tools", "memory", "jobs"]) {
    await page.goto(`/${resource}`);
    await expect(page.locator(".resource-title").first()).toBeVisible();
    await expect(page.locator(".object-inspector")).toHaveCount(0);
    await page.locator(".resource-title").first().click();
    await expect(page.locator(".object-inspector")).toBeVisible();
    await expect(page.locator(".resource-list")).toHaveCount(0);
    await page.locator(".back-link").click();
    await expect(page).toHaveURL(new RegExp(`/${resource}$`));
  }
});

test("accepted activity reorders sessions while the latest Companion stays pinned", async ({
  page,
}) => {
  await page.goto("/chat");
  await expect(page.locator(".session-item")).toHaveCount(6);
  await page.locator('.session-item[href="/chat/reading"]').click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("New activity");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator('[data-run-state="streaming"]')).toBeVisible();
  await page.getByRole("link", { name: "Back to chats" }).click();
  await expect(page.locator(".session-item").first()).toHaveAttribute(
    "href",
    "/chat/week",
  );
  await expect(page.locator(".session-item").nth(1)).toHaveAttribute(
    "href",
    "/chat/reading",
  );
});
