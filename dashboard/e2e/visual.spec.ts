// Screenshot baselines for the main places at phone (320) and desktop (1280) width, light and dark, on the preview gateway.
// The baselines are Linux Chromium renders (CI); on other systems the file names differ and the test skips.
// To refresh them after an intended look change: run the Dashboard workflow, download the
// `playwright-report-N` artifacts (they hold e2e/visual.spec.ts-snapshots), commit the new PNGs.
import { expect, test } from '@playwright/test'
import { open } from './pages'

/** Each place and its baseline name; `frozen` places show times and dates, so their clock is fixed. */
const PLACES = [
  { path: '/inbox', name: 'inbox' },
  { path: '/memory', name: 'memory' },
  { path: '/agents', name: 'agents' },
  { path: '/tools', name: 'tools' },
  { path: '/settings?tab=models', name: 'settings-tab-models' },
  { path: '/system', name: 'system' },
  { path: '/setup', name: 'setup' },
  { path: '/chat?session=ses_1111111111111111', name: 'chat', frozen: true },
  { path: '/overview', name: 'home', frozen: true },
]
const WIDTHS = [
  { width: 320, height: 720 },
  { width: 1280, height: 800 },
]
const THEMES = ['light', 'dark'] as const
// A fixed Friday morning, so "5 s ago", "7:20 AM" and "Fri 20 Nov" render the same on every run.
const FROZEN_AT = new Date('2026-11-20T09:00:00Z')

test.skip(process.platform !== 'linux', 'Baselines are rendered on Linux, as CI does.')
test.use({ reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' })

for (const theme of THEMES)
  for (const viewport of WIDTHS)
    for (const place of PLACES) {
      test(`looks right: ${place.path} at ${viewport.width}px, ${theme}`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        if (place.frozen) await page.clock.setFixedTime(FROZEN_AT)
        await page.addInitScript(value => {
          try {
            localStorage.setItem('vite-ui-theme', value)
          } catch {
            /* Storage may be blocked. */
          }
        }, theme)
        const errors = await open(page, place.path)
        await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 }).catch(() => {})
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(800)
        const name = `${place.name}${theme === 'dark' ? '-dark' : ''}-${viewport.width}.png`
        await expect(page).toHaveScreenshot(name, { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02, mask: [page.locator('time')] })
        expect(errors).toEqual([])
      })
    }
