// Requires an installed @playwright/test and Chromium; CONKER_PLAYWRIGHT_MODULE may point to another local installation.
const path = require("node:path")
const artifacts = path.resolve(__dirname, "../test-results")
require("node:fs").mkdirSync(artifacts, { recursive: true })
const { chromium, expect } = require(
  process.env.CONKER_PLAYWRIGHT_MODULE || "@playwright/test"
)
const fs = require("node:fs")
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  })
  const issues = []
  page.on("pageerror", (e) => issues.push(e.message))
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) issues.push(m.text())
  })
  const routes = [
    ["/", "Home"],
    ["/chat", "Chats"],
    ["/inbox", "Inbox"],
    ["/tools", "Tools"],
    ["/memory", "Memory"],
    ["/journal", "Journal"],
    ["/jobs", "Jobs"],
    ["/system", "System"],
    ["/terminal", "Terminal"],
    ["/companion", "Character Studio"],
    ["/agents", "Agents"],
    ["/inbox/coach", "Approval detail"],
    ["/inbox/cleanup", "Approval detail"],
    ["/inbox/revision", "Proposal"],
    ["/inbox/sent", "Approval detail"],
    ["/inbox/expired", "Approval detail"],
    ["/inbox/missing", "Approval detail"],
    ["/chat/week", "Make room for the week"],
    ["/chat/server", "One less thing to remember"],
    ["/chat/judo", "Training around school"],
    ["/chat/reading", "The reading notes"],
    ["/chat/dashboard", "A dashboard that earns its space"],
    ["/chat/missing", "Conversation not found"],
    ["/missing", "Page not found"],
  ]
  for (const [route, title] of routes) {
    await page.goto("http://localhost:5173" + route)
    await expect(
      page.getByRole("heading", { name: title, exact: true })
    ).toBeVisible()
    await expect(page.locator("vite-error-overlay")).toHaveCount(0)
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      )
    )
      throw new Error("Desktop overflow: " + route)
  }
  console.log("PASS: 24 route renders, desktop overflow")
  await page.goto("http://localhost:5173/chat")
  await page.getByPlaceholder("Find a conversation…").fill("remember")
  await expect(page.locator("tbody tr")).toHaveCount(1)
  await page.locator("tbody tr").press("Enter")
  await expect(page).toHaveURL(/chat\/server/)
  await page.getByRole("button", { name: "Arguments & record" }).click()
  await expect(
    page.getByText("act_fixture_reminder_009", { exact: false })
  ).toBeVisible()
  await page.getByRole("button", { name: "Request reply only" }).click()
  await expect(
    page.getByRole("button", { name: "Reply request recorded" })
  ).toBeDisabled()
  await page.goto("http://localhost:5173/inbox")
  await expect(page.locator("tbody tr")).toHaveCount(3)
  await page
    .getByRole("link", { name: "Ask coach about Friday’s open mat" })
    .click()
  await page.getByRole("button", { name: "Approve once", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("No email was sent")
  await expect(page.getByLabel("2 requests need you")).toBeVisible()
  await page.getByRole("link", { name: "Back to Inbox" }).click()
  await page
    .getByRole("link", { name: "Delete 47 PDFs from Downloads" })
    .click()
  await page.getByRole("button", { name: "Deny", exact: true }).click()
  await page.getByRole("link", { name: "Back to Inbox" }).click()
  await page.getByRole("link", { name: "Keep Sunday’s revision short" }).click()
  await page.getByRole("button", { name: "Accept proposal" }).click()
  await page.getByRole("link", { name: "Back to Inbox" }).click()
  await expect(page.getByRole("status")).toContainText("all caught up")
  await page.getByRole("tab", { name: "Decision history" }).click()
  await expect(page.locator("tbody tr")).toHaveCount(5)
  console.log(
    "PASS: keyboard rows, receipt disclosure, reply-only state, approval/deny/proposal/history/empty/badge"
  )
  await page.goto("http://localhost:5173/memory")
  await page.getByPlaceholder("Search memory text…").fill("предпочитаю")
  await expect(page.locator("tbody tr")).toHaveCount(1)
  await expect(page.locator('[lang="ru"]')).toBeVisible()
  await page.goto("http://localhost:5173/journal?actor=Workshop")
  await expect(page.locator("tbody tr")).toHaveCount(1)
  await expect(page.locator("tbody")).toContainText("Intent mismatch")
  await page.goto("http://localhost:5173/jobs")
  await page
    .getByRole("button", { name: "Actions for Nightly recovery snapshot" })
    .click()
  await page.getByRole("menuitem", { name: "Pause", exact: true }).click()
  await expect(page.locator("tbody tr").first()).toContainText("Paused")
  await page
    .getByRole("button", { name: "Actions for Nightly recovery snapshot" })
    .click()
  await page.getByRole("menuitem", { name: "Run now", exact: true }).click()
  await expect(page.locator("tbody tr").first()).toContainText(
    "simulated receipt #2"
  )
  await page.goto("http://localhost:5173/companion")
  await page.getByLabel("Name", { exact: true }).fill("Acorn")
  await page
    .getByLabel("Speaking style", { exact: true })
    .fill("Short, warm answers.")
  await expect(page.getByRole("heading", { name: "Acorn" })).toBeVisible()
  await page.getByRole("button", { name: "Save character" }).click()
  await expect(page.getByRole("status")).toHaveText("Saved in this preview")
  await page.getByRole("link", { name: "Back to your companion" }).click()
  await expect(page.getByPlaceholder("Message Acorn…")).toBeVisible()
  await page.getByPlaceholder("Message Acorn…").fill("Leave Wednesday free.")
  await page.getByRole("button", { name: "Send message" }).click()
  await expect(
    page.getByText("Leave Wednesday free.", { exact: true })
  ).toBeVisible()
  console.log(
    "PASS: Russian search, actor deep link, job controls, character save, composer"
  )
  for (const [route, title] of routes.slice(0, 11)) {
    await page.keyboard.press("Control+k")
    const dialog = page.getByRole("dialog")
    await dialog
      .getByPlaceholder("What do you need?")
      .fill(title === "Character Studio" ? title : title)
    await dialog.getByRole("option", { name: title, exact: true }).click()
    await expect(page).toHaveURL("http://localhost:5173" + route)
    await expect(
      page.getByRole("heading", { name: title, exact: true })
    ).toBeVisible()
  }
  console.log("PASS: every command search destination")
  await page.goto("http://localhost:5173/inbox/coach")
  await expect(
    page.getByRole("button", { name: "Approve once", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: path.join(artifacts, "conker-approval.png"),
    fullPage: true,
  })
  await page.goto("http://localhost:5173/companion")
  await expect(
    page.getByRole("heading", { name: "Character Studio", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: path.join(artifacts, "conker-studio.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [route, title] of routes.slice(0, 14)) {
    await page.goto("http://localhost:5173" + route)
    await expect(
      page.getByRole("heading", { name: title, exact: true })
    ).toBeVisible()
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      )
    )
      throw new Error("Mobile overflow: " + route)
  }
  await page.screenshot({
    path: path.join(artifacts, "conker-mobile.png"),
    fullPage: true,
  })
  console.log("PASS: mobile route sizing")
  fs.writeFileSync(
    path.join(artifacts, "conker-browser-issues.json"),
    JSON.stringify(issues, null, 2)
  )
  await browser.close()
  if (issues.length)
    throw new Error("Browser issues: " + JSON.stringify(issues))
  console.log("PASS: no browser errors or warnings")
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
