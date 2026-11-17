// Team runs on the preview gateway: open a run by its id, read where it stands in plain words, run the next
// role only after reading the last answer, end it, and the refusals that matter (daily spending cap off).
// The preview serves one run, id teamrun_ + 32 "a"; sessionStorage['conker-fake-team-run'] picks its state.
import { expect, test, type Page } from '@playwright/test'
import { open } from './pages'

const RUN = `teamrun_${'a'.repeat(32)}`

async function openRun(page: Page, scenario = '') {
  if (scenario) await page.addInitScript(value => sessionStorage.setItem('conker-fake-team-run', value), scenario)
  const errors = await open(page, '/agents?tab=teams')
  await page.getByLabel('Run id').fill(RUN)
  await page.getByRole('button', { name: 'Open run' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  return errors
}

test('team runs: a bad id is refused in words, a good one opens the run', async ({ page }) => {
  const errors = await open(page, '/agents?tab=teams')
  await expect(page.getByRole('heading', { name: 'Team runs' })).toBeVisible()
  await page.getByLabel('Run id').fill('teamrun_nope')
  await page.getByRole('button', { name: 'Open run' }).click()
  await expect(page.getByRole('alert')).toContainText('not a run id')
  await page.getByLabel('Run id').fill(RUN)
  await page.getByRole('button', { name: 'Open run' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Between roles')).toBeVisible()
  await expect(dialog.getByText(/Planner answered\. Read the answer first; Reviewer is next/)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`run=${RUN}`))
  expect(errors).toEqual([])
})

test('team runs: the next role waits for "I read it", runs in the background, then the run is finished', async ({ page }) => {
  const errors = await openRun(page)
  const dialog = page.getByRole('dialog')
  const start = dialog.getByRole('button', { name: 'Run Reviewer' })
  await expect(start).toBeDisabled()
  await dialog.getByRole('checkbox').click()
  await start.click()
  await expect(dialog.getByText('A role is working')).toBeVisible()
  // The page looks again by itself until the role has answered.
  await expect(dialog.getByText('Between roles')).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByText(/That was the last role/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Run Reviewer' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Mark finished' }).click()
  await page.getByRole('dialog', { name: 'Mark this run finished?' }).getByRole('button', { name: 'Mark finished' }).click()
  await expect(dialog.getByText('Finished', { exact: true }).first()).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Mark finished' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('team runs: with the daily spending cap off the run says so and points to where to turn it on', async ({ page }) => {
  const errors = await openRun(page, 'cap-off')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox').click()
  await dialog.getByRole('button', { name: 'Run Reviewer' }).click()
  await expect(dialog.getByRole('alert')).toContainText('daily spending cap is off')
  await expect(dialog.getByRole('link', { name: 'Money and limits' })).toHaveAttribute('href', '/settings?group=money')
  await expect(dialog.getByText('conker spending cap --on')).toBeVisible()
  // Nothing started: the first role is still the only one that ran.
  await expect(dialog.getByText('1 role has run')).toBeVisible()
  expect(errors).toEqual([])
})

test('team runs: a cut-off run can only be cancelled, and cancelling says nothing more will run', async ({ page }) => {
  const errors = await openRun(page, 'interrupted')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Cut off', { exact: true }).first()).toBeVisible()
  await expect(dialog.getByText(/can only be cancelled/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Run / })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Mark finished' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancel run' }).click()
  const confirm = page.getByRole('dialog', { name: 'Cancel this run?' })
  await expect(confirm).toContainText('No further role will run')
  await confirm.getByRole('button', { name: 'Cancel run' }).click()
  await expect(dialog.getByText('Cancelled', { exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('team runs: a run waiting for an approval sends him to the Inbox and offers no new role', async ({ page }) => {
  const errors = await openRun(page, 'held')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Waiting for your approval').first()).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Open the Inbox' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Check again' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Run / })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('team runs: a run opened once is remembered in this browser and listed again', async ({ page }) => {
  await openRun(page)
  await page.keyboard.press('Escape')
  await page.reload()
  await page.locator('main:not([role="status"])').first().waitFor()
  await expect(page.getByRole('button', { name: /^Weekly planning team \d+ role/ })).toBeVisible()
})
