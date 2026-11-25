import { useEffect } from 'react'
import { refreshState } from '@/lib/refresh-state'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { setDateFormatChoice } from '@/lib/date-format'
import { DEVICE_EVENT, readDeviceValue } from './device'
import { publishServerSettings, serverSetting, subscribeServerSettings } from './server-setting'

/**
 * The appearance settings that work today, applied to the page: accent color, corners, bigger
 * focus outlines, larger buttons, chat width, contrast, status colors, fonts, line spacing, density and
 * how times and dates are written (everywhere, from the server), text size and
 * animations (this device). Theme stays with the theme provider. Accent colors keep 4.5:1 contrast
 * with their text in both themes (rationale ledger, Accent hue). Server settings paint with the last
 * value this device saw until the server answers (server-setting.ts). Kept apart from the registry
 * so the app's first load stays small.
 */
function applyDevice() {
  const percent = Number(readDeviceValue('appearance.text_size', '100'))
  document.documentElement.style.fontSize = Number.isFinite(percent) && percent !== 100 ? `${percent}%` : ''
  const motion = readDeviceValue('appearance.motion', 'device')
  mark('motion', motion === 'device' ? null : String(motion))
}

/**
 * Choices marked on <html> for the rules in index.css, styles/design-system.css and
 * styles/appearance-settings.css: [mark, the theme's own look, the mark a toggle that is on gets,
 * the setting when it is not `appearance.` plus the mark in snake case]. The theme's own look (soft
 * corners, normal outlines, Medium chat width...) is unmarked; any other choice is marked with its value.
 */
const PAGE_MARKS: [string, string | boolean, string?, string?][] = [
  ['accent', 'neutral'],
  ['corners', 'soft'],
  ['focus', false, 'large', 'accessibility.focus'],
  ['targets', false, 'large', 'accessibility.large_targets'],
  ['chatWidth', 'medium'],
  ['contrast', false],
  ['colorVision', 'off'],
  ['font', 'inter'],
  ['codeFont', 'system'],
  ['ligatures', false],
  ['lineSpacing', 'normal'],
  ['density', 'comfortable'],
]

function applyShell() {
  for (const [name, standard, on = 'on', id = `appearance.${name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`] of PAGE_MARKS) {
    const value = serverSetting(id, standard as never) as unknown
    mark(name, value === standard ? null : value === true ? on : String(value))
  }
  applyDateFormat()
}

/** Times and dates on every screen (src/lib/date-format.ts); set once at load too, so the first paint uses the last value seen. */
function applyDateFormat() {
  setDateFormatChoice({ time: serverSetting<'device' | '24h' | '12h'>('you.time_format', 'device'), date: serverSetting<'device' | 'dmy' | 'mdy' | 'ymd'>('you.date_format', 'device') })
}
applyDateFormat()

function mark(name: string, value: string | null) {
  if (value === null) delete document.documentElement.dataset[name]
  else document.documentElement.dataset[name] = value
}

/**
 * For the whole app: this device's choices at once, then the saved settings from the server, read
 * again whenever the tab comes back (a change made by Conker or the CLI shows without a reload).
 */
export function useAppearanceSync(client: GatewayControlClient) {
  useEffect(() => {
    applyDevice()
    applyShell()
    window.addEventListener(DEVICE_EVENT, applyDevice)
    const unsubscribe = subscribeServerSettings(applyShell)
    let controller = new AbortController()
    const read = () => {
      controller.abort()
      controller = new AbortController()
      client.settings
        .read(controller.signal)
        .then(publishServerSettings)
        .catch(() => {
          /* keep the cached look */
        })
    }
    const returned = () => {
      if (document.visibilityState === 'visible') read()
    }
    read()
    document.addEventListener('visibilitychange', returned)
    const refreshed = refreshState.subscribe((state, before) => {
      if (state.reads !== before.reads) read()
    })
    return () => {
      refreshed()
      window.removeEventListener(DEVICE_EVENT, applyDevice)
      document.removeEventListener('visibilitychange', returned)
      unsubscribe()
      controller.abort()
    }
  }, [client])
}

/** For the Settings screen: follows the accent as it changes there. */
export function useAppearance(accent: unknown) {
  useEffect(() => {
    if (typeof accent === 'string') mark('accent', accent === 'neutral' ? null : accent)
  }, [accent])
}
