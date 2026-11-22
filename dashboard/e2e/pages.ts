import type { Page } from '@playwright/test'
import { gatewayDestinations, gatewayPageNavigation } from '../src/components/gateway/navigation'

/** Opens an address and waits for the app's own main (the boot screen is a main marked as a status). */
export async function open(page: Page, address: string) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(address)
  await page.locator('main:not([role="status"])').first().waitFor()
  // The dev server loads modules on first use; a key pressed before it settles can be lost.
  await page.waitForLoadState('networkidle')
  return errors
}

/** An Inbox card's answer buttons sit next to its "Later" button. */
export function card(page: Page, title: string) {
  return page.getByRole('button', { name: `Later: ${title}` }).locator('xpath=..')
}

// Screens reached from a link on another page are listed by hand.
const linked = ['/memory?view=care', '/memory?view=beliefs', '/chat?session=ses_1111111111111111']
/** Every place and tab in the navigation table, plus the linked screens. */
export const allPlaces = [
  ...new Set([
    ...linked,
    ...gatewayDestinations.flatMap(item => {
      const path = item.path.split('?')[0]
      return [path, ...gatewayPageNavigation(path, '').sections.map(section => section.to)]
    }),
  ]),
]
