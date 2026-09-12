import { test, expect } from "@playwright/test";

test("both themes reach actual component colours and Escape closes owner preferences", async ({
  page,
}) => {
  await page.goto("/inbox/coach");
  const colours = () =>
    page.evaluate(() =>
      [
        "body",
        '[data-slot="card"]',
        '[data-slot="button"][data-variant="default"]',
      ].map(
        (selector) =>
          getComputedStyle(document.querySelector(selector)!).backgroundColor,
      ),
    );
  const light = await colours();
  await page.getByRole("button", { name: "Owner menu" }).click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  const dark = await colours();
  for (let i = 0; i < light.length; i++) expect(dark[i]).not.toEqual(light[i]);
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect.poll(colours).toEqual(light);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Use dark theme" }),
  ).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Owner menu" })).toBeFocused();
  await page.getByRole("link", { name: "System", exact: true }).click();
  const statusColour = (state: string) =>
    page
      .locator(
        `[data-slot="status"][data-state="${state}"] [data-slot="badge"]`,
      )
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await statusColour("empty")).not.toEqual(
    await statusColour("degraded"),
  );
});

test("all routes fit a small phone and the sheet keeps the sidebar hierarchy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const routes = [
    "/chat/week",
    "/inbox",
    "/system",
    "/agents/conker",
    "/tools",
    "/memory",
    "/journal",
    "/jobs",
    "/setup",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBe(true);
  }
  await page.goto("/chat/week");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page
    .getByRole("navigation", { name: "Main navigation" })
    .filter({ visible: true });
  await expect(nav.getByRole("link")).toHaveText([
    "Chat",
    "Inbox3",
    "Memory",
    "Journal",
    "Agents",
    "Tools",
    "Jobs",
    "System",
  ]);
  await nav.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("preview screens never make data requests or contact another origin", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("request", (request) => {
    if (
      ["fetch", "xhr", "eventsource"].includes(request.resourceType()) ||
      new URL(request.url()).origin !== "http://127.0.0.1:5173"
    )
      violations.push(request.url());
  });
  for (const route of [
    "/",
    "/inbox",
    "/system",
    "/agents",
    "/tools",
    "/memory",
    "/journal",
    "/jobs",
    "/setup",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(violations).toEqual([]);
});

test("a conversation survives navigation and Chat reopens the latest thread", async ({
  page,
}) => {
  await page.goto("/chat/week");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  const thread = page.url();
  await page.getByLabel("Message Conker").fill("Can we leave Wednesday free?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Stop reply" })).toBeVisible();
  await page.getByRole("button", { name: "Stop reply" }).click();
  await page.getByRole("link", { name: "Inbox" }).click();
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page).toHaveURL(thread);
  await expect(
    page.getByText("Can we leave Wednesday free?", { exact: true }),
  ).toBeVisible();
});
