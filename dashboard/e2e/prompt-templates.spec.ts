// Prompt templates on the preview gateway: the wand fills one of his templates from an unsent draft
// (never sending it), and the Prompt templates screen lists, makes, changes and deletes them.
import { expect, test, type Page } from '@playwright/test'
import { open } from './pages'

const SCREEN = '/agents?tab=templates'
const row = (page: Page, name: string) => page.getByRole('button', { name: `More actions for ${name}` })

test('the wand fills a template from the draft, says what is empty, never sends, and Undo brings the draft back', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const box = page.getByRole('textbox').first()
  const draft = 'Best laptop for travel, Table please'
  await box.fill(draft)
  await page.getByRole('button', { name: 'Improve my prompt' }).click()
  await expect(page.getByRole('button', { name: /^Just rewrite it/ })).toBeVisible()
  await page.getByRole('button', { name: /^Research/ }).click()
  await expect(page.getByText('Filled in Research')).toBeVisible()
  await expect(page.getByText('Filled in from your draft: Subject, Output.')).toBeVisible()
  await expect(page.getByText("Left blank: Do, Don't, Context.")).toBeVisible()
  await expect(page.getByText(/^Nothing was sent\./)).toBeVisible()
  await expect(box).toHaveValue(/^Research request\n\nSubject:\nBest laptop for travel/)
  await page.getByText('Show original').click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(box).toHaveValue(draft)
  expect(errors).toEqual([])
})

test('the screen lists the four starters', async ({ page }) => {
  const errors = await open(page, SCREEN)
  await expect(page.getByRole('heading', { name: 'Prompt templates' })).toBeVisible()
  for (const name of ['Research', 'Bug report', 'Plan', 'Email']) await expect(row(page, name)).toBeVisible()
  await page.getByRole('button', { name: /^Mine/ }).click()
  await expect(page.getByText('Nothing here')).toBeVisible()
  expect(errors).toEqual([])
})

test('make, change and delete a template', async ({ page }) => {
  const errors = await open(page, SCREEN)
  await page.getByRole('button', { name: 'New template' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Trip plan')
  await dialog.getByLabel('Label').fill('Where to')
  await dialog.getByRole('button', { name: 'Add a field' }).click()
  await dialog.getByLabel('Label').nth(1).fill('Dates')
  await dialog.getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText('Saved Trip plan.')).toBeVisible()
  await expect(row(page, 'Trip plan')).toBeVisible()

  await row(page, 'Trip plan').click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog')
  await edit.getByLabel('Name', { exact: true }).fill('Trip planner')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(row(page, 'Trip planner')).toBeVisible()

  await row(page, 'Trip planner').click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete template' }).click()
  await expect(row(page, 'Trip planner')).toBeHidden()
  expect(errors).toEqual([])
})

test('a template needs a name and a label, and says what to fix', async ({ page }) => {
  const errors = await open(page, SCREEN)
  await page.getByRole('button', { name: 'New template' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Label').fill('')
  await dialog.getByRole('button', { name: 'Save template' }).click()
  await expect(dialog.getByText('Give the template a name.')).toBeVisible()
  await expect(dialog.getByText(/needs a label/)).toBeVisible()
  expect(errors).toEqual([])
})

test('a stale change is refused in plain words, the edits stay, and Keep my edits saves over it', async ({ page }) => {
  const errors = await open(page, SCREEN)
  await row(page, 'Plan').click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Plan it')
  await page.evaluate(() => sessionStorage.setItem('conker-fake-fail', 'template-stale'))
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog.getByText(/This template changed somewhere else, so nothing was saved\./)).toBeVisible()
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Plan it')
  await dialog.getByRole('button', { name: 'Keep my edits' }).click()
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(row(page, 'Plan it')).toBeVisible()
  expect(errors).toEqual([])
})

test('a starter is deleted after a warning, and does not come back', async ({ page }) => {
  const errors = await open(page, SCREEN)
  await row(page, 'Email').click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByText('This starter will not come back.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete template' }).click()
  await expect(row(page, 'Email')).toBeHidden()
  expect(errors).toEqual([])
})
