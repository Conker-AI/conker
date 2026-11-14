// The composer names the model that will answer and shows what Auto chose, on the bar itself.
import { expect, test } from '@playwright/test'
import { open } from './pages'

test('the composer names the answering model and what Auto chose', async ({ page }) => {
  // No saved draft: the preview's draft loading after typing is a conflict the app reports, not this flow.
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const box = page.getByRole('textbox').first()
  await box.fill('Compare these two contracts and tell me which one is riskier for me')
  await expect(page.getByRole('button', { name: /^Mode: Auto · / })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/ · (Local|Claude|OpenRouter|OpenAI)/).first()).toBeVisible()
  await expect(page.getByText('Default model', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the wand rewrites the draft without sending it, and Undo brings the original back', async ({ page }) => {
  // No saved draft: the preview's draft loading after typing is a conflict the app reports, not this flow.
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const box = page.getByRole('textbox').first()
  const draft = 'plan my week around judo and school'
  await box.fill(draft)
  await page.getByRole('button', { name: 'Improve my prompt' }).click()
  await expect(page.getByText('Prompt improved')).toBeVisible()
  await expect(box).toHaveValue(/^Goal: plan my week/)
  await expect(page.getByText('changed in another tab')).toHaveCount(0)
  await page.getByText('Show original').click()
  await expect(page.getByText(draft, { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(box).toHaveValue(draft)
  expect(errors).toEqual([])
})
