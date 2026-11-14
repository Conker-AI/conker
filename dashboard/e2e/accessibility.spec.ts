// axe (WCAG 2.1 A and AA rules) over every sidebar place in both themes and the main dialogs, on the preview
// gateway. A violation fails the test and names the rule and the elements it found.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { card, open } from './pages'

const PLACES = ['/overview', '/inbox', '/chats', '/projects', '/memory', '/agents', '/tools', '/jobs', '/system', '/settings', '/chat', '/activity', '/artifacts', '/setup', '/memory?view=care']

async function violations(page: Page, include?: string) {
  // Skeletons mark themselves busy; check the loaded screen, not the placeholder.
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 }).catch(() => {})
  // Then until the page stops changing for half a second (at most 10 s): a control can be
  // disabled while its data loads, and axe should see the screen the owner uses.
  await page.evaluate(() => new Promise<void>(resolve => {
    const finish = () => { observer.disconnect(); clearTimeout(cap); resolve() }
    let quiet = setTimeout(finish, 500)
    const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(finish, 500) })
    const cap = setTimeout(finish, 10_000)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  }))
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  const { violations } = await (include ? builder.include(include) : builder).analyze()
  const found: string[] = []
  for (const rule of violations) {
    const nodes = []
    for (const node of rule.nodes) {
      // WCAG 1.4.3 exempts inactive controls; axe misses a disabled trigger around the text it checks.
      if (rule.id === 'color-contrast' && await page.locator(node.target.join(' ')).first().evaluate(element => !!element.closest(':disabled, [data-disabled], [aria-disabled="true"]'))) continue
      nodes.push(node.target.join(' '))
    }
    if (nodes.length) found.push(`${rule.id} (${rule.impact}): ${nodes.slice(0, 4).join(' | ')}`)
  }
  return found
}

for (const theme of ['light', 'dark'] as const) test.describe(theme, () => {
  test.use({ colorScheme: theme })
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(value => { try { localStorage.setItem('vite-ui-theme', value) } catch { /* Storage may be blocked. */ } }, theme)
  })
  for (const place of PLACES) {
    test(`axe: ${place}`, async ({ page }) => {
      const errors = await open(page, place)
      expect(await violations(page)).toEqual([])
      expect(errors).toEqual([])
    })
  }

  test('axe: Ctrl+K search', async ({ page }) => {
    await open(page, '/overview')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await violations(page, '[role="dialog"]')).toEqual([])
  })

  test('axe: "are you sure" before a send', async ({ page }) => {
    await open(page, '/inbox')
    await card(page, 'Send an email to coach').getByRole('button', { name: 'Send it', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    expect(await violations(page, '[role="alertdialog"]')).toEqual([])
  })

  test('axe: forget confirmation', async ({ page }) => {
    await open(page, '/memory')
    await page.getByRole('combobox', { name: 'Memory view' }).click()
    await page.getByRole('option', { name: 'List' }).click()
    await page.getByRole('button', { name: 'Select items' }).click()
    await page.getByRole('checkbox', { name: 'Physics worksheet due Fridays', exact: true }).click()
    await page.getByRole('button', { name: 'Forget…' }).click()
    await expect(page.getByRole('dialog', { name: 'Forget 1 memory permanently?' })).toBeVisible()
    expect(await violations(page, '[role="dialog"]')).toEqual([])
  })
})
