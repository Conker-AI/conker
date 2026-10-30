// Screenshots of any dashboard screens for review: every address in ROUTES at every width in
// WIDTHS (default 320,390,1280) and theme in THEMES (default light,dark). ROUTES defaults to every
// place in the sidebar. Fails when a page throws or is wider than the window, after shooting the
// rest. Run against `npm run dev` (CONKER_URL, default http://localhost:5173). Requires Playwright;
// PLAYWRIGHT_MODULE may point to an existing installation and CHROMIUM_PATH to a browser binary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'shots')
const routes = (process.env.ROUTES || '/overview,/inbox,/chats,/projects,/memory,/agents,/tools,/jobs,/system,/settings,/chat,/activity,/artifacts,/setup').split(',')
// '/system?tab=services' -> 'system-tab-services'; '/' -> 'home'.
const slug = address => address.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'home'
const problems = []

async function shoot(browser, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, colorScheme: theme, reducedMotion: 'reduce' })
  try {
    await context.addInitScript(value => { try { localStorage.setItem('vite-ui-theme', value) } catch { /* Storage may be blocked. */ } }, theme)
    for (const address of routes) {
      const page = await context.newPage()
      const errors = []
      try {
        page.on('pageerror', error => errors.push(error.message))
        page.setDefaultTimeout(15000)
        await page.goto(`${base}${address}`)
        await page.locator('main').first().waitFor()
        // Skeletons mark themselves busy; a screen that stays busy is shot as it is.
        await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 10000 }).catch(() => {})
        await page.waitForTimeout(500)
        const file = path.join(out, `${slug(address)}-${width}-${theme}.png`)
        if (await page.getByRole('dialog').isVisible()) await page.screenshot({ path: file })
        else {
          // The page scrolls inside the app shell, so a full-page shot first grows the window to the content.
          const height = await page.evaluate(() => Math.max(innerHeight, ...[...document.querySelectorAll('*')].filter(node => node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)).map(node => node.scrollHeight + node.getBoundingClientRect().top)))
          const viewport = page.viewportSize()
          await page.setViewportSize({ width: viewport.width, height: Math.min(Math.ceil(height), 6000) })
          await page.screenshot({ path: file, fullPage: true })
          await page.setViewportSize(viewport)
        }
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) problems.push(`Horizontal overflow at ${width}px ${theme}: ${address}`)
      } catch (error) {
        problems.push(`${address} at ${width}px ${theme}: ${error.message}`)
      }
      if (errors.length) problems.push(`Page errors at ${width}px ${theme} on ${address}: ${errors.join(' | ')}`)
      await page.close()
    }
  } finally { await context.close() }
}

;(async () => {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  try {
    for (const width of (process.env.WIDTHS || '320,390,1280').split(',').map(Number)) for (const theme of (process.env.THEMES || 'light,dark').split(',')) await shoot(browser, width, theme)
  } finally { await browser.close() }
  console.log(`Screenshots in ${out}`)
  for (const problem of problems) console.error(problem)
  if (problems.length) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
