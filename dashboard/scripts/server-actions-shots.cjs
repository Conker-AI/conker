// Screenshots of Server > Services, Server > Backups and Recent server actions in the preview
// gateway, in every state (`?preview-host=`): first use, loading, the helper unavailable, busy,
// refused, the password sheet, working, done, failed and unknown with its check. Phone (390) and
// desktop (1280), light and dark. Run against `npm run dev` (CONKER_URL, default
// http://localhost:5173). Requires Playwright; PLAYWRIGHT_MODULE may point to an existing
// installation and CHROMIUM_PATH to a browser binary. ONLY=name,name limits the states.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const base = process.env.CONKER_URL || 'http://localhost:5173'
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', '.cache', 'review', 'server-actions')
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null

const services = '/system?tab=services', backups = '/system?tab=backups'
const confirm = async (page, action) => {
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Owner password').fill('preview')
  await dialog.getByRole('button', { name: action }).click()
}
// name: [address, steps]; each step waits for what it shows, then a shot is taken under `name-step`.
const states = {
  services: [services, { list: page => page.getByText('All 10 services are running.').waitFor() }],
  'services-loading': [`${services}&preview-delay=6000`, { skeleton: page => page.getByRole('status', { name: 'Reading your services…' }).waitFor() }],
  'services-restart': [`${services}&service=memorygate`, {
    details: page => page.getByRole('button', { name: 'Restart Memory' }).waitFor(),
    sheet: async page => { await page.getByRole('button', { name: 'Restart Memory' }).click(); await page.getByRole('dialog').getByText('Conker can’t recall or save memories').waitFor() },
    working: async page => { await confirm(page, 'Restart Memory'); await page.getByText('Restarting Memory…').first().waitFor() },
    done: page => page.getByText('Restarted Memory').first().waitFor({ timeout: 20000 }),
  }],
  'services-unknown': [`${services}&service=memorygate&preview-host=unknown`, {
    unknown: page => page.getByText('Can’t tell if Memory restarted').first().waitFor(),
    checked: async page => { await page.getByRole('button', { name: 'Check', exact: true }).click(); await page.getByText(/Checked .*Memory is running/).waitFor() },
  }],
  'services-failed': [`${services}&service=searxng&preview-host=failed`, { failed: page => page.getByText('Web search didn’t restart').first().waitFor() }],
  'services-unavailable': [`${services}&preview-host=unavailable`, { helper: page => page.getByText('The server helper isn’t running').waitFor() }],
  'services-docker': [`${services}&preview-host=docker`, { message: page => page.getByText('Docker did not answer.').waitFor() }],
  'services-busy': [`${services}&service=pi&preview-host=busy`, {
    refusal: async page => { await page.getByRole('button', { name: 'Restart Pi' }).click(); await confirm(page, 'Restart Pi'); await page.getByText(/Didn’t start: Another server action is running/).waitFor() },
  }],
  'services-held': [`${services}&preview-host=held`, { waiting: page => page.getByText('Restarts are waiting').waitFor() }],
  'services-refused': [`${services}&service=toolgate&preview-host=refused`, {
    refusal: async page => { await page.getByRole('button', { name: 'Restart Tools' }).click(); await confirm(page, 'Restart Tools'); await page.getByText(/Didn’t start: This installation has no service/).waitFor() },
  }],
  'services-lost': [`${services}&service=ollama&preview-host=lost`, {
    lost: async page => { await page.getByRole('button', { name: 'Restart Local models' }).click(); await confirm(page, 'Restart Local models'); await page.getByText('Can’t tell if it started').waitFor() },
    checked: async page => { await page.getByRole('button', { name: 'Check', exact: true }).click(); await page.getByText(/Restart(ing|ed) Local models/).first().waitFor() },
  }],
  backups: [backups, { summary: page => page.getByText('Same computer: lost if this PC dies.').waitFor() }],
  'backups-same-disk': [`${backups}&preview-host=same-disk`, { summary: page => page.getByText('Same computer and same disk: lost if this disk or this PC dies.').waitFor() }],
  'backups-first-use': [`${backups}&preview-host=first-use`, { setup: page => page.getByText('Choose where backups go').waitFor() }],
  'backups-unmounted': [`${backups}&preview-host=unmounted`, { missing: page => page.getByText('The backup folder isn’t there.').waitFor() }],
  'backups-loading': [`${backups}&preview-delay=6000`, { skeleton: page => page.getByRole('status', { name: 'Reading your backup folder…' }).waitFor() }],
  'backups-run': [backups, {
    sheet: async page => { await page.getByRole('button', { name: 'Back up now' }).click(); await page.getByRole('dialog').getByText('Conker pauses for a few minutes').waitFor() },
    working: async page => { await confirm(page, 'Back up now'); await page.getByText('Backing up…').first().waitFor() },
    paused: page => page.getByText('Can’t reach your server right now').waitFor({ timeout: 15000 }),
    done: page => page.getByText('Backed up and checked').first().waitFor({ timeout: 30000 }),
  }],
  'backups-verify': [`${backups}&preview-host=failed`, {
    failed: async page => { await page.getByRole('link', { name: /4 days old/ }).click(); await page.getByText('didn’t pass its check').first().waitFor() },
    sheet: async page => { await page.getByRole('button', { name: 'Check this backup', exact: true }).click(); await page.getByRole('dialog').getByText('saved fingerprints').waitFor() },
  }],
  'backups-unknown': [`${backups}&preview-host=unknown`, {
    unknown: page => page.getByText('Can’t tell if the backup finished').first().waitFor(),
    checked: async page => { await page.getByRole('button', { name: 'Check', exact: true }).click(); await page.getByText(/Checked .*no new backup is in the folder/).waitFor() },
  }],
  'backups-working-cli': [`${backups}&preview-host=working`, { working: page => page.getByText('Backing up…').first().waitFor() }],
  'backups-unavailable': [`${backups}&preview-host=unavailable`, { helper: page => page.getByText('The server helper isn’t running').waitFor() }],
  'backups-refused': [`${backups}&preview-host=refused`, {
    refusal: async page => { await page.getByRole('button', { name: 'Back up now' }).click(); await confirm(page, 'Back up now'); await page.getByText(/Didn’t start: The backup folder is not there/).waitFor() },
  }],
  overview: ['/system?preview-host=unknown', { recent: page => page.getByRole('heading', { name: 'Recent server actions' }).waitFor() }],
  'overview-unavailable': ['/system?preview-host=unavailable', { recent: page => page.getByText('The server helper isn’t running').waitFor() }],
}

