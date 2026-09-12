// Requires an installed @playwright/test and Chromium; CONKER_PLAYWRIGHT_MODULE may point to another local installation.
const path = require("node:path")
const artifacts = path.resolve(__dirname, "../test-results")
require("node:fs").mkdirSync(artifacts, { recursive: true })
const { chromium, expect } = require(
  process.env.CONKER_PLAYWRIGHT_MODULE || "@playwright/test"
)
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
  await page.goto("http://localhost:5173/inbox/coach")
  await expect(
    page.getByRole("button", { name: "Approve once", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: path.join(artifacts, "conker-approval.png"),
    fullPage: true,
  })
  await page.getByRole("button", { name: "Customize theme and layout" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("combobox").first().click()
  console.log("THEME OPTIONS", await page.getByRole("option").allTextContents())
  await page.getByRole("option", { name: "Blue", exact: true }).click()
  const blue = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--primary")
  )
  await dialog.getByRole("tab", { name: "Layout", exact: true }).click()
  await dialog.getByText("Right", { exact: true }).click()
  await expect(page.locator('[data-side="right"][data-state]')).toBeVisible()
  await dialog.getByText("Floating", { exact: true }).click()
  await expect(
    page.locator('[data-variant="floating"][data-state]')
  ).toBeVisible()
  await dialog.getByText("Icon", { exact: true }).click()
  await expect(
    page.locator('[data-collapsible="icon"][data-state="collapsed"]')
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Close customizer" }).click()
  await page.keyboard.press("Control+k")
  await page
    .getByRole("dialog")
    .getByPlaceholder("What do you need?")
    .fill("System")
  await page.getByRole("option", { name: "System", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "System", exact: true })
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--primary")
      )
    )
    .toBe(blue)
  await expect(
    page.locator('[data-side="right"][data-variant="floating"]')
  ).toBeVisible()
  await page.getByRole("button", { name: "Switch to light mode" }).click()
  await expect(page.locator("html")).toHaveClass("light")
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})))
  )
  await page.screenshot({
    path: path.join(artifacts, "conker-system-light.png"),
    fullPage: true,
  })
  await page.getByRole("button", { name: "Customize theme and layout" }).click()
  await page.getByRole("button", { name: "Reset theme and layout" }).click()
  await expect(
    page.locator('[data-side="left"][data-variant="inset"]')
  ).toBeVisible()
  await page.getByRole("button", { name: "Close customizer" }).click()
  await page.getByRole("button", { name: "Switch to dark mode" }).click()
  await page.keyboard.press("Control+k")
  await page
    .getByRole("dialog")
    .getByPlaceholder("What do you need?")
    .fill("Character Studio")
  await page
    .getByRole("option", { name: "Character Studio", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Character Studio", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: path.join(artifacts, "conker-studio.png"),
    fullPage: true,
  })
  await page.getByRole("tab", { name: "Appearance", exact: true }).click()
  await page.getByLabel("Renderer", { exact: true }).click()
  await page
    .getByRole("option", { name: "Live 2D · planned", exact: true })
    .click()
  await expect(
    page.getByText("Avatar rendering is planned", { exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Save character" }).click()
  await expect(page.getByRole("status")).toContainText("Saved")
  await page.getByLabel("Static portrait", { exact: true }).setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: require("node:fs").readFileSync(
      path.resolve(__dirname, "../public/favicon.png")
    ),
  })
  await expect(
    page.getByRole("img", { name: "Conker portrait preview" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Save character" }).click()
  await page.getByRole("link", { name: "Back to your companion" }).click()
  await expect(
    page.getByRole("img", { name: "Conker static portrait" }).locator("img")
  ).toBeVisible()
  console.log(
    "PASS: theme selection, layout variants/side/collapse, route persistence, light/dark, reset, planned renderer, local portrait upload"
  )
  await page.goto("http://localhost:5173/inbox/sent")
  await page.getByRole("link", { name: "View source conversation" }).click()
  await expect(page.locator("#sent-user")).toBeVisible()
  const loadingPage = await browser.newPage()
  let releaseModule
  const moduleGate = new Promise((resolve) => {
    releaseModule = resolve
  })
  await loadingPage.route("**/src/app/inbox/detail-page.tsx", async (route) => {
    await moduleGate
    await route.continue()
  })
  await loadingPage.goto("http://localhost:5173/inbox/coach", {
    waitUntil: "domcontentloaded",
  })
  await expect(
    loadingPage.getByRole("status", { name: "Loading screen" })
  ).toBeVisible()
  releaseModule()
  await expect(
    loadingPage.getByRole("button", { name: "Approve once", exact: true })
  ).toBeVisible()
  await loadingPage.close()
  console.log("PASS: provenance deep link and distinct lazy-loading state")
  await browser.close()
  if (issues.length) throw new Error(JSON.stringify(issues))
  console.log("PASS: no console errors or warnings")
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
