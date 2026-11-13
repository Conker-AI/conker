// More owner flows on the preview gateway: a chat to Trash and back, bulk archive with Undo, a
// settings change with Undo, and the Conker update card (offer, updating, applied; rolled back).
import { expect, test, type Page } from '@playwright/test'
import { open } from './pages'

const CHAT = 'Email to coach'
const row = (page: Page) => page.getByRole('button', { name: `More actions for ${CHAT}` })

test('chats: Move to Trash, then Restore from the Trash', async ({ page }) => {
  const errors = await open(page, '/chats')
  await row(page).click()
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click()
  await expect(row(page)).toBeHidden()

  await page.getByRole('button', { name: 'Trash', exact: true }).click()
  await row(page).click()
  await page.getByRole('menuitem', { name: 'Restore' }).click()
  await expect(row(page)).toBeHidden()

  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await expect(row(page)).toBeVisible()
  expect(errors).toEqual([])
})

test('chats: bulk archive, then Undo puts it back', async ({ page }) => {
  const errors = await open(page, '/chats')
  const title = page.getByRole('main').getByText(CHAT, { exact: true })
  await page.getByRole('button', { name: 'Select items' }).click()
  await page.getByRole('checkbox', { name: CHAT, exact: true }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(title).toBeHidden()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(title).toBeVisible()
  expect(errors).toEqual([])
})

test('settings: a model change saves at once, and Undo puts it back', async ({ page }) => {
  const errors = await open(page, '/settings?tab=models')
  const thinking = page.getByRole('region', { name: 'Talking' }).getByRole('combobox').nth(1)
  await expect(thinking).toHaveText('Off')
  await thinking.click()
  await page.getByRole('option').filter({ hasNotText: 'Off' }).first().click()
  await expect(thinking).not.toHaveText('Off')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(thinking).toHaveText('Off')
  expect(errors).toEqual([])
})

test('update: offer, Update, updating, then running the new version', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await open(page, '/inbox')
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeHidden()
  // The progress line is in the opened card.
  await page.getByRole('button', { name: /^Update available: 0\.2\.0/ }).click()
  await expect(page.getByText(/Conker is switching to the new version/)).toBeVisible()
  await expect(page.getByText('Updated to 0.2.0')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Update available: 0.2.0')).toBeHidden()
  expect(errors).toEqual([])
})

test('update: a rolled-back update says why, and Dismiss clears it', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-updates=rolled-back')
  await expect(page.getByText('Update to 0.1.1 rolled back')).toBeVisible()
  await expect(page.getByText(/Conker went back to the version it had/)).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss: Update to 0.1.1 rolled back' }).click()
  await expect(page.getByText('Update to 0.1.1 rolled back')).toBeHidden()
  expect(errors).toEqual([])
})
