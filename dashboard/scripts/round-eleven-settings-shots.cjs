// Screenshots of the settings of round eleven working live in the preview gateway, each chosen on the
// Settings screen and shown without a reload: the Inbox with every card open, newest first and the
// badge counting only what waits for an answer; a chat with every fact under its answers and only
// two views offered; a template whose empty required field no longer holds the message back; a
// weekly job whose day list starts on Monday; and the Voice and calls settings. 320, 390 and 1280,
// light and dark. Fails on page errors or horizontal overflow.
// Run against `npm run dev` (CONKER_URL, default http://localhost:5173). Requires Playwright;
// PLAYWRIGHT_MODULE may point to an existing installation and CHROMIUM_PATH to a browser binary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'round-eleven-settings')

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
  const phone = width < 768
  const snap = async (step, full = false) => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px ${theme}: ${page.url()}`)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(out, `${step}-${width}-${theme}.png`), fullPage: full })
  }
  // In-app navigation keeps the preview's settings document (a reload would start a fresh one).
  const go = async route => { await page.evaluate(to => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')) }, route); await page.waitForURL(`**${route.split('?')[0]}*`) }
  const row = id => page.locator(`[id="setting-${id}"]`)
  const control = id => page.locator(`[id="setting-${id}-control"]`)
  const changed = async id => { await row(id).locator('[aria-label="Changed from the default"]').waitFor(); await page.waitForFunction(() => !document.body.innerText.includes('Saving…')) }
  const toggle = async id => { await row(id).getByRole('switch').scrollIntoViewIfNeeded(); await row(id).getByRole('switch').click(); await changed(id) }
  const choose = async (id, label) => { await control(id).scrollIntoViewIfNeeded(); await control(id).click(); await page.getByRole('option', { name: label, exact: true }).click(); await changed(id) }
  const check = async (id, label, on = true) => { const box = row(id).getByRole('checkbox', { name: label, exact: true }); await box.scrollIntoViewIfNeeded(); if ((await box.getAttribute('aria-checked')) !== String(on)) await box.click(); await page.waitForFunction(() => !document.body.innerText.includes('Saving…')) }
  const advanced = async () => { const link = page.getByText('Show advanced', { exact: true }); if (await link.count()) await link.click() }
  const needs = () => page.getByRole('region', { name: 'Needs you' }).getByRole('article')

  // Inbox: every card open, newest first, the badge counting only decisions, questions and requests.
  await page.goto(`${base}/settings?group=inbox`, { timeout: 180000 })
  await page.locator('main:not([role="status"])').first().waitFor({ timeout: 180000 })
  await row('inbox.details_open').waitFor()
  await toggle('inbox.details_open')
  await choose('inbox.sort', 'Newest first')
  await choose('inbox.badge', 'Urgent only')
  await snap('1-settings-inbox', true)
  await go('/inbox')
  await page.getByText(/^\d+ needs? you/).first().waitFor()
  await needs().first().waitFor()
  assert.equal(await needs().first().locator('[aria-expanded="true"]').count(), 1, 'the first card is open without a tap')
  await snap('2-inbox-open-newest', true)

  // A chat: every saved fact under the answer, and only Context and Logs offered.
  await go('/settings?group=appearance')
  for (const label of ['Tokens', 'Cost', 'Why this model', 'Tools used']) await check('appearance.answer_details', label)
  await advanced()
  await check('appearance.chat_views', 'Thinking', false)
  await snap('3-settings-appearance')
  await go('/chat?session=ses_1111111111111111')
  const answer = page.getByRole('article', { name: /^assistant message/ }).first()
  await answer.waitFor()
  await answer.getByText(/qwen2\.5:3b · \d+ s · 1\.6k tokens · free/).waitFor()
  if (!phone) assert.deepEqual(await page.locator('[data-conversation-view]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-conversation-view'))), ['context', 'logs'], 'only the chosen views')
  await snap('4-chat-details-views')

  // A template: the empty required field is said, and no longer holds the message back.
  await go('/settings?group=prompts')
  await advanced()
  await toggle('prompts.required_fields')
  await go('/chat')
  // Narrow message boxes fold the template picker into "More options".
  const more = page.getByRole('form', { name: 'Message composer' }).getByRole('button', { name: /^More options/ })
  await page.getByRole('form', { name: 'Message composer' }).waitFor()
  await page.waitForTimeout(1000) // the toolbar measures itself once, then folds what does not fit
  const folded = await more.isVisible()
  if (folded) await more.click()
  await page.getByRole('button', { name: 'Prompt template: none' }).filter({ visible: true }).first().click()
  await page.getByRole('menuitem', { name: /^Research/ }).click()
  await page.getByText('Still empty: Subject. You can send without them.').waitFor()
  if (folded) { await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: 'More options' }).waitFor({ state: 'hidden' }).catch(() => {}) }
  await snap('5-chat-template-optional', true)
  await page.getByRole('button', { name: 'Leave template' }).click()

  // A weekly job: the day list starts on Monday, and a new weekly job starts on it.
  await go('/settings?group=you')
  await choose('you.week_start', 'Monday')
  await go('/jobs')
  await page.getByRole('button', { name: /New AI job/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#agent-job-repeat').click()
  await page.getByRole('option', { name: 'Every week', exact: true }).click()
  await dialog.locator('#agent-job-day').click()
  await page.getByRole('option', { name: 'Sunday', exact: true }).waitFor()
  const days = await page.getByRole('option').allInnerTexts()
  assert.deepEqual([days[0], days.at(-1)], ['Monday', 'Sunday'], 'the week starts on Monday')
  await snap('6-job-week-monday')
  await page.keyboard.press('Escape')

  // Voice and calls: the speech language is a live choice now.
  await page.keyboard.press('Escape')
  await go('/settings?group=voice')
  await choose('voice.input_language', 'Hebrew')
  await snap('7-settings-voice')
  assert.deepEqual(errors, [], `page errors at ${width}px ${theme}`)
}

async function main() {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  try {
    for (const width of (process.env.WIDTHS || '320,390,1280').split(',').map(Number)) for (const theme of (process.env.THEMES || 'light,dark').split(',')) await shoot(browser, width, theme)
  } finally { await browser.close() }
  console.log(`Round eleven settings shots saved in ${out}`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
