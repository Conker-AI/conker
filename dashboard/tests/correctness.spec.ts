import { test, expect } from "@playwright/test";

test("dangling portrait mappings resolve an available neutral asset", async ({
  page,
}) => {
  await page.goto("/chat/week");
  await expect(page.locator("#week-user")).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/mocks/database.ts";
    const { db } = await import(path);
    db.character.companion.assets = [
      {
        id: "available",
        name: "Neutral",
        kind: "portrait",
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      },
    ];
    db.character.companion.expressions = { neutral: "available", warm: "gone" };
    const queries = "/src/data/queries.ts";
    await (await import(queries)).refresh("character");
  });
  await page
    .getByRole("link", { name: "Companion settings", exact: true })
    .click();
  await page.getByLabel("Preview expression").selectOption("warm");
  await expect(page.locator(".portrait-preview img")).toBeVisible();
  await expect(page.locator(".portrait-preview [role=img]")).toHaveAttribute(
    "aria-label",
    "Conker neutral portrait",
  );
});

test("Inbox distinguishes loading unavailable missing filtered and verified empty", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).endsWith("/__fixture/v1/inbox")) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return new Response(
          JSON.stringify({ message: "Fixture inbox unavailable" }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "x-conker-fixture": "true",
            },
          },
        );
      }
      return original(input, init);
    };
  });
  await page.goto("/inbox");
  await expect(
    page.getByRole("heading", { name: "Checking your inbox…" }),
  ).toBeVisible();
  await expect(
    page.getByText(/0 decisions|Nothing waiting on you|Verified empty/),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Inbox unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText(/0 decisions|Nothing waiting on you|Verified empty/),
  ).toHaveCount(0);
});

test("Inbox missing records and empty filters do not imply an empty queue", async ({
  page,
}) => {
  await page.goto("/inbox/missing");
  await expect(
    page.getByText("This inbox record is missing.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Nothing waiting on you.", { exact: false }),
  ).toHaveCount(0);
  await page.evaluate(async () => {
    const path = "/src/mocks/database.ts";
    const { db } = await import(path);
    db.inbox = Object.fromEntries(
      Object.entries(db.inbox).filter(([, item]: [string, any]) =>
        ["coach", "revision", "cleanup"].includes(item.id),
      ),
    );
    const queries = "/src/data/queries.ts";
    await (await import(queries)).refresh("inbox");
  });
  await page.getByRole("link", { name: "All decisions" }).click();
  await page.getByRole("tab", { name: "Decision history" }).click();
  await expect(
    page.getByText("No decisions match Decision history.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("3 decisions", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/mocks/database.ts";
    const { db } = await import(path);
    db.inbox = {};
    const queries = "/src/data/queries.ts";
    await (await import(queries)).refresh("inbox");
  });
  await expect(
    page.getByText("Verified empty inbox. No retained items."),
  ).toBeVisible();
});

test("approval warnings follow evidence and original conversation reaches its source", async ({
  page,
}) => {
  await page.goto("/inbox/cleanup");
  await page.getByRole("link", { name: "Original conversation" }).click();
  await expect(page).toHaveURL(/chat\/reading#reading-user$/);
  await expect(page.locator("#reading-user")).toContainText(
    "Summarise the reading notes",
  );
  await page.evaluate(async () => {
    const path = "/src/mocks/database.ts";
    const { db } = await import(path);
    db.approvals.coach.intentEvidence = db.approvals.cleanup.intentEvidence;
    db.approvals.cleanup.intentEvidence = {
      matches: true,
      detail: "No mismatch",
    };
    const queries = "/src/data/queries.ts";
    await (await import(queries)).refresh("approvals");
  });
  await page.locator('.desktop-sidebar a[href="/inbox"]').click();
  await page.locator('[href="/inbox/coach"]').click();
  await expect(
    page.getByText("Intent mismatch:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All decisions" }).click();
  await page.locator('[href="/inbox/cleanup"]').click();
  await expect(
    page.getByText("Intent mismatch:", { exact: false }),
  ).toHaveCount(0);
});

test("unknown tools stay readable and undated receipts have unknown age", async ({
  page,
}) => {
  await page.goto("/chat/week");
  await expect(page.locator('[data-action-id="calendar"]')).toContainText(
    "Receipt age unknown",
  );
  await page.evaluate(async () => {
    const path = "/src/mocks/database.ts";
    const { db } = await import(path);
    db.approvals.coach.tool = "future.tool";
    const queries = "/src/data/queries.ts";
    await (await import(queries)).refresh("approvals");
  });
  await page.locator('.desktop-sidebar a[href="/inbox"]').click();
  await page.locator('[href="/inbox/coach"]').click();
  await expect(
    page.getByRole("heading", { name: "Review unsupported tool: future.tool" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve once" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Tool definition unavailable.", { exact: false }),
  ).toBeVisible();
});

test("Studio clears Saved after edits and repairs removed expression assets", async ({
  page,
}) => {
  await page.goto("/companion");
  await page.getByRole("button", { name: "Save character" }).click();
  await expect(page.getByText("Saved in this preview.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Juniper");
  await expect(page.getByText("Saved in this preview.")).toHaveCount(0);
  await page.getByRole("tab", { name: "Appearance" }).click();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel("Import an asset")
    .setInputFiles({ name: "neutral.png", mimeType: "image/png", buffer: png });
  await page
    .getByLabel("Import an asset")
    .setInputFiles({ name: "happy.png", mimeType: "image/png", buffer: png });
  const happy = page.locator("#expression-warm");
  await happy.selectOption({ label: "happy.png" });
  await page.getByLabel("Preview expression").selectOption("warm");
  await page
    .locator(".asset-row")
    .filter({ hasText: "happy.png" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(happy).toHaveValue("");
  await expect(page.locator(".portrait-preview img")).toBeVisible();
  await expect(page.locator(".portrait-preview [role=img]")).toHaveAttribute(
    "aria-label",
    "Juniper neutral portrait",
  );
});
