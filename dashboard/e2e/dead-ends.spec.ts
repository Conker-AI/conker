// Dead ends from the owner's worst-day sweep: a held update, an answer that failed, a failed AI job.
// Each must say what happened in plain words and offer the one way forward, on the preview gateway.
import { expect, test } from '@playwright/test'
import { open } from './pages'

const CHAT = '/chat?session=ses_1111111111111111'
const ANSWER = /Here's a simple plan for the week:|sunlight scatters off air molecules|I'll draft it first so you can check it/

test('update: a held update says what to do, and Update is switched off', async ({ page }) => {
  const errors = await open(page, '/inbox?preview-updates=held')
  const held = page.getByRole('article', { name: /^Update to 0\.1\.1 stopped/ })
  await expect(held).toBeVisible()
  await expect(held.getByText(/starts no new update until you clear this hold/)).toBeVisible()
  await expect(held.getByText('conker status', { exact: true })).toBeVisible()
  await expect(held.getByText(/Restore the backup Conker took just before the update/)).toBeVisible()
  await expect(held.getByRole('link', { name: /When an update is held/ })).toHaveAttribute('href', /docs\/reference\/server-care\.md#when-an-update-is-held$/)
  await expect(page.getByText(/Server > Backups/)).toBeHidden()

  // The offer stays listed, below the held card, with no Update button anywhere.
  const offer = page.getByRole('article', { name: 'Update available: 0.2.0' })
  await expect(offer).toBeVisible()
  expect((await held.boundingBox())!.y).toBeLessThan((await offer.boundingBox())!.y)
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeHidden()
  await offer.getByRole('button', { name: /^Update available/ }).click()
  await expect(offer.getByText(/Update is switched off for now/)).toBeVisible()
  await expect(offer.getByRole('button', { name: /^Update to/ })).toHaveCount(0)
  await expect(offer.getByRole('button', { name: 'Skip this version', exact: true })).toBeVisible()

  // Hiding the card does not clear the hold; it says so, and only then does Update come back.
  await expect(held.getByText('Hiding this card does not clear the hold.')).toBeVisible()
  await page.getByRole('button', { name: /^Hide for now: / }).click()
  await expect(held).toBeHidden()
  await expect(offer.getByRole('button', { name: 'Update to 0.2.0' })).toBeVisible()
  expect(errors).toEqual([])
})

for (const [scenario, cause] of [['turn-failed-cap', /Today’s spending limit is reached, so paid models are paused until tomorrow/], ['turn-failed-plain', /The model did not send back an answer\. It may be offline or overloaded\./]] as const) {
  test(`chat: a failed answer says why (${scenario}) and Try again sends the same message`, async ({ page }) => {
    await page.addInitScript(name => { sessionStorage.setItem('conker-fake-fail', name); sessionStorage.setItem('conker-fake-resume', 'empty') }, scenario)
    const errors = await open(page, CHAT)
    const failure = page.getByRole('region', { name: 'Conker couldn’t finish the reply' })
    await expect(failure.getByText(cause)).toBeVisible()
    await expect(failure.getByText('Nothing ran for this message. It is kept in this chat.')).toBeVisible()
    await expect(failure.getByText(/conker spending/)).toHaveCount(0)
    await expect(page.getByText(/Check the saved outcome/)).toBeHidden()

    const tryAgain = failure.getByRole('button', { name: 'Try again' })
    await expect(tryAgain).toBeEnabled()
    await tryAgain.click()
    await expect(page.getByText(ANSWER).first()).toBeVisible()
    await expect(failure).toBeHidden()
    // The same words went out again: the message is in the chat twice, the failed one and the retry.
    await expect(page.getByText('Help me plan this week around school and judo.')).toHaveCount(2)
    expect(errors).toEqual([])
  })
}

test('chat: an interrupted answer that ran nothing can be tried again', async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem('conker-fake-fail', 'turn-interrupted'); sessionStorage.setItem('conker-fake-resume', 'empty') })
  const errors = await open(page, CHAT)
  const stopped = page.getByRole('region', { name: 'This turn was interrupted' })
  await expect(stopped.getByText(/Nothing ran\. Try again to get the answer\./)).toBeVisible()
  await stopped.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText(ANSWER).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('chat: Try again is not offered once an action ran', async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem('conker-fake-fail', 'turn-interrupted-acted'); sessionStorage.setItem('conker-fake-resume', 'empty') })
  const errors = await open(page, CHAT)
  await expect(page.getByRole('region', { name: 'This turn was interrupted' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('jobs: a failed AI job shows why at the top of its page and can be run again', async ({ page }) => {
  const errors = await open(page, '/jobs?preview-jobs=failed')
  await page.getByText('Morning news digest').first().click()
  const failed = page.getByRole('alert').filter({ hasText: 'The last run failed' })
  await expect(failed).toBeVisible()
  await expect(failed.getByText(/The job started but did not finish\./)).toBeVisible()
  // The history names each reason in words, never the raw code.
  await expect(page.getByText(/Your limits for what Conker may do on its own held this run back\./)).toBeVisible()
  await expect(page.getByText('HELD_BACK')).toHaveCount(0)

  await failed.getByRole('button', { name: 'Try again now' }).click()
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Run now' }).click()
  await expect(page.getByText(/Run queued/)).toBeVisible()
  await expect(failed).toBeHidden()
  expect(errors).toEqual([])
})
