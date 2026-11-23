// Screenshot baselines for the main places at phone (320) and desktop (1280) width, light and dark, on the preview gateway.
// The memory screens, open loops and the Inbox's memory-recall card are also taken at 390.
// The baselines are Linux Chromium renders (CI); on other systems the file names differ and the test skips.
// To refresh them after an intended look change: run the Dashboard workflow, download the
// `playwright-report-N` artifacts (they hold e2e/visual.spec.ts-snapshots), commit the new PNGs.
import { expect, test, type Page } from '@playwright/test'
import { open } from './pages'

type Viewport = { width: number; height: number }
type Place = {
  path: string
  name: string
  /** Shows times and dates, so the clock is fixed. */
  frozen?: boolean
  /** Widths beyond the default phone and desktop pair. */
  widths?: readonly Viewport[]
  /** Photograph one element instead of the screen. */
  target?: (page: Page) => ReturnType<Page['locator']>
}

const PHONE = { width: 320, height: 720 }
const LARGE_PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }
const ALL_WIDTHS = [PHONE, LARGE_PHONE, DESKTOP]
const RECALL_CARD = 'A memory you corrected was used in 3 answers in 2 chats'

const PLACES: Place[] = [
  { path: '/inbox', name: 'inbox' },
  { path: '/memory', name: 'memory' },
  { path: '/agents', name: 'agents' },
  { path: '/tools', name: 'tools' },
  { path: '/settings?tab=models', name: 'settings-tab-models' },
  { path: '/system', name: 'system' },
  { path: '/setup', name: 'setup' },
  { path: '/chat?session=ses_1111111111111111', name: 'chat', frozen: true },
  { path: '/overview', name: 'home', frozen: true },
  { path: '/memory?view=beliefs', name: 'memory-beliefs', frozen: true, widths: ALL_WIDTHS },
  { path: '/memory?view=care', name: 'memory-care', frozen: true, widths: ALL_WIDTHS },
  { path: '/loops', name: 'open-loops', frozen: true, widths: ALL_WIDTHS },
  {
    path: '/inbox',
    name: 'inbox-recall-card',
    frozen: true,
    widths: ALL_WIDTHS,
    target: page => page.getByRole('article', { name: RECALL_CARD }),
  },
]
const THEMES = ['light', 'dark'] as const
// A fixed Friday morning, so "5 s ago", "7:20 AM" and "Fri 20 Nov" render the same on every run.
const FROZEN_AT = new Date('2026-11-20T09:00:00Z')

test.skip(process.platform !== 'linux', 'Baselines are rendered on Linux, as CI does.')
test.use({ reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' })

for (const theme of THEMES)
  for (const place of PLACES)
    for (const viewport of place.widths ?? [PHONE, DESKTOP]) {
      test(`looks right: ${place.name} at ${viewport.width}px, ${theme}`, async ({ page }) => {
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
        const target = place.target?.(page)
        if (target) {
          await expect(target).toBeVisible()
          await target.scrollIntoViewIfNeeded()
        }
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(800)
        const name = `${place.name}${theme === 'dark' ? '-dark' : ''}-${viewport.width}.png`
        const options = { animations: 'disabled' as const, caret: 'hide' as const, maxDiffPixelRatio: 0.02, mask: [page.locator('time')] }
        if (target) await expect(target).toHaveScreenshot(name, options)
        else await expect(page).toHaveScreenshot(name, options)
        expect(errors).toEqual([])
      })
    }
