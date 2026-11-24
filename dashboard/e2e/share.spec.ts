// Sharing to Conker from another app: the share target opens /share with the shared text, which is
// kept in this tab (not the address) until it is saved to memory or cancelled.
import { expect, test } from '@playwright/test'
import { open } from './pages'

const shared = '/share?title=Soup%20recipe&text=Try%20this%20one&url=https%3A%2F%2Fexample.com%2Fsoup'

test('a share opens prefilled, leaves the address, and is saved once the server confirms', async ({ page }) => {
  const errors = await open(page, shared)
  const box = page.getByLabel('What you shared')
  await expect(box).toHaveValue('Soup recipe\nTry this one\nhttps://example.com/soup')
  await expect(page).toHaveURL(/\/share$/)
  await expect(page.getByRole('link', { name: /example\.com/ })).toHaveCount(0)
  // A reload (as after a sign-in) keeps the share from this tab's storage.
  await page.reload()
  await expect(box).toHaveValue('Soup recipe\nTry this one\nhttps://example.com/soup')
  await page.getByRole('button', { name: 'Save to memory' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved to your memory.' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('conker.share'))).toBeNull()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/overview$/)
  expect(errors).toEqual([])
})

test('a refused save keeps the text and says nothing was saved; a lost answer can be tried again', async ({ page }) => {
  const errors = await open(page, '/share?text=Keep%20me')
  await page.evaluate(() => (window as unknown as { conkerPreview: { fail(mode: string | null): void } }).conkerPreview.fail('dependency'))
  await page.getByRole('button', { name: 'Save to memory' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Nothing was saved.' })).toBeVisible()
  await expect(page.getByLabel('What you shared')).toHaveValue('Keep me')
  await page.evaluate(() => (window as unknown as { conkerPreview: { fail(mode: string | null): void } }).conkerPreview.fail('network'))
  await page.getByRole('button', { name: 'Save to memory' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'couldn’t confirm it was saved' })).toBeVisible()
  await page.evaluate(() => (window as unknown as { conkerPreview: { fail(mode: string | null): void } }).conkerPreview.fail(null))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved to your memory.' })).toBeVisible()
  expect(errors).toEqual([])
})

test('too long to save, and nothing shared', async ({ page }) => {
  await open(page, `/share?text=${'a'.repeat(2100)}`)
  await expect(page.getByText('Too long to save: memory keeps up to 2,000 characters. Shorten it by 100.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save to memory' })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/overview$/)
  await open(page, '/share')
  await expect(page.getByText('Nothing was shared')).toBeVisible()
})
