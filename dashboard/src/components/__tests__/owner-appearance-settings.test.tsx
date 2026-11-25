import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import appearance from '@/settings/registry/appearance.json'
import { ShortcutList } from '@/components/gateway/shortcut-list'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { useAppearanceSync } from '@/settings/appearance'
import { publishServerSettings } from '@/settings/server-setting'
import { stubMatchMedia } from './jsdom-shims.test'

/** Appearance settings round six (R-F1): each test fails if the page ignores the owner's choice. */
let revision = 5000
function choose(values: Record<string, unknown>) {
  revision += 1
  act(() => publishServerSettings({ revision, values }))
}

beforeEach(() => stubMatchMedia())
afterEach(() => {
  choose({})
  cleanup()
  vi.unstubAllGlobals()
})

function Shell() {
  useAppearanceSync({ settings: { read: () => new Promise(() => undefined) } } as unknown as GatewayControlClient)
  return null
}

/** Each setting, the mark it puts on <html>, and the mark each option gives (undefined: the theme's own look). */
const marks = {
  'appearance.contrast': ['contrast', { true: 'more', false: undefined }],
  'appearance.color_vision': ['colorVision', { off: undefined, red_green: 'red_green', blue_yellow: 'blue_yellow' }],
  'appearance.font': ['font', { inter: undefined, system: 'system', atkinson: 'atkinson', dyslexic: 'dyslexic' }],
  'appearance.code_font': ['codeFont', { system: undefined, jetbrains: 'jetbrains', fira: 'fira' }],
  'appearance.ligatures': ['ligatures', { true: 'on', false: undefined }],
  'appearance.line_spacing': ['lineSpacing', { normal: undefined, compact: 'compact', relaxed: 'relaxed' }],
  'appearance.density': ['density', { comfortable: undefined, compact: 'compact', spacious: 'spacious' }],
} as const

type Entry = { id: string; type: string; default: unknown; effect: string; options?: { value: string }[] }
const entries = appearance.sections.flatMap(section => section.settings as Entry[])

describe('appearance settings that change the whole page', () => {
  it('leave the page as the theme draws it by default', () => {
    render(<Shell />)
    for (const [, [name]] of Object.entries(marks)) expect(document.documentElement.dataset[name]).toBeUndefined()
  })

  for (const [id, [name, options]] of Object.entries(marks)) {
    it(`${id}: every choice marks the page`, () => {
      const entry = entries.find(item => item.id === id)!
      expect(entry.effect).toBe('live')
      const values = entry.type === 'toggle' ? [true, false] : entry.options!.map(option => option.value)
      expect(values.map(String).sort()).toEqual(Object.keys(options).sort())
      expect((options as Record<string, string | undefined>)[String(entry.default)]).toBeUndefined()
      render(<Shell />)
      for (const value of values) {
        choose({ [id]: value })
        const expected = (options as Record<string, string | undefined>)[String(value)]
        expect(document.documentElement.dataset[name]).toBe(expected)
      }
      choose({})
      expect(document.documentElement.dataset[name]).toBeUndefined()
    })
  }
})

describe('keyboard.cheat_sheet', () => {
  const press = (target: Element = document.body) => act(() => void fireEvent.keyDown(target, { key: '?', shiftKey: true }))

  it('opens the list of every shortcut on ?, but never while he types', async () => {
    render(
      <>
        <input aria-label="Message" />
        <ShortcutList />
      </>,
    )
    press(screen.getByLabelText('Message'))
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
    press()
    expect(await screen.findByText('Keyboard shortcuts')).not.toBeNull()
    expect(screen.getByText('Search everything')).not.toBeNull()
    expect(screen.getByText('New chat')).not.toBeNull()
  }, 30_000)

  it('does nothing when he turns the list off, or all shortcuts off', () => {
    choose({ 'keyboard.cheat_sheet': false })
    render(<ShortcutList />)
    press()
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
    cleanup()
    choose({ 'keyboard.shortcuts': false })
    render(<ShortcutList />)
    press()
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
  })
})
