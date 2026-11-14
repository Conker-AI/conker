// The owner reads every screen: no engineer words, no raw ids, and one count for what waits for him (R-E12).
// Walks every place and tab in the navigation table on the preview gateway and fails on the words below.
import { expect, test } from '@playwright/test'
import { gatewayDestinations, gatewayPageNavigation } from '../src/components/gateway/navigation'
import { open } from './pages'

// Screens reached from a link on another page are listed by hand.
const linked = ['/memory?view=care', '/memory?view=beliefs']
const places = [...new Set([...linked, ...gatewayDestinations.flatMap(item => {
  const path = item.path.split('?')[0]
  return [path, ...gatewayPageNavigation(path, '').sections.map(section => section.to)]
})])]
// Mechanism words, and snake_case ids such as review_changes.
const engineerWords = /\bRevision \d|records? loaded|recorded relationships|\bendpoint\b|Configuration only|selection conflict|\b[a-z]+_[a-z]+\b/i

for (const place of places) test(`plain words: ${place}`, async ({ page }) => {
  const errors = await open(page, place)
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const text = await page.locator('body').innerText()
  expect(text.match(engineerWords)?.[0] ?? null, `engineer word on ${place}`).toBeNull()
  expect(errors).toEqual([])
})

test('Home counts what needs him like the sidebar does', async ({ page }) => {
  await open(page, '/overview')
  await expect(page.getByText('Needs you', { exact: true }).first()).toBeVisible()
  await page.waitForTimeout(1500)
  const text = await page.locator('body').innerText()
  const sidebar = text.match(/Inbox\n(\d+)/)?.[1]
  const home = text.match(/Needs you\n(\d+)/)?.[1]
  expect(sidebar).toBeTruthy()
  expect(home).toBe(sidebar)
})
