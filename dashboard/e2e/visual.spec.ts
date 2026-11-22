// Screenshot baselines for the main places at phone (320) and desktop (1280) width, on the preview gateway.
// The baselines are Linux Chromium renders (CI); on other systems the file names differ and the test skips.
// To refresh them after an intended look change: run the Dashboard workflow, download the
// `playwright-report-N` artifacts (they hold e2e/visual.spec.ts-snapshots), commit the new PNGs.
import { expect, test } from '@playwright/test'
import { open } from './pages'

const PLACES = ['/inbox', '/memory', '/agents', '/tools', '/settings?tab=models', '/system', '/setup']
const WIDTHS = [
  { width: 320, height: 720 },
  { width: 1280, height: 800 },
]

test.skip(process.platform !== 'linux', 'Baselines are rendered on Linux, as CI does.')
test.use({ colorScheme: 'light', reducedMotion: 'reduce' })

for (const viewport of WIDTHS)
  for (const place of PLACES) {
    test(`looks right: ${place} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(() => {
        try {
          localStorage.setItem('vite-ui-theme', 'light')
        } catch {
          /* Storage may be blocked. */
        }
      })
      const errors = await open(page, place)
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 }).catch(() => {})
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(800)
      const name = `${place.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'home'}-${viewport.width}.png`
      await expect(page).toHaveScreenshot(name, { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.02, mask: [page.locator('time')] })
      expect(errors).toEqual([])
    })
  }
