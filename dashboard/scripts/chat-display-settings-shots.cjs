// Screenshots of the chat display settings of round nine working live in the preview gateway: a
// chat with code and a source, and an empty new chat, first as they are by default, then with line
// numbers in code, answers folded after 10 lines, sources at the end and Today's summary on a new chat,
// chosen on the Settings screen and shown without a reload. 320, 390 and 1280, light and dark.
// Run against `npm run dev` (CONKER_URL, default http://localhost:5173). Requires Playwright;
// PLAYWRIGHT_MODULE may point to an existing installation and CHROMIUM_PATH to a browser binary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'chat-display-settings')
const chat = `/chat?session=ses_${'4'.repeat(16)}`

async function shoot(browser, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, colorScheme: theme, reducedMotion: 'reduce' })
  try { return await steps(context, width, theme) } catch (error) {
    await context.pages()[0]?.screenshot({ path: path.join(out, `failed-${width}-${theme}.png`) }).catch(() => {})
    throw error
  } finally { await context.close() }
}

async function steps(context, width, theme) {
  await context.addInitScript(value => {
    try {
      localStorage.setItem('vite-ui-theme', value)
      localStorage.setItem('conker.setting.settings.advanced', 'true')
      sessionStorage.setItem('conker-fake-chat', 'long')
    } catch { /* Storage may be blocked. */ }
  }, theme)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(30000)
  const name = step => path.join(out, `${step}-${width}-${theme}.png`)
  const snap = async step => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px ${theme}: ${page.url()}`)
    await page.waitForTimeout(400)
    await page.screenshot({ path: name(step) })
  }
  // In-app navigation keeps the preview's settings document (a reload would start a fresh one).
  const go = async route => { await page.evaluate(to => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')) }, route); await page.waitForURL(`**${route.split('?')[0]}*`) }
  const row = id => page.locator(`[id="setting-${id}"]`)
  const control = id => page.locator(`[id="setting-${id}-control"]`)
  const changed = async id => { await row(id).locator('[aria-label="Changed from the default"]').waitFor(); await page.waitForFunction(() => !document.body.innerText.includes('Saving…')) }
  const choose = async (id, label) => { await control(id).scrollIntoViewIfNeeded(); await control(id).click(); await page.getByRole('option', { name: label, exact: true }).click(); await changed(id) }
  const toggle = async id => { await row(id).getByRole('switch').scrollIntoViewIfNeeded(); await row(id).getByRole('switch').click(); await changed(id) }
  const type = async (id, value) => { await control(id).scrollIntoViewIfNeeded(); await control(id).fill(value); await control(id).press('Enter'); await changed(id) }
  const answer = () => page.getByRole('article', { name: /assistant message/ }).first()

  // Before: the chat as it is by default.
  await page.goto(`${base}${chat}`)
  await page.locator('main:not([role="status"])').first().waitFor({ timeout: 180000 })
  await answer().locator('pre').first().waitFor()
  assert.equal(await page.locator('.answer-code-line').count(), 0, 'code is unnumbered by default')
  assert.equal(await page.getByRole('button', { name: 'Show the whole answer' }).count(), 0, 'answers never fold by default')
  await snap('1-chat-default')

  // Change four of them on the Settings screen.
  await go('/settings?group=chats')
  await control('chats.start').waitFor()
  await toggle('chats.code_numbers')
  await type('chats.fold_after', '10')
  await choose('chats.citations', 'At the end')
  await choose('chats.start', "Today's summary")
  await control('chats.citations').scrollIntoViewIfNeeded()
  await snap('2-settings-changed')

  // After, without a reload: the chat folds, numbers its code and lists its source at the end.
  await go(chat)
  await answer().locator('pre').first().waitFor()
  await page.getByRole('button', { name: 'Show the whole answer' }).waitFor()
  await snap('3-chat-folded')
  await page.getByRole('button', { name: 'Show the whole answer' }).click()
  await page.getByRole('region', { name: 'Sources' }).waitFor()
  assert.ok(await page.locator('.answer-code-line').count() >= 8, 'every code line is numbered')
  await page.locator('pre[data-numbers]').first().scrollIntoViewIfNeeded()
  await snap('4-chat-open-numbers')
  await page.getByRole('region', { name: 'Sources' }).scrollIntoViewIfNeeded()
  await snap('5-chat-sources')

  // An empty new chat now starts with today's summary.
  await go('/chat')
  await page.getByRole('region', { name: 'Today' }).waitFor()
  await page.waitForFunction(() => !document.body.innerText.includes('Checking what waits for you'))
  await snap('6-new-chat-summary')
  assert.deepEqual(errors, [], `page errors at ${width}px ${theme}`)
}

;(async () => {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  try {
    for (const width of (process.env.WIDTHS || '320,390,1280').split(',').map(Number)) for (const theme of (process.env.THEMES || 'light,dark').split(',')) await shoot(browser, width, theme)
  } finally { await browser.close() }
  console.log(`Screenshots in ${out}`)
})().catch(error => { console.error(error); process.exitCode = 1 })