async function shoot(browser, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, colorScheme: theme, reducedMotion: 'reduce' })
  await context.addInitScript(value => { try { localStorage.setItem('vite-ui-theme', value) } catch { /* Storage may be blocked. */ } }, theme)
  for (const [name, [address, steps]] of Object.entries(states)) {
    if (only && !only.has(name)) continue
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(15000)
    await page.goto(`${base}${address}`)
    for (const [step, run] of Object.entries(steps)) {
      await run(page)
      await page.waitForTimeout(300)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px: ${name} ${step}`)
      const file = path.join(out, `${name}-${step}-${width}-${theme}.png`)
      if (await page.getByRole('dialog').isVisible()) await page.screenshot({ path: file })
      else {
        // The page scrolls inside the app shell, so a full-page shot first grows the window to the content.
        const height = await page.evaluate(() => Math.max(innerHeight, ...[...document.querySelectorAll('*')].filter(node => node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)).map(node => node.scrollHeight + node.getBoundingClientRect().top)))
        const viewport = page.viewportSize()
        await page.setViewportSize({ width: viewport.width, height: Math.min(Math.ceil(height), 6000) })
        await page.screenshot({ path: file, fullPage: true })
        await page.setViewportSize(viewport)
      }
    }
    assert.deepEqual(errors, [], `Page errors in ${name}`)
    await page.close()
  }
  await context.close()
}

;(async () => {
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  try {
    for (const width of (process.env.WIDTHS || '390,1280').split(',').map(Number)) for (const theme of (process.env.THEMES || 'light,dark').split(',')) await shoot(browser, width, theme)
  } finally { await browser.close() }
  console.log(`Screenshots in ${out}`)
})().catch(error => { console.error(error); process.exitCode = 1 })
