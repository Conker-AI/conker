import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLANNED_REASON } from '@/settings/planned'
import { SETTINGS_BY_ID, type Setting, type SettingValue } from '@/settings/registry'
import { SettingRow } from '@/settings/setting-row'
import type { RowStatus, SettingsState } from '@/settings/use-settings'

afterEach(() => cleanup())

const base: Setting = {
  id: 'test.quiet',
  title: 'Keep quiet at night',
  description: 'Holds back alerts while you sleep.',
  type: 'toggle',
  default: false,
  tier: 'basic',
  scope: 'global',
  effect: 'live',
  keywords: [],
  related: [],
  group: 'test',
  section: 'test',
}
const setting = (over: Partial<Setting> = {}): Setting => ({ ...base, ...over })

type Overrides = { values?: Record<string, SettingValue>; statuses?: Record<string, RowStatus>; available?: boolean; changed?: boolean }
function makeState({ values = {}, statuses = {}, available = true, changed = false }: Overrides = {}) {
  const state = {
    loading: false,
    loadErrors: {},
    statuses,
    value: vi.fn((item: Setting) => (item.id in values ? values[item.id] : item.default)),
    available: vi.fn(() => available),
    reload: vi.fn(),
    set: vi.fn(),
    reset: vi.fn(),
    changed: vi.fn(() => changed),
  }
  return state as typeof state & SettingsState
}

/** The switch is greyed out when the control says so to assistive technology. */
const switchOff = () => screen.getByRole('switch', { name: 'Keep quiet at night' }).getAttribute('aria-disabled') === 'true'

function show(item: Setting, overrides: Overrides = {}, custom: (setting: Setting) => React.ReactNode = () => <p>custom block</p>) {
  const state = makeState(overrides)
  render(<SettingRow setting={item} state={state} custom={custom} />)
  return state
}

