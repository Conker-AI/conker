import { useSyncExternalStore } from 'react'
import { cachedServerSetting, cacheServerSetting, DEVICE_EVENT, storedDeviceValue } from './device'
import type { Setting, SettingValue } from './registry'
import { settingValue } from './setting-value'

/**
 * One setting's value for any screen, not only Settings. Global settings come from the owner's
 * settings document: read when the app starts and when the tab comes back, and replaced after each
 * save on the Settings screen, so a change shows at once. Until the document arrives, the last value
 * seen on this device paints the screen. A `device` setting reads this browser, the way Settings
 * saves it. Every value is checked against its registry entry (type, options, range) and falls back
 * to the default. The registry loads separately, after the first paint, so the first load stays small.
 */
let saved: Record<string, unknown> | null = null, savedRevision = -1
let registry: ReadonlyMap<string, Setting> | null = null
let registryLoad: Promise<void> | null = null
const listeners = new Set<() => void>()
/** The last value handed out per id, so a list keeps its identity while it is unchanged. */
const handedOut = new Map<string, SettingValue>()

function changed() { listeners.forEach(listener => listener()) }

function loadRegistry() {
  registryLoad ??= import('./registry').then(module => { registry = module.SETTINGS_BY_ID; changed() }, () => { registryLoad = null })
}

/** The owner's settings document as the server returned it; an older revision arriving late is ignored. */
export function publishServerSettings(document: { revision: number; values: Record<string, unknown> }) {
  if (document.revision < savedRevision) return
  saved = document.values; savedRevision = document.revision
  for (const id of handedOut.keys()) if (registry?.get(id)?.scope !== 'device') cacheServerSetting(id, document.values[id])
  changed()
}

export function subscribeServerSettings(listener: () => void) {
  if (!listeners.size) { window.addEventListener(DEVICE_EVENT, changed); window.addEventListener('storage', changed) }
  listeners.add(listener)
  loadRegistry()
  return () => {
    listeners.delete(listener)
    if (!listeners.size) { window.removeEventListener(DEVICE_EVENT, changed); window.removeEventListener('storage', changed) }
  }
}

function stored(id: string, entry: Setting | null | undefined): unknown {
  // Before the registry loads, a value saved in this browser marks a device setting.
  if (entry ? entry.scope === 'device' : storedDeviceValue(id) !== undefined) return storedDeviceValue(id)
  // Settings with a home of their own (preferences, search, ToolGate) are read by their own screens.
  if (entry?.home?.service === 'toolgate' || entry?.home?.service === 'pi' && entry.home.path !== '/owner/settings') return undefined
  return saved ? saved[id] : cachedServerSetting(id)
}

/** The current value outside React (for code that applies settings to the page). */
export function serverSetting(id: string, fallback: boolean): boolean
export function serverSetting(id: string, fallback: number): number
export function serverSetting(id: string, fallback: readonly string[]): string[]
export function serverSetting<T extends string = string>(id: string, fallback: NoInfer<T>): T
export function serverSetting(id: string, fallback: SettingValue | readonly string[]): SettingValue {
  const entry = registry ? registry.get(id) ?? null : undefined
  const value = settingValue(entry, stored(id, entry), fallback as SettingValue)
  const last = handedOut.get(id)
  if (last !== undefined && JSON.stringify(last) === JSON.stringify(value)) return last
  handedOut.set(id, value)
  if (saved && entry?.scope !== 'device') cacheServerSetting(id, saved[id])
  return value
}

/**
 * A setting's value, kept current. Name the options of a select as the type, e.g.
 * `useServerSetting<'open' | 'collapsed' | 'auto'>('appearance.sidebar', 'open')`; the default and
 * those options must match the registry entry (`npm run check:settings` checks every call).
 */
export function useServerSetting(id: string, fallback: boolean): boolean
export function useServerSetting(id: string, fallback: number): number
export function useServerSetting(id: string, fallback: readonly string[]): string[]
export function useServerSetting<T extends string = string>(id: string, fallback: NoInfer<T>): T
export function useServerSetting(id: string, fallback: SettingValue | readonly string[]): SettingValue {
  return useSyncExternalStore(subscribeServerSettings, () => serverSetting(id, fallback as never))
}
