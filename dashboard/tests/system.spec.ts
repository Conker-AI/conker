import { test, expect } from "@playwright/test";
test("system names services, databases and the reason for degraded search", async ({
  page,
}) => {
  await page.goto("/system");
  for (const name of [
    "Pi",
    "ToolGate",
    "MemoryGate",
    "SystemGate",
    "Embeddings",
    "PostgreSQL",
    "Qdrant",
  ])
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Vector index unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Latest snapshot’s recoverability", { exact: false }),
  ).toBeVisible();
});
test("replaying a fixture does not turn degraded or offline evidence green", async ({
  page,
}) => {
  await page.goto("/system");
  await page.getByRole("button", { name: "Replay health sample" }).click();
  await expect(
    page.locator('[data-slot="status"][data-state="offline"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-slot="status"][data-state="empty"]'),
  ).toBeVisible();
  const states = await page
    .locator('[data-slot="status"]')
    .evaluateAll((nodes) => [
      ...new Set(nodes.map((n) => n.getAttribute("data-state"))),
    ]);
  expect(states.sort()).toEqual(
    [
      "live",
      "degraded",
      "offline",
      "stale",
      "blocked",
      "empty",
      "planned",
      "unknown",
    ].sort(),
  );
});
