import { useEffect } from 'react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { cachedServerSetting, cacheServerSetting, DEVICE_EVENT, readDeviceValue } from './device'
import { publishServerSettings, serverSetting, subscribeServerSettings } from './server-setting'

/**
 * The appearance settings that work today, applied to the page: accent color, corners and bigger
 * focus outlines (everywhere, from the server), text size and animations (this device). Theme stays
 * with the theme provider. Accent colors keep 4.5:1 contrast with their text in both themes
 * (rationale ledger, Accent hue). Kept apart from the registry so the app's first load stays small.
 */
const ACCENTS = new Set(['neutral', 'blue', 'indigo', 'purple', 'magenta'])

function applyDevice() {
  const root = document.documentElement
  const percent = Number(readDeviceValue('appearance.text_size', '100'))
  root.style.fontSize = Number.isFinite(percent) && percent !== 100 ? `${percent}%` : ''
  const motion = readDeviceValue('appearance.motion', 'device')
  if (motion === 'device') delete root.dataset.motion
  else root.dataset.motion = String(motion)
}

/** Soft corners and normal outlines are the theme's own; the others are rules in index.css. */
function applyShell() {
  const root = document.documentElement
  const corners = serverSetting<'sharp' | 'soft' | 'round'>('appearance.corners', 'soft')
  if (corners === 'soft') delete root.dataset.corners
  else root.dataset.corners = corners
  if (serverSetting('accessibility.focus', false)) root.dataset.focus = 'large'
  else delete root.dataset.focus
}

export function applyAccent(value: unknown) {
  const accent = typeof value === 'string' && ACCENTS.has(value) ? value : 'neutral'
  if (accent === 'neutral') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = accent
  cacheServerSetting('appearance.accent', accent)
}

/**
 * For the whole app: this device's choices at once, then the saved settings from the server, read
 * again whenever the tab comes back (a change made by Conker or the CLI shows without a reload).
 */
export function useAppearanceSync(client: GatewayControlClient) {
  useEffect(() => {
    applyDevice()
    applyShell()
    const cached = cachedServerSetting('appearance.accent')
    if (cached !== undefined) applyAccent(cached)
    window.addEventListener(DEVICE_EVENT, applyDevice)
    const unsubscribe = subscribeServerSettings(applyShell)
    let controller = new AbortController()
    const read = () => {
      controller.abort(); controller = new AbortController()
      client.settings.read(controller.signal).then(settings => {
        publishServerSettings(settings)
        applyAccent(settings.values['appearance.accent'] ?? 'neutral')
      }).catch(() => { /* keep the cached look */ })
    }
    const returned = () => { if (document.visibilityState === 'visible') read() }
    read()
    document.addEventListener('visibilitychange', returned)
    return () => { window.removeEventListener(DEVICE_EVENT, applyDevice); document.removeEventListener('visibilitychange', returned); unsubscribe(); controller.abort() }
  }, [client])
}

/** For the Settings screen: follows the accent as it changes there. */
export function useAppearance(accent: unknown) {
  useEffect(() => { if (accent !== undefined) applyAccent(accent) }, [accent])
}
