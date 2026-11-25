// "A memory you corrected was used", on the preview gateway: the card lists the chats and opens them,
// Dismiss hides it, a failed read is named without hiding the rest of the Inbox.
import { expect, test } from '@playwright/test'
import { open, showAllWaiting } from './pages'

const TITLE = 'A memory you corrected was used in 3 answers in 2 chats'

test('the card lists the chats that used the memory and opens one', async ({ page }) => {
  const errors = await open(page, '/inbox')
  await showAllWaiting(page)
  const card = page.getByRole('article', { name: TITLE })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /See the chats/ }).click()
  await expect(card.getByText(/You corrected a memory\. Those answers were written before that/)).toBeVisible()
  const chats = card.getByRole('list', { name: 'Chats with these answers' })
  await expect(chats.getByRole('listitem')).toHaveCount(2)
  await chats.getByRole('link', { name: 'Open the chat Plan my week' }).click()
  await expect(page).toHaveURL(/\/chat\?session=ses_1{16}/)
  expect(errors).toEqual([])
})

test('Dismiss hides the card and the count follows', async ({ page }) => {
  const errors = await open(page, '/inbox')
  await expect(page.getByText(/\d+ needs? you/).first()).toBeVisible()
  await showAllWaiting(page)
  await page.getByRole('button', { name: `Dismiss: ${TITLE}` }).click()
  await expect(page.getByRole('article', { name: TITLE })).toBeHidden()
  await page.reload()
  await page.locator('main:not([role="status"])').first().waitFor()
  await showAllWaiting(page)
  await expect(page.getByRole('article', { name: TITLE })).toBeVisible() // the preview forgets the tab's own dismissal on reload
  expect(errors).toEqual([])
})

test('a forgotten memory says so and a chat without a name is still openable', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-recall=forgotten')
  await showAllWaiting(page)
  const card = page.getByRole('article', { name: 'A memory you forgot was used in 1 answer in 1 chat' })
  await card.getByRole('button', { name: /See the chats/ }).click()
  await expect(card.getByText(/You told Conker to forget a memory/)).toBeVisible()
  await expect(card.getByRole('link', { name: 'Open the chat Untitled chat' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a failed read is named and the rest of the Inbox still works', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-recall=failing')
  await expect(page.getByText('Memory notices didn’t load')).toBeVisible()
  await expect(page.getByRole('article', { name: TITLE })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  expect(errors.filter(message => !/Failed to load resource/.test(message))).toEqual([])
})

test('nothing to tell shows no card', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-recall=none')
  await expect(page.getByRole('article', { name: TITLE })).toHaveCount(0)
  expect(errors).toEqual([])
})
