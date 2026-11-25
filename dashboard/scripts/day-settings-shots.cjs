// Screenshots of the day and time settings of round ten working live in the preview gateway: the
// Inbox, Home and the chat list as they are by default, then Easy mode (one card at a time, larger
// buttons), Focus mode (only what needs you, with its "Focus on" bar and one tap to turn it off) and
// Times set to the exact time and to hidden, each chosen on the Settings screen and shown without a
// reload. 320, 390 and 1280, light and dark. Fails on page errors or horizontal overflow.
// Run against `npm run dev` (CONKER_URL, default http://localhost:5173). Requires Playwright;
// PLAYWRIGHT_MODULE may point to an existing installation and CHROMIUM_PATH to a browser binary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'day-settings')

async function shoot(browser, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, colorScheme: theme, reducedMotion: 'reduce' })
  try { return await steps(context, width, theme) } catch (error) {
    await context.pages()[0]?.screenshot({ path: path.join(out, `failed-${width}-${theme}.png`) }).catch(() => {})
    throw error
  } finally { await context.close() }
}

async function steps(context, width, theme) {
  await context.addInitScript(value => {
    try { localStorage.setItem('vite-ui-theme', value) } catch { /* Storage may be blocked. */ }
  }, theme)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(30000)
  const snap = async (step, full = false) => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px ${theme}: ${page.url()}`)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(out, `${step}-${width}-${theme}.png`), fullPage: full })
  }
  // In-app navigation keeps the preview's settings document (a reload would start a fresh one).
  const go = async route => { await page.evaluate(to => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')) }, route); await page.waitForURL(`**${route}`) }
  const row = id => page.locator(`[id="setting-${id}"]`)
  const control = id => page.locator(`[id="setting-${id}-control"]`)
  const changed = async id => { await row(id).locator('[aria-label="Changed from the default"]').waitFor(); await page.waitForFunction(() => !document.body.innerText.includes('Saving…')) }
  const toggle = async id => { await row(id).getByRole('switch').scrollIntoViewIfNeeded(); await row(id).getByRole('switch').click(); await changed(id) }
  const choose = async (id, label) => { await control(id).scrollIntoViewIfNeeded(); await control(id).click(); await page.getByRole('option', { name: label, exact: true }).click(); await changed(id) }
  const needs = () => page.getByRole('region', { name: 'Needs you' }).getByRole('article')
  const inbox = async () => { await go('/inbox'); await page.getByText(/^\d+ needs? you/).first().waitFor(); await needs().first().waitFor() }

  // Default: every waiting card up to five, the time each came on its line.
  await page.goto(`${base}/inbox`)
  await page.locator('main:not([role="status"])').first().waitFor({ timeout: 180000 })
  await inbox()
  await needs().first().waitFor()
  assert.ok((await needs().count()) <= 5, 'at most five cards by default')
  assert.match(await needs().first().innerText(), /ago|Just now/, 'a card says how long ago it came')
  await snap('1-inbox-default', true)
  await go('/chats')
  await page.getByText('Plan my week').first().waitFor()
  await snap('2-chats-default')

  // Easy mode: one card at a time with the count of the rest, larger buttons.
  await go('/settings?group=day')
  await row('day.easy_mode').waitFor()
  await snap('3-settings-day')
  await toggle('day.easy_mode')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.targets), 'large')
  await inbox()
  assert.equal(await needs().count(), 1, 'Easy mode shows one card')
  await page.getByText(/^\d+ more cards?$/).waitFor()
  await snap('4-inbox-easy')
  await page.getByRole('button', { name: 'Show all', exact: true }).click()
  assert.ok((await needs().count()) > 1, 'Show all brings every card back')
  await go('/overview')
  await page.getByRole('heading', { name: /Needs you/ }).waitFor()
  await snap('5-home-easy')
  await go('/settings?group=day')
  await toggle('day.easy_mode')

  // Focus mode: only what needs you, said on screen, one tap out.
  await toggle('day.focus_mode')
  await go('/overview')
  await page.getByRole('region', { name: 'Focus mode' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Coming up' }).count(), 0, 'Focus keeps only Needs you on Home')
  await snap('6-home-focus')
  await inbox()
  const bar = page.getByRole('region', { name: 'Focus mode' })
  await bar.waitFor()
  assert.match(await bar.innerText(), /Focus on\. Only decisions show here\./)
  await snap('7-inbox-focus', true)
  await bar.getByRole('button', { name: 'Turn off focus' }).click()
  await bar.waitFor({ state: 'detached' })
  await page.getByRole('group', { name: 'Show' }).waitFor()
  await snap('8-inbox-focus-off')

  // Times: the exact time, then hidden, on the chat list and in a chat.
  await go('/settings?group=appearance')
  await choose('appearance.timestamps', 'Exact time')
  await go('/chats')
  await page.getByText('Plan my week').first().waitFor()
  assert.equal(await page.locator('main time').filter({ hasText: /ago/ }).count(), 0, 'no relative times')
  await snap('9-chats-exact')
  await go('/settings?group=appearance')
  await choose('appearance.timestamps', 'Hidden')
  await go('/chats')
  await page.getByText('Plan my week').first().waitFor()
  assert.equal(await page.locator('main time').count(), 0, 'no times on the chat list')
  await snap('10-chats-hidden')
  await inbox()
  assert.doesNotMatch(await needs().first().innerText(), /ago/, 'no time on the card line')
  await snap('11-inbox-hidden')
  assert.deepEqual(errors, [], `page errors at ${width}px ${theme}`)
}

async function main() {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  try {
    for (const width of (process.env.WIDTHS || '320,390,1280').split(',').map(Number)) for (const theme of (process.env.THEMES || 'light,dark').split(',')) await shoot(browser, width, theme)
  } finally { await browser.close() }
  console.log(`Day and time settings shots saved in ${out}`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
