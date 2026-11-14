// Memory care on the preview gateway: the groups Pi's upkeep read returns, in plain words, and a way into the memory.
import { expect, test } from '@playwright/test'
import { open } from './pages'

test('Memory care lists what is worth tidying and opens the memory to fix or forget it', async ({ page }) => {
  const errors = await open(page, '/memory')
  await page.getByRole('link', { name: 'Memory care' }).click()
  await expect(page).toHaveURL(/\/memory\?view=care/)
  await expect(page.getByRole('heading', { name: 'Memories that disagree' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Past their date' })).toBeVisible()
  await expect(page.getByText(/Checked \d+ memories/)).toBeVisible()
  await page.getByRole('link', { name: /Open this memory to fix or forget it: .*physics/i }).first().click()
  await expect(page).toHaveURL(/record=mem_physics/)
  expect(errors).toEqual([])
})
