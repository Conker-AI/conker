import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { isPlanned, PLANNED_COUNT, plannedShown, PLANNED_REASON } from '@/settings/planned'
import { PlannedNote } from '@/settings/planned-note'
import { ALL_SETTINGS, SETTINGS_BY_ID } from '@/settings/registry'
import { SettingsScreen } from '@/settings/settings-screen'

const KEY = 'conker.settings-view.planned'
/** A planned basic setting in Appearance, and a live one beside it. */
const PLANNED = SETTINGS_BY_ID.get('appearance.contrast')!
const LIVE = SETTINGS_BY_ID.get('appearance.accent')!

/** The documents each Settings home answers with; anything else the blocks ask for stays pending. */
const DOCUMENTS: Record<string, unknown> = {
  'settings.read': { revision: 1, values: {} },
  'settings.preferences': { revision: 1, preferences: {} },
  'search.settings': { revision: 1, configuration: {} },
  'settings.tools': { revision: 1, settings: {} },
  'settings.lockdown': { lockdown: false },
}

function fakeClient(path: string[] = []): GatewayControlClient {
  const call = () => (path.join('.') in DOCUMENTS ? Promise.resolve(DOCUMENTS[path.join('.')]) : new Promise(() => {}))
  return new Proxy(call, {
    get: (_target, name) => (typeof name === 'string' && name !== 'then' ? fakeClient([...path, name]) : undefined),
  }) as unknown as GatewayControlClient
}

function openSettings(address: string) {
  render(
    <MemoryRouter initialEntries={[address]}>
      <SettingsScreen client={fakeClient()} authStore={{} as GatewayAuthStore} />
    </MemoryRouter>,
  )
}

/** getByRole walks the whole accessibility tree, which is slow on a screen this size; text is fast. */
const button = (text: string) => screen.getByText(text, { selector: 'button' })
const SLOW = { timeout: 15_000 }

const appearancePlanned = ALL_SETTINGS.filter(setting => setting.group === 'appearance' && isPlanned(setting) && setting.tier === 'basic').length

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('planned settings on the Settings screen', { timeout: 60_000 }, () => {
  it('are hidden by default, with a switch that says how many', async () => {
    openSettings('/settings?group=appearance')
    expect(await screen.findByText(LIVE.title, {}, SLOW)).not.toBeNull()
    expect(screen.queryByText(PLANNED.title)).toBeNull()
    expect(screen.queryByText('Planned', { selector: '[data-slot="badge"]' })).toBeNull()
    expect(screen.getByText(new RegExp(`^${appearancePlanned} planned settings are hidden here`))).not.toBeNull()
    expect(button(`Show planned (${appearancePlanned})`).getAttribute('aria-pressed')).toBe('false')
    const chip = within(screen.getByLabelText('Filter settings')).getByRole('button', { name: `Planned${PLANNED_COUNT}` })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
  })

  it('show labelled "Planned", greyed out with the reason, once the switch is on, and the choice is remembered', async () => {
    openSettings('/settings?group=appearance')
    fireEvent.click(await screen.findByText(`Show planned (${appearancePlanned})`, { selector: 'button' }, SLOW))
    const row = document.getElementById(`setting-${PLANNED.id}`)!
    expect(within(row).getByText(PLANNED.title)).not.toBeNull()
    expect(within(row).getByText('Planned')).not.toBeNull()
    expect(within(row).getByText(PLANNED_REASON)).not.toBeNull()
    expect(within(row).getByRole('switch').hasAttribute('disabled') || within(row).getByRole('switch').getAttribute('aria-disabled') === 'true').toBe(true)
    expect(button('Hide planned').getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem(KEY)).toBe('true')
    expect(plannedShown()).toBe(true)
    // A live row is untouched: no label, no reason.
    const live = document.getElementById(`setting-${LIVE.id}`)!
    expect(within(live).queryByText('Planned')).toBeNull()
    expect(within(live).queryByText(PLANNED_REASON)).toBeNull()

    fireEvent.click(button('Hide planned'))
    await waitFor(() => expect(screen.queryByText(PLANNED.title)).toBeNull())
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('stay out of settings search until the switch is on', async () => {
    openSettings('/settings')
    fireEvent.change(await screen.findByLabelText('Search settings', {}, SLOW), { target: { value: PLANNED.title } })
    expect(screen.queryByText(PLANNED.title, { selector: 'label' })).toBeNull()
    expect(screen.getByText(/planned setting(s)? also match/)).not.toBeNull()
    fireEvent.click(screen.getByText(/^Show planned \(\d+\)$/, { selector: 'button' }))
    expect(screen.getByText(PLANNED.title, { selector: 'label' })).not.toBeNull()
  })

  it('a topic where everything is planned shows a calm empty state, not a blank page', async () => {
    openSettings('/settings?group=day')
    expect(await screen.findByText('Nothing here works yet', {}, SLOW)).not.toBeNull()
    const day = ALL_SETTINGS.filter(setting => setting.group === 'day').length
    fireEvent.click(button(`Show planned (${day})`))
    expect(screen.queryByText('Nothing here works yet')).toBeNull()
    expect(screen.getByText(SETTINGS_BY_ID.get('day.easy_mode')!.title)).not.toBeNull()
  })

  it('stay hidden, and the switch still works for this page, when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(plannedShown()).toBe(false)
    openSettings('/settings?group=appearance')
    fireEvent.click(await screen.findByText(`Show planned (${appearancePlanned})`, { selector: 'button' }, SLOW))
    expect(screen.getByText(PLANNED.title)).not.toBeNull()
  })
})

describe('PlannedNote', () => {
  it('shows nothing when there is nothing planned, and uses the singular for one', () => {
    const { container, rerender } = render(<PlannedNote count={0} shown={false} onShown={() => {}} />)
    expect(container.textContent).toBe('')
    rerender(<PlannedNote count={1} shown={false} onShown={() => {}} />)
    expect(container.textContent).toContain('1 planned setting is hidden here')
    rerender(<PlannedNote count={1} shown={false} onShown={() => {}} where="match" />)
    expect(container.textContent).toContain('1 planned setting also matches')
    rerender(<PlannedNote count={1} shown onShown={() => {}} />)
    expect(container.textContent).toContain('Showing 1 planned setting: nothing uses it yet.')
  })
})
