// Screenshots of the shell settings working live in the preview gateway: each one is changed on the
// Settings screen, then the screen it names is shown without a reload (Home, the sidebar, search,
// Memory, the message box). Phone (390) and desktop (1280), light and dark.
// Run against `npm run dev` (CONKER_URL, default http://localhost:5173). Requires Playwright;
// PLAYWRIGHT_MODULE may point to an existing installation and CHROMIUM_PATH to a browser binary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'settings-shell')

async function shoot(browser, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, colorScheme: theme, reducedMotion: 'reduce' })
  try { return await steps(context, width, theme) } catch (error) {
    // Keep what the page showed when a step failed.
    await context.pages()[0]?.screenshot({ path: path.join(out, `failed-${width}-${theme}.png`) }).catch(() => {})
    throw error
  } finally { await context.close() }
}

async function steps(context, width, theme) {
  const desktop = width >= 1024
  await context.addInitScript(value => {
    try { localStorage.setItem('vite-ui-theme', value); localStorage.setItem('conker.setting.settings.advanced', 'true') } catch { /* Storage may be blocked. */ }
  }, theme)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(30000)
  const name = step => path.join(out, `${step}-${width}-${theme}.png`)
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px: ${page.url()}`)
  // The page scrolls inside the app shell, so a full-page shot first grows the window to the content.
  const snap = async step => {
    await noOverflow()
    const height = await page.evaluate(() => Math.max(innerHeight, ...[...document.querySelectorAll('*')].filter(node => node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)).map(node => node.scrollHeight + node.getBoundingClientRect().top)))
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: viewport.width, height: Math.min(Math.ceil(height), 4000) })
    await page.screenshot({ path: name(step), fullPage: true })
    await page.setViewportSize(viewport)
  }
  // In-app navigation keeps the preview's settings document (a reload would start a fresh one).
  const go = async route => { await page.evaluate(to => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')) }, route); await page.waitForURL(`**${route}`) }
  const row = id => page.locator(`[id="setting-${id}"]`)
  const control = id => page.locator(`[id="setting-${id}-control"]`)
  const changed = async id => { await row(id).locator('[aria-label="Changed from the default"]').waitFor(); await page.waitForFunction(() => !document.body.innerText.includes('Saving…')) }
  const choose = async (id, label) => { await control(id).click(); await page.getByRole('option', { name: label, exact: true }).click(); await changed(id) }
  const toggle = async id => { await row(id).getByRole('switch').click(); await changed(id) }
  const sidebar = page.locator('[data-slot="sidebar"][data-state]').first()
  const ring = page.locator('button[aria-label^="Plan usage:"]')

  // Earn the encouraging line honestly: decide one request in the Inbox.
  await page.goto(`${base}/inbox`)
  await page.getByText('Send an email to coach').first().waitFor({ timeout: 90000 })
  await page.locator('article').filter({ hasText: 'Send an email to coach' }).first().getByRole('button', { name: 'Don’t send' }).click()
  await page.getByText('1 decided today').waitFor()

  // Before: the message box shows the plan ring (default "Both").
  await go('/chat')
  await page.getByRole('textbox').first().waitFor()
  await page.waitForTimeout(800)
  const ringBefore = await ring.count()

  // Appearance: round corners, collapsed sidebar, no Agents or Cron jobs in the sidebar.
  await go('/settings?group=appearance')
  await control('appearance.corners').waitFor()
  await choose('appearance.corners', 'Round')
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--radius').trim()), '1rem', 'Round corners apply at once')
  if (desktop) assert.equal(await sidebar.getAttribute('data-state'), 'expanded')
  await choose('appearance.sidebar', 'Collapse on small screens')
  if (desktop) {
    assert.equal(await sidebar.getAttribute('data-state'), 'expanded', '"Collapse on small screens" keeps it open at 1280')
    await page.setViewportSize({ width: 900, height: 900 })
    await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute('data-state') === 'collapsed')
    await page.setViewportSize({ width, height: 900 })
    await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute('data-state') === 'expanded')
  }
  await choose('appearance.sidebar', 'Collapsed')
  if (desktop) assert.equal(await sidebar.getAttribute('data-state'), 'collapsed', 'Collapsed applies at once')
  for (const place of ['Agents', 'Cron jobs']) { await row('appearance.sidebar_places').getByText(place, { exact: true }).click(); await page.waitForFunction(() => !document.body.innerText.includes('Saving…')) }
  await changed('appearance.sidebar_places')
  if (desktop) {
    assert.equal(await page.locator('[data-sidebar="sidebar"] a[href="/agents"]').count(), 0, 'Agents left the sidebar at once')
    assert.equal(await page.locator('[data-sidebar="sidebar"] a[href="/jobs"]').count(), 0)
    assert.equal(await page.locator('[data-sidebar="sidebar"] a[href="/memory"]').count(), 1)
  }
  await snap('1-settings-appearance')

  // Accessibility, keyboard, Home, projects and memory.
  await go('/settings?group=accessibility'); await toggle('accessibility.focus')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.focus), 'large')
  await go('/settings?group=home')
  await control('home.needs_count').fill('1'); await control('home.needs_count').press('Enter'); await changed('home.needs_count')
  await choose('home.greeting', 'Encouraging, when earned')
  await choose('home.plan_ring', 'Off')
  await snap('2-settings-home')
  await go('/settings?group=projects'); await toggle('projects.tasks_home')
  await go('/settings?group=memory'); await toggle('memory.map')

  // Home: greeting with the earned line, one waiting item, no plan or completed tiles, round corners.
  await go('/overview')
  await page.getByText('You decided 1 thing today.').waitFor()
  assert.equal(await page.locator('.home-bento').getAttribute('data-layout'), 'no-plan-done')
  assert.equal(await page.getByRole('heading', { name: 'Plan allowance' }).count(), 0)
  assert.equal(await page.getByRole('heading', { name: 'Completed' }).count(), 0)
  assert.equal(await page.locator('#home-needs').locator('xpath=ancestor::section[1]').locator('li').count(), 1, 'Home shows one waiting item')
  await page.getByText(/All \d+ in Inbox/).waitFor()
  await snap('3-home')

  // Bigger focus outline on the first waiting item.
  await page.locator('#home-needs').locator('xpath=ancestor::section[1]').locator('li a').first().focus()
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth), '3px', 'the focused item has the 3 px outline')
  await page.screenshot({ path: name('4-home-focus') })

  // Search opens with Ctrl+K (Ctrl+P is not offered: it is the browser's Print); the sidebar button names the keys.
  await page.locator('body').click({ position: { x: width - 5, y: 5 } }).catch(() => {})
  await page.keyboard.press('Control+k')
  await page.locator('[data-slot="command-dialog-popup"]').waitFor()
  await page.screenshot({ path: name('5-search-ctrl-k') })
  await page.keyboard.press('Escape')
  await page.locator('[data-slot="command-dialog-popup"]').waitFor({ state: 'detached' }).catch(() => {})

  // The sidebar: phones open the drawer; desktop shows the collapsed rail.
  if (!desktop) {
    await page.getByRole('button', { name: /^Menu/ }).first().click()
    await page.locator('[data-sidebar="sidebar"] a[href="/memory"]').first().waitFor()
    assert.equal(await page.locator('[data-sidebar="sidebar"] a[href="/agents"]').count(), 0, 'The drawer has no Agents')
    await page.screenshot({ path: name('6-sidebar') })
    await page.keyboard.press('Escape')
  } else {
    assert.equal(await page.getByRole('button', { name: 'Search Conker' }).count(), 1)
    assert.equal(await page.locator('[data-sidebar="sidebar"]').getByRole('button', { name: /Switch to (light|dark) mode/ }).count(), 1)
    await page.screenshot({ path: name('6-sidebar') })
  }

  // Memory: the list only, no Map or Tree.
  await go('/memory')
  await page.getByRole('toolbar', { name: 'Memory controls' }).waitFor()
  assert.equal(await page.getByRole('combobox', { name: 'Memory view' }).count(), 0, 'no view picker without the map')
  await page.waitForTimeout(500)
  await snap('7-memory')

  // The message box: no plan ring with "Off".
  await go('/chat')
  await page.getByRole('textbox').first().waitFor()
  await page.waitForTimeout(800)
  assert.equal(await ring.count(), 0, 'the plan ring left the message box')
  await snap('8-chat')

  // Keyboard shortcuts off: Ctrl+K and Ctrl+B do nothing, the button no longer names keys.
  await go('/settings?group=keyboard'); await toggle('keyboard.shortcuts')
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(300)
  assert.equal(await page.locator('[data-slot="command-dialog-popup"]').count(), 0, 'shortcuts off: search stays closed')
  if (desktop) {
    const state = await sidebar.getAttribute('data-state')
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(200)
    assert.equal(await sidebar.getAttribute('data-state'), state, 'shortcuts off: Ctrl+B leaves the sidebar alone')
    assert.equal(await page.getByRole('button', { name: /Search \(Ctrl/ }).count(), 0, 'shortcuts off: no key named on the search button')
  }
  await snap('9-settings-keyboard')

  assert.deepEqual(errors, [], `page errors at ${width} ${theme}`)
  return ringBefore
}

async function run() {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  try {
    for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
      const ringBefore = await shoot(browser, width, theme)
      console.log(`PASS ${width} ${theme} (plan ring in the message box before: ${ringBefore})`)
    }
    console.log(`Screenshots in ${out}`)
  } finally { await browser.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
