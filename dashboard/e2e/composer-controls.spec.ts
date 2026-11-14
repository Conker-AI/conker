// The composer names the model that will answer and shows what Auto chose, on the bar itself.
import { expect, test } from '@playwright/test'
import { open } from './pages'

test('the composer names the answering model and what Auto chose', async ({ page }) => {
  const errors = await open(page, '/chat')
  const box = page.getByRole('textbox').first()
  await box.fill('Compare these two contracts and tell me which one is riskier for me')
  await expect(page.getByRole('button', { name: /^Mode: Auto · / })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/ · (Local|Claude|OpenRouter|OpenAI)/).first()).toBeVisible()
  await expect(page.getByText('Default model', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
