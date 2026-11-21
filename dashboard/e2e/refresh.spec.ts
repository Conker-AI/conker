// "Refresh everything" and the check on entering the app, in a browser against the preview gateway:
// the button's states, that screens read again while the chat panel and unsaved work survive, the
// quiet re-check after a long absence, and the soft messages when the server cannot check.
import { expect, test, type Page } from '@playwright/test'
import { card, open } from './pages'

const CARD = 'Read next week’s calendar'
type Marked = HTMLElement & { __kept?: boolean }
const refreshButton = (page: Page) => page.getByRole('button', { name: 'Refresh everything' })
const status = (page: Page, text: RegExp | string) => page.getByRole('status').filter({ hasText: text })
const checks = (page: Page) => page.evaluate(() => (globalThis as { __conkerFakeUpdateChecks?: number }).__conkerFakeUpdateChecks ?? 0)
/** Lets a test move the page's clock, as if the owner had been away. */
async function skewableClock(page: Page) {
  await page.addInitScript(() => {
    const real = Date.now.bind(Date), view = window as unknown as { __skew: number }
    view.__skew = 0
    Date.now = () => real() + view.__skew
  })
}
async function away(page: Page, minutes: number) {
  await page.evaluate(minutes => {
    const view = window as unknown as { __skew: number }
    const set = (value: string) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value }); document.dispatchEvent(new Event('visibilitychange')) }
    set('hidden'); view.__skew += minutes * 60_000; set('visible')
  }, minutes)
}
/** The busy state lasts well under a second: record it instead of racing it. */
const watchBusy = (page: Page) => refreshButton(page).evaluate(button => {
  const seen: string[] = [], view = window as unknown as { __busy: string[] }
  view.__busy = seen
  new MutationObserver(() => { if (button.getAttribute('aria-busy') === 'true') seen.push(getComputedStyle(button.querySelector('svg')!).animationName) })
    .observe(button, { attributes: true, subtree: true, attributeFilter: ['aria-busy', 'class'] })
})
const busySeen = (page: Page) => page.evaluate(() => (window as unknown as { __busy: string[] }).__busy)
/** Marks the Inbox card's element: a remount replaces it and the mark is gone. */
const mark = (page: Page, title: string) => card(page, title).evaluate(element => { (element as Marked).__kept = true })
const kept = (page: Page, title: string) => card(page, title).evaluate(element => (element as Marked).__kept === true)

test('refresh: the click shows work, reads the screen again and finds a release without a reload', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-updates=on-check')
  await page.evaluate(() => { (window as unknown as { __page: boolean }).__page = true })
  await mark(page, CARD)
  await watchBusy(page)
  await refreshButton(page).click()
  await expect(status(page, /^Refreshed\./)).toBeVisible()
  expect((await busySeen(page)).length, 'The button showed it was working').toBeGreaterThan(0)
  await expect(page.getByText('Update available: 0.2.0').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible()
  expect(await kept(page, CARD), 'The screen was mounted again').toBe(false)
  expect(await page.evaluate(() => (window as unknown as { __page?: boolean }).__page), 'The page itself did not reload').toBe(true)
  expect(errors).toEqual([])
})

test('refresh: a release found when the app is entered is announced with a View button', async ({ page }) => {
  const errors = await open(page, '/overview?preview-updates=on-check')
  await expect(page.getByText('Update available: 0.2.0').first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page).toHaveURL(/\/inbox/)
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('refresh: the chat panel and typed text survive', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const composer = page.getByRole('textbox', { name: /Ask Conker anything|Message Conker/ })
  await composer.fill('A question I have not sent yet')
  await composer.evaluate(element => { (element as Marked).__kept = true })
  await page.waitForTimeout(1_200) // the draft saves after a moment
  await refreshButton(page).click()
  const anyway = page.getByRole('button', { name: 'Refresh anyway' })
  if (await anyway.isVisible({ timeout: 1_000 }).catch(() => false)) await anyway.click()
  await expect(status(page, /^Refreshed\./)).toBeVisible()
  await expect(composer).toHaveValue('A question I have not sent yet')
  expect(await composer.evaluate(element => (element as Marked).__kept === true), 'The chat panel was not mounted again').toBe(true)
  expect(errors).toEqual([])
})

test('refresh: unsaved work asks first; Cancel keeps it, Refresh anyway goes on', async ({ page }) => {
  const errors = await open(page, '/inbox')
  // Screens with unsaved work tell the browser not to leave; the refresh asks the same question.
  await page.evaluate(() => {
    const view = window as unknown as { __unsaved: boolean }
    view.__unsaved = true
    window.addEventListener('beforeunload', event => { if (view.__unsaved) event.preventDefault() })
  })
  await mark(page, CARD)
  await refreshButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Refresh anyway?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(await kept(page, CARD), 'Cancel changed nothing').toBe(true)
  await refreshButton(page).click()
  await page.getByRole('dialog', { name: 'Refresh anyway?' }).getByRole('button', { name: 'Refresh anyway' }).click()
  await expect(status(page, /^Refreshed\./)).toBeVisible()
  expect(await kept(page, CARD)).toBe(false)
  expect(errors).toEqual([])
})

test('refresh: coming back after a long absence checks quietly and never remounts', async ({ page }) => {
  await skewableClock(page)
  const errors = await open(page, '/inbox')
  await expect.poll(() => checks(page)).toBeGreaterThan(0)
  await page.waitForTimeout(4_500) // the entry check finishes
  await mark(page, CARD)
  const before = await checks(page)
  await away(page, 3)
  await page.waitForTimeout(500)
  expect(await checks(page), 'Three minutes away does nothing').toBe(before)
  await away(page, 40)
  await expect.poll(() => checks(page)).toBeGreaterThan(before)
  expect(await kept(page, CARD), 'Returning never mounts the screen again').toBe(true)
  expect(errors).toEqual([])
})

test('refresh: a server that cannot check says so softly', async ({ page }) => {
  const errors = await open(page, '/overview?preview-host=unavailable')
  await refreshButton(page).click()
  await expect(status(page, 'Refreshed. Couldn’t check for updates.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('refresh: with nothing new it says everything is up to date', async ({ page }) => {
  const errors = await open(page, '/overview?preview-updates=none')
  await refreshButton(page).click()
  await expect(status(page, 'Refreshed. Everything is up to date.')).toBeVisible()
  expect(errors).toEqual([])
})

test('refresh: an older server that does not know the check shows no error', async ({ page }) => {
  const errors = await open(page, '/overview?preview-host=no-update-check')
  await refreshButton(page).click()
  await expect(status(page, 'Refreshed. Everything is up to date.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('refresh: the spinner stops for people who ask for less motion', async ({ page }) => {
  await open(page, '/overview')
  await watchBusy(page)
  await refreshButton(page).click()
  await expect(status(page, /^Refreshed\./)).toBeVisible()
  const seen = await busySeen(page)
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every(name => name === 'none'), 'Reduced motion: the icon does not spin').toBe(true)
})

test('refresh: a server that does not answer is an error, not "up to date"', async ({ page }) => {
  await open(page, '/overview')
  await page.evaluate(() => sessionStorage.setItem('conker-fake-fail', 'gateway-health'))
  await refreshButton(page).click()
  await expect(status(page, 'Couldn’t reach your server. Try again.')).toBeVisible()
  await expect(status(page, /Up to date|up to date/)).toHaveCount(0)
})
