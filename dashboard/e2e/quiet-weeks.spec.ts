// "Is Conker getting quieter?" on the Inbox, on the preview gateway: one line, the weeks underneath,
// an older server named plainly, a failed read retried. Every number comes from the preview's weekly counts.
import { expect, test } from '@playwright/test'
import { open } from './pages'

const LINE = 'Last full week: 10 asks, 83% useful (the week before: 11 asks, 67% useful)'

test('one line compares the last two full weeks; opening it lists the weeks, this one marked', async ({ page }) => {
  const errors = await open(page, '/inbox')
  const line = page.getByRole('button', { name: LINE })
  await expect(line).toBeVisible()
  await expect(line).toHaveAttribute('aria-expanded', 'false')
  await line.click()
  const weeks = page.getByRole('list', { name: 'Asks per week' }).getByRole('listitem')
  await expect(weeks).toHaveCount(8)
  await expect(weeks.first()).toContainText('This week, so far')
  await expect(weeks.nth(1)).toContainText('10 asks · 83% useful')
  expect(errors).toEqual([])
})

test('an older server says the counts come with the next update, without an error', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-quiet=unsupported')
  await page.getByRole('button', { name: 'Asks per week: needs the next Conker update' }).click()
  await expect(page.getByText(/These counts appear after the next update/)).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Asks per week' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('no full week with asks yet says so', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-quiet=empty')
  await expect(page.getByRole('button', { name: 'Asks per week: not enough weeks yet' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a failed read is named and offers Try again', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-quiet=failing')
  await page.getByRole('button', { name: 'Asks per week didn’t load' }).click()
  const alert = page.getByRole('alert').filter({ hasText: 'Asks per week didn’t load' })
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(errors).toEqual([])
})
