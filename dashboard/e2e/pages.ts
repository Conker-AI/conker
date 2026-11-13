import type { Page } from '@playwright/test'

/** Opens an address and waits for the app's own main (the boot screen is a main marked as a status). */
export async function open(page: Page, address: string) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(address)
  await page.locator('main:not([role="status"])').first().waitFor()
  return errors
}

/** An Inbox card's answer buttons sit next to its "Later" button. */
export function card(page: Page, title: string) {
  return page.getByRole('button', { name: `Later: ${title}` }).locator('xpath=..')
}