describe('SettingRow', () => {
  it('shows the title as the label of its control, with the one plain sentence under it', () => {
    show(setting())
    const control = screen.getByRole('switch', { name: 'Keep quiet at night' })
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Holds back alerts while you sleep.')).not.toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends a changed value to the settings state, and nothing else', () => {
    const item = setting()
    const state = show(item)
    fireEvent.click(screen.getByRole('switch', { name: 'Keep quiet at night' }))
    expect(state.set).toHaveBeenCalledWith(item, true)
    expect(state.reset).not.toHaveBeenCalled()
  })

  it('reads the current value from the state, not the default', () => {
    show(setting(), { values: { 'test.quiet': true } })
    expect(screen.getByRole('switch', { name: 'Keep quiet at night' }).getAttribute('aria-checked')).toBe('true')
  })

  it('marks a value changed from the default, and Reset puts the default back', () => {
    const item = setting()
    const state = show(item, { changed: true, values: { 'test.quiet': true } })
    expect(screen.getByLabelText('Changed from the default')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(state.reset).toHaveBeenCalledWith(item)
  })

  it('shows no Changed mark and no Reset while the value is the default', () => {
    show(setting())
    expect(screen.queryByLabelText('Changed from the default')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
  })

  it('tags a setting that lives on this device only', () => {
    show(setting({ scope: 'device' }))
    expect(screen.getByText('This device')).not.toBeNull()
  })

  it('tags a planned setting, explains why, and keeps the control and Reset off', () => {
    const state = show(setting({ effect: 'stored' }), { changed: true })
    expect(screen.getByText('Planned')).not.toBeNull()
    expect(screen.getByText(PLANNED_REASON)).not.toBeNull()
    expect(switchOff()).toBe(true)
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    expect(state.set).not.toHaveBeenCalled()
  })

  it('switches the control off when the setting is not available yet', () => {
    show(setting(), { available: false })
    expect(switchOff()).toBe(true)
  })

  describe('a setting that depends on another', () => {
    const parent = SETTINGS_BY_ID.get('appearance.accent')!
    const dependent = setting({ dependsOn: { id: parent.id, value: 'blue' } })

    it('says what to turn on first, and greys the control, while the other one is not set', () => {
      show(dependent, { values: { [parent.id]: 'red' } })
      expect(screen.getByText(`Turn on ${parent.title} first.`)).not.toBeNull()
      expect(switchOff()).toBe(true)
    })

    it('lets go of the note and the grey once the other one has the value', () => {
      show(dependent, { values: { [parent.id]: 'blue' } })
      expect(screen.queryByText(/first\.$/)).toBeNull()
      expect(switchOff()).toBe(false)
    })

    it('gives the planned reason, not the dependency note, for a planned setting', () => {
      show({ ...dependent, effect: 'stored' }, { values: { [parent.id]: 'red' } })
      expect(screen.getByText(PLANNED_REASON)).not.toBeNull()
      expect(screen.queryByText(`Turn on ${parent.title} first.`)).toBeNull()
    })
  })

  describe('while saving', () => {
    it('says Saving and greys the control so a second change cannot race the first', () => {
      show(setting(), { statuses: { 'test.quiet': { state: 'saving' } } })
      expect(screen.getByRole('status').textContent).toBe('Saving…')
      expect(switchOff()).toBe(true)
    })

    it('says Saved once it is', () => {
      show(setting(), { statuses: { 'test.quiet': { state: 'saved' } } })
      expect(screen.getByRole('status').textContent).toBe('Saved')
      expect(switchOff()).toBe(false)
    })

    it('raises what went wrong as an alert, even a long message', () => {
      const message = 'The server refused this change because another device saved a newer version first, so nothing was written. '.repeat(3).trim()
      show(setting(), { statuses: { 'test.quiet': { state: 'failed', message } } })
      expect(screen.getByRole('alert').textContent).toBe(message)
    })

    it('falls back to "Not saved." when a failure has no message', () => {
      show(setting(), { statuses: { 'test.quiet': { state: 'failed' } } })
      expect(screen.getByRole('alert').textContent).toBe('Not saved.')
    })

    it('only shows the status of its own setting', () => {
      show(setting(), { statuses: { 'test.other': { state: 'failed', message: 'Not mine' } } })
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('other control types', () => {
    it('puts a text control in full width under the title, with Reset below it', () => {
      const item = setting({ id: 'test.name', type: 'text', title: 'Display name', default: '' })
      const state = show(item, { changed: true, values: { 'test.name': 'Sam' } })
      const box = screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement
      expect(box.value).toBe('Sam')
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      expect(state.reset).toHaveBeenCalledWith(item)
    })

    it('shows a number beside the title with its unit', () => {
      show(setting({ id: 'test.n', type: 'number', title: 'Keep for', default: 7, min: 1, max: 30, unit: 'days' }))
      expect((screen.getByRole('spinbutton', { name: 'Keep for' }) as HTMLInputElement).value).toBe('7')
      expect(screen.getByText('days')).not.toBeNull()
    })

    it('shows a list of options as a labelled group of checkboxes', () => {
      show(
        setting({
          id: 'test.days',
          type: 'list',
          title: 'Days',
          default: ['mon'],
          options: [
            { value: 'mon', label: 'Monday' },
            { value: 'tue', label: 'Tuesday' },
          ],
        }),
      )
      const group = screen.getByRole('group', { name: 'Days' })
      expect((within(group).getByRole('checkbox', { name: 'Monday' }) as HTMLInputElement).getAttribute('aria-checked')).toBe('true')
      expect(within(group).getByRole('checkbox', { name: 'Tuesday' }).getAttribute('aria-checked')).toBe('false')
    })

    it('hands a custom setting to the custom renderer, with a title that is not tied to a control', () => {
      const custom = vi.fn(() => <p>custom block</p>)
      show(setting({ id: 'test.custom', type: 'custom', title: 'Fancy thing' }), { changed: true }, custom)
      expect(screen.getByText('custom block')).not.toBeNull()
      expect(custom).toHaveBeenCalled()
      expect(screen.getByText('Fancy thing').getAttribute('for')).toBeNull()
      expect(screen.queryByLabelText('Changed from the default')).not.toBeNull()
      expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    })
  })

  it('tells the owner that saving asks for the password, only for settings that do', () => {
    show(setting({ home: { service: 'pi', path: '/owner/settings', key: 'values', field: 'quiet', verify: true } }))
    expect(screen.getByLabelText('Saving asks for your password')).not.toBeNull()
    cleanup()
    show(setting({ home: { service: 'pi', path: '/owner/settings', key: 'values', field: 'quiet' } }))
    expect(screen.queryByLabelText('Saving asks for your password')).toBeNull()
    cleanup()
    show(setting({ home: { service: 'browser' } }))
    expect(screen.queryByLabelText('Saving asks for your password')).toBeNull()
  })

  it('anchors the row by its setting id for links from search', () => {
    const { container } = render(<SettingRow setting={setting()} state={makeState()} custom={() => null} />)
    expect(container.querySelector('#setting-test\\.quiet')).not.toBeNull()
  })
})
