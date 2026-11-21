// The composer names the model that will answer and shows what Auto chose, on the bar itself.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { open } from './pages'

const modelButton = (page: Page) => page.getByRole('button', { name: /^Answer model: / })
const openEffort = async (page: Page) => {
  await modelButton(page).click()
  await page.getByRole('menuitem', { name: /^Effort/ }).click()
}

test('the composer names the answering model and what Auto chose', async ({ page }) => {
  // No saved draft: the preview's draft loading after typing is a conflict the app reports, not this flow.
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const box = page.getByRole('textbox').first()
  await box.fill('Compare these two contracts and tell me which one is riskier for me')
  await expect(page.getByRole('button', { name: /^Mode: Auto · / })).toBeVisible({ timeout: 10_000 })
  // The button names the model alone: no provider, no plan name.
  await expect(modelButton(page)).toHaveAccessibleName('Answer model: Sonnet 5.5, High effort')
  await expect(page.getByText(/Claude Code subscription/)).toHaveCount(0)
  await expect(page.getByText('Default model', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the wand rewrites the draft without sending it, and Undo brings the original back', async ({ page }) => {
  // No saved draft: the preview's draft loading after typing is a conflict the app reports, not this flow.
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const box = page.getByRole('textbox').first()
  const draft = 'plan my week around judo and school'
  await box.fill(draft)
  await page.getByRole('button', { name: 'Improve my prompt' }).click()
  await page.getByRole('button', { name: /^Just rewrite it/ }).click()
  await expect(page.getByText('Prompt improved')).toBeVisible()
  await expect(box).toHaveValue(/^Goal: plan my week/)
  await expect(page.getByText('changed in another tab')).toHaveCount(0)
  await page.getByText('Show original').click()
  await expect(page.getByText(draft, { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(box).toHaveValue(draft)
  expect(errors).toEqual([])
})

test('the model menu lists the Claude models with their numbers, a tick on the current one, Effort and More models', async ({ page }) => {
  const errors = await open(page, '/chat?session=ses_1111111111111111')
  await modelButton(page).click()
  const rows = page.getByRole('menuitemradio')
  await expect(rows).toHaveText([/^Opus 5\.51$/, /^Fable 5\.22$/, /^Sonnet 5\.5/, /^Haiku 5\.54$/])
  await expect(page.getByRole('menuitemradio', { name: 'Sonnet 5.5' })).toBeChecked()
  await expect(page.getByRole('menuitem', { name: /^Effort/ })).toBeVisible()
  await page.getByRole('menuitem', { name: 'More models' }).click()
  for (const name of ['Fable 5.1', 'Haiku 4.5', 'Sonnet 5', 'Opus 5', 'Fable 5', 'Opus 4.8', 'Opus 4.7', 'Opus 4.6', 'Sonnet 4.6', 'Qwen 2.5 3B', 'Qwen 3 4B']) await expect(page.getByRole('menuitemradio', { name, exact: true })).toBeVisible()
  // The provider joins no row, and no Effort chip stands in the toolbar.
  await expect(page.getByRole('menuitemradio', { name: /Claude Code subscription/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Effort/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the number keys choose a model and the button names it', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  await modelButton(page).click()
  await expect(page.getByRole('menuitemradio').first()).toBeVisible()
  await page.keyboard.press('1')
  await expect(modelButton(page)).toHaveAccessibleName('Answer model: Opus 5.5')
  await modelButton(page).click()
  await expect(page.getByRole('menuitemradio', { name: 'Opus 5.5' })).toBeChecked()
  await page.keyboard.press('4')
  await expect(modelButton(page)).toHaveAccessibleName('Answer model: Haiku 5.5')
  expect(errors).toEqual([])
})

test('Effort is a submenu of the model button: it is set there, shown beside the model and says when a model ignores it', async ({ page }) => {
  const errors = await open(page, '/chat?session=ses_1111111111111111')
  await openEffort(page)
  await expect(page.getByText('Higher effort means more thorough responses, but takes longer and uses your limits faster.')).toBeVisible()
  await expect(page.getByText('Not used by 1 of the 2 models that may answer.')).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: /^(Auto|Light|Medium|High|Max)$/ })).toHaveText(['Auto', 'Light', 'Medium', 'High', 'Max'])
  await page.getByRole('menuitemradio', { name: 'High' }).click()
  await expect(modelButton(page)).toHaveAccessibleName('Answer model: Sonnet 5.5, High effort')
  await expect(modelButton(page)).toContainText('Sonnet 5.5High')
  // It was saved with the chat: the menu shows it again after reopening.
  await openEffort(page)
  await expect(page.getByRole('menuitemradio', { name: 'High' })).toBeChecked()
  expect(errors).toEqual([])
})

test('a new chat has voice and video call buttons in the toolbar, disabled, with the reason as their tooltip', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  const voice = page.getByRole('button', { name: /^Voice call/ }), video = page.getByRole('button', { name: /^Video call/ })
  await expect(voice).toBeVisible()
  await expect(voice).toHaveAttribute('aria-disabled', 'true')
  await expect(voice).toHaveAttribute('title', 'Send a message first, then call from the chat header')
  await expect(video).toHaveAttribute('aria-disabled', 'true')
  await expect(video).toHaveAttribute('title', 'Video calls are not connected yet')
  // No explanatory lines: the words live in the tooltips.
  await expect(page.getByText(/Voice call: send a message first|Video calls are not connected yet/)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the Thinking chip shows what Auto chose and why, a changed chip shows Custom, and Back to Auto restores them', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  await page.getByRole('textbox').first().fill('Compare these two contracts and tell me which one is riskier for me')
  await expect(page.getByRole('button', { name: /^Mode: Auto · / })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Think first: On (auto)' }).click()
  await expect(page.getByText('Auto chose this:')).toBeVisible()
  await page.keyboard.press('Escape')
  // The old Mode popover held Think, Complexity and Research switches; it now holds the presets only.
  await page.getByRole('button', { name: /^Mode: / }).click()
  await expect(page.getByRole('radio', { name: /Fast/ })).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('radio', { name: 'Web' }).click()
  await expect(page.getByRole('button', { name: /^Mode: Custom/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search: Web' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Auto' }).click()
  await expect(page.getByRole('button', { name: /^Mode: Auto · / })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('a mode asks Conker to decide the settings from the message', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  await page.getByRole('button', { name: /^Mode: / }).click()
  await page.getByRole('radio', { name: /Deep/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('textbox').first().fill('Compare these two contracts and tell me which one is riskier for me')
  await expect(page.getByRole('button', { name: /^Mode: Deep · / })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /^Difficulty/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Effort can be chosen before the chat exists and is saved with it', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
  const errors = await open(page, '/chat')
  await openEffort(page)
  await expect(page.getByText('It is saved with the chat when it starts.')).toBeVisible()
  await page.getByRole('menuitemradio', { name: 'High' }).click()
  await expect(modelButton(page)).toHaveAccessibleName('Answer model: Sonnet 5.5, High effort')
  await page.getByRole('textbox').first().fill('plan my week around judo and school')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(modelButton(page)).toHaveAccessibleName('Answer model: Sonnet 5.5, High effort', { timeout: 10_000 })
  expect(errors).toEqual([])
})

for (const width of [320, 390]) {
  test(`on a ${width} px phone the model button shows its label, the call buttons stand in the toolbar and the menu rows are 44 px tall`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.addInitScript(() => sessionStorage.setItem('conker-fake-resume', 'empty'))
    const errors = await open(page, '/chat')
    await expect(modelButton(page)).toHaveAccessibleName('Answer model: Sonnet 5.5')
    await expect(modelButton(page)).toContainText('Sonnet 5.5')
    // The call buttons are real toolbar buttons, not folded into More options, at the smallest width too.
    await expect(page.getByRole('button', { name: /^Voice call/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Video call/ })).toBeVisible()
    // On touch, a toolbar button's tap area is 44 px: the point 4 px above a 32 px button still lands on it.
    const reachable = await page.getByRole('button', { name: /^Voice call/ }).evaluate(button => { const box = button.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y - 4)?.closest('button') === button })
    expect(reachable).toBe(true)
    const heightsOf = (role: 'menuitem' | 'menuitemradio') => page.getByRole(role).evaluateAll(rows => rows.map(row => Math.round(row.getBoundingClientRect().height)))
    await modelButton(page).click()
    await expect(page.getByRole('menuitemradio').nth(3)).toBeVisible()
    const models = await heightsOf('menuitemradio'), submenus = await heightsOf('menuitem')
    expect(models).toHaveLength(4)
    expect(submenus).toHaveLength(2)
    await page.getByRole('menuitem', { name: /^Effort/ }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Max' })).toBeVisible()
    const efforts = (await heightsOf('menuitemradio')).slice(-5)
    expect(efforts).toHaveLength(5)
    for (const height of [...models, ...submenus, ...efforts]) expect(height).toBeGreaterThanOrEqual(44)
    expect(errors).toEqual([])
    await context.close()
  })
}
