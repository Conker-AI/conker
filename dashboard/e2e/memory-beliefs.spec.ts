// What Conker believes, on the preview gateway: told apart by who said it, with a way into each memory.
import { expect, test } from '@playwright/test'
import { open } from './pages'

test('What Conker believes tells what you said from what Conker worked out', async ({ page }) => {
  const errors = await open(page, '/memory')
  await page.getByRole('link', { name: 'What Conker believes' }).click()
  await expect(page).toHaveURL(/\/memory\?view=beliefs/)
  await expect(page.getByText(/\d+ things? you told Conker · \d+ things? Conker worked out/)).toBeVisible()
  await expect(page.getByText('You told Conker this.').first()).toBeVisible()
  await page.getByRole('button', { name: 'Conker worked it out' }).click()
  await expect(page.getByText(/Conker worked this out from/)).toBeVisible()
  await expect(page.getByText('You told Conker this.')).toHaveCount(0)
  await page.getByRole('link', { name: /Open this memory to fix or forget it: .*revision/i }).click()
  await expect(page).toHaveURL(/record=mem_revision/)
  expect(errors).toEqual([])
})
