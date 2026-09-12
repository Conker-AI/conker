import { test, expect } from "@playwright/test";
test("dark theme really changes components and switches back", async ({
  page,
}) => {
  await page.goto("/inbox/coach");
  await expect(
    page.getByRole("button", { name: "Approve once" }),
  ).toBeVisible();
  const colours = () =>
    page.evaluate(() =>
      [
        "body",
        ".approval-ticket",
        '[data-slot="button"][data-variant="default"]',
      ].map(
        (selector) =>
          getComputedStyle(document.querySelector(selector)!).color +
          " / " +
          getComputedStyle(document.querySelector(selector)!).backgroundColor,
      ),
    );
  const dark = await colours();
  await page.getByRole("button", { name: "Owner menu" }).click();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect.poll(colours).not.toEqual(dark);
  const light = await colours();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect.poll(colours).toEqual(dark);
  for (let i = 0; i < dark.length; i++) expect(light[i]).not.toEqual(dark[i]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Owner menu" })).toBeFocused();
});
test("phone layout shows one messenger pane at a time without losing destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat/week");
  await expect(page.locator(".contact-pane")).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "Conversation", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to chats" }).click();
  await expect(page.locator(".contact-pane")).toBeVisible();
  await page.getByRole("link", { name: "Open Companion home" }).click();
  await expect(page).toHaveURL(/chat\/week/);
  for (const route of [
    "/inbox/coach",
    "/system",
    "/agents/conker",
    "/tools",
    "/memory",
    "/journal",
    "/jobs",
    "/companion",
    "/terminal",
    "/setup",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBe(true);
  }
});
test("resource traffic stays in the intercepted fixture namespace", async ({
  page,
}) => {
  const unexpected: string[] = [];
  const fixtureResponses: boolean[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== "http://127.0.0.1:5173" ||
      (request.resourceType() === "fetch" &&
        !url.pathname.startsWith("/__fixture/v1/"))
    )
      unexpected.push(request.url());
  });
  page.on("response", (response) => {
    if (response.url().includes("/__fixture/v1/"))
      fixtureResponses.push(response.fromServiceWorker());
  });
  await page.goto("/chat/week");
  await expect(page.locator("[data-message-id=week-plan]")).toBeVisible();
  expect(unexpected).toEqual([]);
  expect(fixtureResponses.length).toBeGreaterThan(0);
  expect(fixtureResponses.every(Boolean)).toBe(true);
});
