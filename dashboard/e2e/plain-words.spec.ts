// The owner reads every screen: no engineer words, no raw ids, and one count for what waits for him (R-E12).
// Walks every place and tab in the navigation table on the preview gateway and fails on the words below.
import { expect, test } from '@playwright/test'
import { allPlaces as places, open } from './pages'

// Mechanism words, and snake_case ids such as review_changes.
const engineerWords = /\bRevision \d|records? loaded|recorded relationships|\bendpoint\b|Configuration only|selection conflict|\b[a-z]+_[a-z]+\b/i

// Words the sweep of 2026-11-15 found on live screens (words.md), each now replaced by a plain word: cron (Jobs),
// ToolGate, gateway, opaque target, immutable, "Model ID" / "Tool IDs", "chip" for a setting, Incognito (Private
// chat), "Take snapshot" (Check now), British "summarised", "Prompt improved", router ids such as jev-preview.
const sweepWords = /\bcron\b|\b(?:Tool|Memory|System)Gate\b|\bgateway\b|\bopaque\b|\bimmutable\b|\bModel IDs?\b|\bTool IDs\b|\bchips?\b|\bIncognito\b|Take snapshot|\bsummari[sz]ed\b|Prompt improved|execution policy|verified receipt|\bjev-[a-z]+/i

for (const place of places) test(`plain words: ${place}`, async ({ page }) => {
  const errors = await open(page, place)
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const text = await page.locator('body').innerText()
  expect(text.match(engineerWords)?.[0] ?? null, `engineer word on ${place}`).toBeNull()
  expect(text.match(sweepWords)?.[0] ?? null, `word from the 2026-11-15 sweep on ${place}`).toBeNull()
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

// The composer's own popovers: the words that sat behind a tap rather than on the page.
test('the composer popovers speak plainly', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  await page.getByRole('textbox').first().fill('Compare these two contracts and tell me which one is riskier for me')
  await expect(page.getByRole('button', { name: /^Mode: Auto · / })).toBeVisible({ timeout: 10_000 })
  for (const name of [/^Mode: /, /^Private chat/, /^Think first/]) {
    await page.getByRole('button', { name }).first().click()
    const text = await page.locator('[data-slot="popover-popup"]').last().innerText()
    await page.keyboard.press('Escape')
    expect(text.match(sweepWords)?.[0] ?? null, `a word from the sweep in the ${String(name)} popover`).toBeNull()
    expect(text.match(engineerWords)?.[0] ?? null, `an engineer word in the ${String(name)} popover`).toBeNull()
    expect(text).not.toMatch(/\broute\b/i)
  }
  expect(errors).toEqual([])
})
