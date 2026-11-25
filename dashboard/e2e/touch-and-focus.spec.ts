// Touch targets and focus rings, measured in a real browser on the preview gateway.
//  - On a touch screen every control can be tapped from a 44 px square around its middle (WCAG 2.5.5 AAA, and
//    what the app promises). The test taps nothing: it asks the browser which element is under four points of
//    that square, so a reach that a neighbour steals, or one that was never added, fails here.
//  - Keyboard focus is visible on every control the Tab key reaches, in both themes, and the ring colour has 3:1
//    contrast against the page (WCAG 1.4.11).
import { devices, expect, test, type Page } from '@playwright/test'
import { card, open, showAllWaiting } from './pages'

const TOUCH = 44
const PHONE = { viewport: { width: 390, height: 844 }, userAgent: devices['Pixel 7'].userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
// A new chat starts empty so the composer shows every control.
const emptyChat = (page: Page) => page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))

const TARGETS = 'button, a[href], summary, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="radio"], [role="switch"], [role="checkbox"]'

/** Controls whose 44 px square is not wholly theirs (or a descendant's). */
async function smallTargets(page: Page, size: number) {
  return page.evaluate(
    ({ selector, size }) => {
      const found: string[] = []
      const seen = new Set<Element>()
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element)) continue
        seen.add(element)
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const style = getComputedStyle(element)
        if (style.visibility === 'hidden' || style.display === 'none' || element.closest('[aria-hidden="true"], [inert], [hidden]')) continue
        if ((element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true') continue
        // An inline link inside a sentence is exempt (WCAG 2.5.8): only a control on its own line is held to the square.
        if (element.tagName === 'A' && getComputedStyle(element).display === 'inline' && element.parentElement && element.parentElement.textContent !== element.textContent) continue
        const centerX = rect.left + rect.width / 2,
          centerY = rect.top + rect.height / 2
        if (centerX < 0 || centerY < 0 || centerX > innerWidth || centerY > innerHeight) continue
        // Probe the corners of the square, pulled in 2 px; a control already bigger than the square is probed at its own corners.
        const halfWidth = Math.min(size / 2, rect.width / 2) - 2,
          halfHeight = Math.min(size / 2, rect.height / 2) - 2
        let stolen = ''
        const misses = [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].filter(([dx, dy]) => {
          const x = centerX + dx * Math.max(halfWidth, size / 2 - 2),
            y = centerY + dy * Math.max(halfHeight, size / 2 - 2)
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false
          const hit = document.elementFromPoint(x, y)
          const ok = !!hit && (element.contains(hit) || (hit.contains(element) && hit.closest(selector) === element))
          if (!ok && !stolen) stolen = hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 40)}` : 'nothing'
          return !ok
        })
        if (misses.length) {
          const name = element.getAttribute('aria-label') || (element.textContent ?? '').trim().slice(0, 40) || element.tagName
          found.push(`${element.tagName.toLowerCase()} "${name}" ${Math.round(rect.width)}x${Math.round(rect.height)} loses ${misses.length} of 4 corners of its ${size}px square to ${stolen}`)
        }
      }
      return found
    },
    { selector: TARGETS, size },
  )
}

test.describe('touch targets on a phone', () => {
  test.use(PHONE)
  for (const address of ['/chat', '/overview', '/inbox', '/chats', '/memory', '/memory?view=care', '/settings'] as const) {
    test(`every control has a ${TOUCH} px tap area: ${address}`, async ({ page }) => {
      await emptyChat(page)
      const errors = await open(page, address)
      await page.waitForTimeout(800)
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'the phone profile must report a coarse pointer').toBe(true)
      expect(await smallTargets(page, TOUCH), `${address} at 390 px`).toEqual([])
      expect(errors).toEqual([])
    })
  }
})

// Relative luminance and contrast of two sRGB colours written as rgb(...) strings.
const luminance = ([r, g, b]: number[]) =>
  [r, g, b]
    .map(value => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
const contrast = (a: number[], b: number[]) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

for (const theme of ['light', 'dark'] as const)
  test.describe(`keyboard focus, ${theme}`, () => {
    test.use({ colorScheme: theme })
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(value => {
        try {
          localStorage.setItem('vite-ui-theme', value)
        } catch {
          /* Storage may be blocked. */
        }
      }, theme)
    })

    test('the ring colour has 3:1 contrast against the page', async ({ page }) => {
      await open(page, '/overview')
      // The browser reports oklch() and friends as written; a one-pixel canvas turns any colour into sRGB.
      const colours = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        const rgb = (value: string) => {
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = '#000'
          context.fillStyle = value
          context.fillRect(0, 0, 1, 1)
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
        }
        const probe = (value: string) => {
          const node = document.createElement('i')
          node.style.color = value
          document.body.append(node)
          const out = getComputedStyle(node).color
          node.remove()
          return out
        }
        return { ring: rgb(probe('var(--ring)')), page: rgb(getComputedStyle(document.body).backgroundColor), card: rgb(probe('var(--card)')) }
      })
      expect(contrast(colours.ring, colours.page), `ring ${colours.ring} on page ${colours.page}`).toBeGreaterThanOrEqual(3)
      expect(contrast(colours.ring, colours.card), `ring ${colours.ring} on card ${colours.card}`).toBeGreaterThanOrEqual(3)
    })

    for (const address of ['/chat', '/overview', '/inbox'] as const)
      test(`Tab shows where focus is: ${address}`, async ({ page }) => {
        await emptyChat(page)
        const errors = await open(page, address)
        await page.waitForTimeout(800)
        const lost: string[] = []
        for (let step = 0; step < 24; step++) {
          await page.keyboard.press('Tab')
          const state = await page.evaluate(() => {
            const element = document.activeElement
            if (!element || element === document.body) return null
            // A ring is an outline, or a box shadow with spread (ring-*), on the control or on the frame that wraps it.
            const rings = (node: Element) => {
              const style = getComputedStyle(node)
              return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || /\) 0px 0px 0px [1-9]\d*(\.\d+)?px/.test(style.boxShadow)
            }
            let shown = rings(element)
            for (let node: Element | null = element.parentElement, depth = 0; !shown && node && depth < 3; node = node.parentElement, depth++) shown = rings(node)
            const name = element.getAttribute('aria-label') || (element.textContent ?? '').trim().slice(0, 40) || element.tagName
            return { shown, name: `${element.tagName.toLowerCase()} "${name}"` }
          })
          if (state && !state.shown) lost.push(state.name)
        }
        expect(lost, `controls Tab reached with no visible focus on ${address}`).toEqual([])
        expect(errors).toEqual([])
      })
  })

// Dialogs opened and closed with the keyboard alone: focus moves inside, Escape closes, focus goes back.
test.describe('dialogs by keyboard', () => {
  const focusInside = (page: Page, selector: string) => page.evaluate(sel => !!document.activeElement?.closest(sel), selector)

  test('Ctrl+K search: focus lands inside, Escape closes it', async ({ page }) => {
    await open(page, '/overview')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect.poll(() => focusInside(page, '[role="dialog"]')).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('forget confirmation: focus lands inside, Escape closes it and focus returns', async ({ page }) => {
    await open(page, '/memory')
    await page.getByRole('combobox', { name: 'Memory view' }).click()
    await page.getByRole('option', { name: 'List' }).click()
    await page.getByRole('button', { name: 'Select items' }).click()
    await page.getByRole('checkbox', { name: 'Physics worksheet due Fridays', exact: true }).click()
    const forget = page.getByRole('button', { name: 'Forget…' })
    await forget.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Forget 1 memory permanently?' })
    await expect(dialog).toBeVisible()
    await expect.poll(() => focusInside(page, '[role="dialog"]')).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(forget).toBeFocused()
  })

  test('"are you sure" before a send: opens by keyboard, Escape sends nothing and focus returns', async ({ page }) => {
    await open(page, '/inbox')
    await showAllWaiting(page)
    const send = card(page, 'Send an email to coach').getByRole('button', { name: 'Send it', exact: true })
    await send.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect.poll(() => focusInside(page, '[role="alertdialog"]')).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(send).toBeFocused()
  })
})
