// Screenshots of interactive answers at phone and desktop width, light and dark, plus the main taps:
// a choice, a form submit and "Show source". Starts its own Vite dev server on the preview page.
//
//   PLAYWRIGHT_MODULE=<path to playwright> node scripts/answer-ui-screenshots.cjs [outDir]
//
// CHROMIUM_PATH may point at an installed Chromium. Fails on page errors or sideways scrolling.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const out = path.resolve(process.argv[2] || path.join(root, '.cache/answer-ui'))

async function main() {
  const { createServer } = await import('vite')
  const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), configLoader: 'runner', server: { port: 5297, host: '127.0.0.1' }, logLevel: 'error' })
  await server.listen()
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  fs.mkdirSync(out, { recursive: true })
  const shots = []
  try {
    for (const theme of ['light', 'dark']) {
      for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 900 }, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
        page.on('request', request => { if (/jsdelivr|unpkg|posthog|cloudfront/i.test(request.url())) errors.push(`remote request: ${request.url()}`) })
        await page.goto(`${base}/scripts/answer-ui-preview/index.html?theme=${theme}`, { waitUntil: 'networkidle', timeout: 180000 })
        await page.locator('[data-answer-ui="ready"]').nth(2).waitFor({ timeout: 120000 })
        await page.locator('[data-answer-ui="streaming"]').waitFor()
        await page.getByText("Couldn't show this part").waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(300)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        assert.ok(overflow <= 1, `${theme} ${width}px scrolls sideways by ${overflow}px`)
        const file = path.join(out, `answers-${width}-${theme}.png`)
        await page.screenshot({ path: file, fullPage: true })
        shots.push(file)

        if (theme === 'light' || width === 390) {
          // A choice sends its text through the chat's draft and Send.
          const spending = page.locator('[data-sample="spending"]')
          await spending.getByRole('button', { name: "Show November's plan" }).click()
          await spending.locator('[data-sent]', { hasText: "Plan November's budget from this" }).waitFor()
          // A form sends one message with the answered fields.
          const form = page.locator('[data-sample="form"]')
          await form.getByLabel('Where to').fill('Lisbon')
          await form.getByRole('button', { name: 'Plan it' }).click()
          await form.locator('[data-sent]', { hasText: 'Where to: Lisbon' }).waitFor()
          assert.match(await form.locator('[data-sent]').innerText(), /^Trip details\n- Where to: Lisbon\n- Budget: 1200$/)
          // A part that can't be shown keeps its source one tap away.
          const failure = page.locator('[data-sample="failure"]')
          await failure.getByRole('button', { name: 'Show source' }).click()
          await failure.getByText('map = Map("Lisbon", 12)').waitFor()
          // The blocked link stays blocked; the checked one is a plain link.
          assert.equal(await spending.getByRole('link', { name: 'Open the bank export' }).getAttribute('href'), 'https://example.com/export')
          const tapped = path.join(out, `answers-${width}-${theme}-after-taps.png`)
          await page.screenshot({ path: tapped, fullPage: true })
          shots.push(tapped)
        }
        assert.deepEqual(errors, [], `${theme} ${width}px page errors`)
        await page.close()
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Answer UI screenshots (${shots.length}):\n${shots.map(file => `- ${file}`).join('\n')}`)
}

main().catch(error => { console.error(error); process.exit(1) })
