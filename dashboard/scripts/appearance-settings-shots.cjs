// Screenshots of the appearance settings of round six working live in the preview gateway: the
// default look first, then high contrast, Atkinson Hyperlegible, JetBrains Mono, relaxed lines,
// compact density and red-and-green status colors chosen on the Settings screen and shown on the
// chat list without a reload, then the shortcut list on ?. 320, 390 and 1280, light and dark.
// Run against `npm run dev` (CONKER_URL, default http://localhost:5173). Requires Playwright;
// PLAYWRIGHT_MODULE may point to an existing installation and CHROMIUM_PATH to a browser binary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'appearance-settings')

async function shoot(browser, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, colorScheme: theme, reducedMotion: 'reduce' })
  try { return await steps(context, width, theme) } catch (error) {
    await context.pages()[0]?.screenshot({ path: path.join(out, `failed-${width}-${theme}.png`) }).catch(() => {})
    throw error
  } finally { await context.close() }
}

async function steps(context, width, theme) {
  await context.addInitScript(value => {
    try { localStorage.setItem('vite-ui-theme', value); localStorage.setItem('conker.setting.settings.advanced', 'true') } catch { /* Storage may be blocked. */ }
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
  const go = async route => { await page.evaluate(to => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')) }, route); await page.waitForURL(`**${route}`) }
  const row = id => page.locator(`[id="setting-${id}"]`)
  const control = id => page.locator(`[id="setting-${id}-control"]`)
  const changed = async id => { await row(id).locator('[aria-label="Changed from the default"]').waitFor(); await page.waitForFunction(() => !document.body.innerText.includes('Saving…')) }
  const choose = async (id, label) => { await control(id).scrollIntoViewIfNeeded(); await control(id).click(); await page.getByRole('option', { name: label, exact: true }).click(); await changed(id) }
  const toggle = async id => { await row(id).getByRole('switch').scrollIntoViewIfNeeded(); await row(id).getByRole('switch').click(); await changed(id) }
  const mark = key => page.evaluate(name => document.documentElement.dataset[name] ?? null, key)

  // Before: the theme's own look.
  await page.goto(`${base}/chats`)
  await page.locator('main:not([role="status"])').first().waitFor({ timeout: 180000 })
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 10000 }).catch(() => {})
  await page.getByText('Plan my week').first().waitFor()
  for (const key of ['contrast', 'font', 'codeFont', 'lineSpacing', 'density', 'colorVision']) assert.equal(await mark(key), null, `${key} is unmarked by default`)
  await snap('1-chats-default')
  await go('/settings?group=appearance')
  await control('appearance.font').waitFor()
  await snap('2-settings-default')

  // Change six of them on the Settings screen.
  await toggle('appearance.contrast')
  assert.equal(await mark('contrast'), 'more')
  await choose('appearance.color_vision', 'Red and green')
  await choose('appearance.font', 'Atkinson Hyperlegible')
  await choose('appearance.code_font', 'JetBrains Mono')
  await choose('appearance.line_spacing', 'Relaxed')
  await choose('appearance.density', 'Compact')
  const look = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, mono: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'), line: getComputedStyle(document.documentElement).lineHeight, row: getComputedStyle(document.documentElement).getPropertyValue('--collection-row-height').trim() }))
  assert.match(look.font, /Atkinson Hyperlegible Next/, 'the chosen font draws the page')
  assert.match(look.mono, /JetBrains Mono/)
  assert.equal(look.row, '3rem')
  await page.evaluate(() => document.fonts.ready)
  await control('appearance.font').scrollIntoViewIfNeeded()
  await snap('3-settings-changed')

  // After, without a reload: the chat list.
  await go('/chats')
  await page.getByText('Plan my week').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  await snap('4-chats-changed')

  // The shortcut list on ? (keyboards only: shot at every width all the same).
  await page.locator('body').click({ position: { x: width - 5, y: 5 } }).catch(() => {})
  await page.keyboard.press('Shift+Slash')
  await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
  await snap('5-shortcut-list')
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
