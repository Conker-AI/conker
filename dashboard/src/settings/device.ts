import type { Setting, SettingValue } from './registry'

/**
 * Settings kept in this browser (text size, animations, show advanced settings). Storage can be
 * missing or blocked (private windows): reads fall back to the default and writes fail quietly.
 */
const PREFIX = 'conker.setting.'
export const DEVICE_EVENT = 'conker-device-setting'

/** What this browser holds for a setting, or `undefined` when it holds nothing. */
export function storedDeviceValue(id: string): unknown {
  try {
    const raw = window.localStorage.getItem(PREFIX + id)
    return raw === null ? undefined : JSON.parse(raw)
  } catch { return undefined }
}

export function readDeviceValue(id: string, fallback: SettingValue): SettingValue {
  const value = storedDeviceValue(id)
  return value === undefined ? fallback : value as SettingValue
}

export function readDeviceSetting(setting: Setting): SettingValue {
  return readDeviceValue(setting.id, setting.default)
}

export function writeDeviceSetting(setting: Setting, value: SettingValue) {
  try {
    if (JSON.stringify(value) === JSON.stringify(setting.default)) window.localStorage.removeItem(PREFIX + setting.id)
    else window.localStorage.setItem(PREFIX + setting.id, JSON.stringify(value))
  } catch { /* storage unavailable: the choice lasts for this page only */ }
  window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: { id: setting.id, value } }))
}

/** A server setting remembered here too, so the page paints with it before the server answers. */
export function cacheServerSetting(id: string, value: unknown) {
  try {
    if (value === undefined) window.localStorage.removeItem(PREFIX + 'cache.' + id)
    else window.localStorage.setItem(PREFIX + 'cache.' + id, JSON.stringify(value))
  } catch { /* optional */ }
}

export function cachedServerSetting(id: string): unknown {
  try { const raw = window.localStorage.getItem(PREFIX + 'cache.' + id); return raw === null ? undefined : JSON.parse(raw) } catch { return undefined }
}
