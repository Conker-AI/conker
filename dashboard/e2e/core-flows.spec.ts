// The owner's core flows, clicked through in a browser against the preview gateway: send a chat
// message and read the answer, approve requests at levels 1 and 2, and forget a memory.
import { expect, test } from '@playwright/test'
import { card, open } from './pages'

test('chat: a sent message shows in the chat, then the answer', async ({ page }) => {
  // No saved draft: one that loads after typing is a conflict the app reports, not this flow.
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const composer = page.getByRole('textbox', { name: /Ask Conker anything|Message Conker/ })
  await composer.fill('What should I plan for this week?')
  await composer.press('Enter')

  await expect(page).toHaveURL(/[?&]session=/)
  await expect(page.getByText('What should I plan for this week?').first()).toBeVisible()
  // The preview answers with one of its canned replies, picked at random.
  await expect(page.getByText(/Here's a simple plan for the week:|sunlight scatters off air molecules|I'll draft it first so you can check it/).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('approval: a one-tap request runs and counts as decided', async ({ page }) => {
  const errors = await open(page, '/inbox')
  await expect(page.getByText(/^\d+ need you · 0 decided today$/)).toBeVisible()
  await expect(page.getByText('Read next week’s calendar')).toBeVisible()

  await card(page, 'Read next week’s calendar').getByRole('button', { name: 'Do it', exact: true }).click()

  await expect(page.getByText('Approved “Read next week’s calendar”', { exact: false })).toBeVisible()
  await expect(page.getByText(/· 1 decided today$/)).toBeVisible()
  expect(errors).toEqual([])
})

test('approval: sending asks "are you sure" first, and Cancel sends nothing', async ({ page }) => {
  const errors = await open(page, '/inbox')
  const sendButton = card(page, 'Send an email to coach').getByRole('button', { name: 'Send it', exact: true })

  await sendButton.click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByText(/· 0 decided today$/)).toBeVisible()

  await sendButton.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Send it' }).click()
  await expect(page.getByText('Approved “Send an email to coach”', { exact: false })).toBeVisible()
  await expect(page.getByText(/· 1 decided today$/)).toBeVisible()
  expect(errors).toEqual([])
})

test('forget: a memory is shown before it goes, Cancel keeps it, Forget permanently removes it', async ({ page }) => {
  const errors = await open(page, '/memory')
  await page.getByRole('combobox', { name: 'Memory view' }).click()
  await page.getByRole('option', { name: 'List' }).click()
  const library = page.getByRole('main')
  await expect(library.getByText('Physics worksheet due Fridays')).toBeVisible()

  await page.getByRole('button', { name: 'Select items' }).click()
  await page.getByRole('checkbox', { name: 'Physics worksheet due Fridays', exact: true }).click()
  await expect(page.getByText('1 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Forget…' }).click()
  // The dialog shows the exact memory text that will go, before anything is forgotten.
  const confirm = page.getByRole('dialog', { name: 'Forget 1 memory permanently?' })
  await expect(confirm.getByText('The weekly physics worksheet is handed in every Friday.')).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  await expect(library.getByText('Physics worksheet due Fridays')).toBeVisible()

  await page.getByRole('button', { name: 'Forget…' }).click()
  await confirm.getByRole('button', { name: 'Forget permanently' }).click()
  await expect(page.getByText('Forgot 1 memory')).toBeVisible()
  await expect(library.getByText('Physics worksheet due Fridays')).toHaveCount(0)
  await expect(library.getByText('Trains judo on Tuesdays and Thursdays')).toBeVisible()
  expect(errors).toEqual([])
})
