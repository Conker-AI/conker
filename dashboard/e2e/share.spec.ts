// Sharing to Conker from another app: the share target opens /share with the shared text, which is
// kept in this tab (not the address) until it is saved to the Inbox (a chat of its own) or cancelled.
import { expect, test } from '@playwright/test'
import { open } from './pages'

const shared = '/share?title=Soup%20recipe&text=Try%20this%20one&url=https%3A%2F%2Fexample.com%2Fsoup'

test('a share opens prefilled, leaves the address, is saved to the Inbox once the server confirms, and is listed there', async ({ page }) => {
  const errors = await open(page, shared)
  const box = page.getByLabel('What you shared')
  await expect(box).toHaveValue('Soup recipe\nTry this one\nhttps://example.com/soup')
  await expect(page).toHaveURL(/\/share$/)
  await expect(page.getByRole('link', { name: /example\.com/ })).toHaveCount(0)
  // A reload (as after a sign-in) keeps the share from this tab's storage.
  await page.reload()
  await expect(box).toHaveValue('Soup recipe\nTry this one\nhttps://example.com/soup')
  await page.getByRole('button', { name: 'Save to Inbox' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved to your Inbox.' })).toBeVisible()
  await expect(page.getByText('It has a chat of its own, “Shared: Soup recipe Try this one https://example.com/soup”.', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open', exact: true })).toHaveAttribute('href', /\/chat\?session=ses_[0-9a-f]{16}$/)
  await expect(page.getByRole('button', { name: 'Save to memory' })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('conker.share'))).toBeNull()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/overview$/)
  // In the app, not a reload: the preview server keeps what was saved in this page only.
  await page
    .getByRole('link', { name: /^Inbox/ })
    .first()
    .click()
  const section = page.getByRole('region', { name: 'Shared by you' })
  await expect(section.getByText('Shared: Soup recipe Try this one https://example.com/soup')).toBeVisible()
  expect(errors).toEqual([])
})

test('a refused save keeps the text and says nothing was saved; a lost answer can be tried again', async ({ page }) => {
  const errors = await open(page, '/share?text=Keep%20me')
  await page.evaluate(() => (window as unknown as { conkerPreview: { fail(mode: string | null): void } }).conkerPreview.fail('dependency'))
  await page.getByRole('button', { name: 'Save to Inbox' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Nothing was saved.' })).toBeVisible()
  await expect(page.getByLabel('What you shared')).toHaveValue('Keep me')
  await page.evaluate(() => (window as unknown as { conkerPreview: { fail(mode: string | null): void } }).conkerPreview.fail('network'))
  await page.getByRole('button', { name: 'Save to Inbox' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'couldn’t confirm it was saved' })).toBeVisible()
  await page.evaluate(() => (window as unknown as { conkerPreview: { fail(mode: string | null): void } }).conkerPreview.fail(null))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved to your Inbox.' })).toBeVisible()
  expect(errors).toEqual([])
})

test('too long to save, and nothing shared', async ({ page }) => {
  await open(page, `/share?text=${'a'.repeat(2100)}`)
  await expect(page.getByText('Too long to save: the Inbox keeps up to 2,000 characters. Shorten it by 100.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save to Inbox' })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/overview$/)
  await open(page, '/share')
  await expect(page.getByText('Nothing was shared')).toBeVisible()
})
