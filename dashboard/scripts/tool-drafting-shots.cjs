// Screenshots of tool drafting in the preview gateway: the Inbox card in each state, Tools'
// "Describe a new tool", Review into the editor (ToolGate's check), publishing with "Let Conker use
// this tool", and the two new model roles. Phone (390) and desktop (1280), light and dark.
// Run against `npm run dev` (CONKER_URL, default http://localhost:5173). Requires Playwright;
// PLAYWRIGHT_MODULE may point to an existing installation and CHROMIUM_PATH to a browser binary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'tool-drafting')

let current = null
async function shoot(browser, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, colorScheme: theme, reducedMotion: 'reduce' })
  await context.addInitScript(value => { try { localStorage.setItem('vite-ui-theme', value) } catch { /* Storage may be blocked. */ } }, theme)
  const page = await context.newPage()
  current = page
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(15000)
  const name = step => path.join(out, `${step}-${width}-${theme}.png`)
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px: ${page.url()}`)
  // The page scrolls inside the app shell, so a full-page shot first grows the window to the content.
  const snap = async step => {
    await noOverflow()
    const height = await page.evaluate(() => Math.max(innerHeight, ...[...document.querySelectorAll('*')].filter(node => node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)).map(node => node.scrollHeight + node.getBoundingClientRect().top)))
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: viewport.width, height: Math.min(Math.ceil(height), 6000) })
    await page.screenshot({ path: name(step), fullPage: true })
    await page.setViewportSize(viewport)
  }

  // Inbox: drafting, ready (with its steps) and failed tool requests, beside the other kinds.
  await page.goto(`${base}/inbox`)
  await page.getByText('Conker is drafting this tool…').waitFor()
  await page.getByText('What it does, step by step').waitFor()
  await page.getByText('Couldn’t draft it:').waitFor()
  await snap('1-inbox-states')
  // Failed, Change: his words come back to edit.
  const failed = page.getByRole('article', { name: 'Tool: Post my notes to Telegram' })
  await failed.getByRole('button', { name: 'Change' }).click()
  await failed.getByRole('button', { name: 'Draft again' }).waitFor()
  await failed.screenshot({ path: name('2-inbox-failed-change') })

  // Tools: describe a new tool; the request shows at once as drafting, here and in the Inbox.
  await page.goto(`${base}/tools`)
  await page.getByRole('heading', { name: 'Describe a new tool' }).waitFor()
  await snap('3-tools-describe')
  await page.getByRole('textbox', { name: 'Describe a new tool' }).fill('List the homework due tomorrow from my school calendar every evening.')
  await page.getByRole('button', { name: 'Draft', exact: true }).click()
  await page.getByRole('article', { name: /List the homework/ }).getByText('Conker is drafting this tool…').waitFor()
  await snap('4-tools-drafting')

  // Review: saved as a draft, then opened in Tools with ToolGate's check.
  await page.goto(`${base}/inbox`)
  const ready = page.getByRole('article', { name: 'Tool: Study group digest' })
  await ready.getByRole('button', { name: 'Review' }).click()
  await page.waitForURL(/\/tools\?draft=.+&request=creq_/)
  await page.getByText(/ToolGate: (valid|needs attention)/).first().waitFor({ state: 'attached' })
  await snap('5-editor-toolgate-check')

  // Publish with "Let Conker use this tool" (on by default), then what happened in plain words.
  await page.getByRole('button', { name: 'More tool actions' }).click()
  await page.getByRole('button', { name: 'Publish saved version' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('switch', { name: /Let Conker use this tool/ }).waitFor()
  assert.equal(await dialog.getByRole('switch', { name: /Let Conker use this tool/ }).getAttribute('aria-checked'), 'true', 'On by default')
  await dialog.screenshot({ path: name('6-publish-dialog') })
  await dialog.getByRole('button', { name: 'Publish current draft' }).click()
  await dialog.getByText('Published. Conker can use it now.').waitFor()
  await dialog.getByText('Conker told the chat that asked for it.').waitFor()
  await dialog.screenshot({ path: name('7-published') })
  await page.keyboard.press('Escape')

  // Settings: the two new model roles.
  await page.goto(`${base}/settings?group=models`)
  const roles = page.getByRole('heading', { name: 'Model roles' })
  await roles.waitFor()
  await page.getByText(': how new memories are sorted').scrollIntoViewIfNeeded()
  await page.getByText(': how new memories are sorted').click()
  await page.getByText('MemoryGate asks this model').waitFor()
  await page.getByText(': how new memories are sorted').evaluate(node => node.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: name('8-model-roles') })

  assert.deepEqual(errors, [], `Page errors at ${width}px ${theme}`)
  await context.close()
}

async function main() {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  try {
    for (const width of [390, 1280]) for (const theme of ['light', 'dark']) { await shoot(browser, width, theme); console.log(`PASS ${width}px ${theme}`) }
  } catch (error) { await current?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => undefined); throw error } finally { await browser.close() }
  console.log(`Screenshots in ${out}`)
}
main().catch(async error => { console.error(error); process.exitCode = 1 })
