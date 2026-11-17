// An agent carries up to three skills; the picker lists enabled skills and a save keeps the choice.
import { expect, test } from '@playwright/test'
import { open } from './pages'

test('An agent keeps the skills ticked in its editor', async ({ page }) => {
  const errors = await open(page, '/agents')
  await page.getByRole('link', { name: /Research partner/ }).first().click()
  const skills = page.getByRole('group', { name: 'Skills' })
  await expect(skills.getByText('Meeting notes')).toBeVisible()
  await expect(skills.getByText('Budget check')).toHaveCount(0)
  await skills.getByRole('checkbox', { name: /Meeting notes/ }).click()
  await skills.getByRole('checkbox', { name: /Exam planner/ }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Version 2').first()).toBeVisible()
  await page.getByRole('link', { name: /Research partner/ }).first().click()
  await expect(page.getByRole('group', { name: 'Skills' }).getByRole('checkbox', { name: /Meeting notes/ })).toBeChecked()
  await expect(page.getByRole('group', { name: 'Skills' }).getByRole('checkbox', { name: /Reading digest/ })).not.toBeChecked()
  expect(errors).toEqual([])
})
