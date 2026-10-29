import type { Setting, SettingValue } from './registry'

/**
 * Whether a saved value fits its registry entry: the right type, one of the options, inside the
 * range, whole when the step is. A saved value can be from an older Conker or written by hand, so every
 * reader checks it before using it. Kept apart from the registry so the shell can use it without
 * loading every topic file.
 */
export function validSettingValue(setting: Setting, value: unknown): value is SettingValue {
  if (value === null) return setting.default === null
  const options = setting.options?.map(option => option.value)
  const text = (item: unknown) => typeof item === 'string' && (setting.max_length === undefined || item.length <= setting.max_length)
  const items = (list: unknown, item: (value: unknown) => boolean) => Array.isArray(list) && list.every(item)
    && new Set(list).size === list.length && (setting.max_items === undefined || list.length <= setting.max_items)
  switch (setting.type) {
    case 'toggle': return typeof value === 'boolean'
    case 'number': case 'slider': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return false
      const min = setting.min ?? (setting.type === 'slider' ? 0 : undefined), max = setting.max ?? (setting.type === 'slider' ? 100 : undefined)
      if (min !== undefined && value < min || max !== undefined && value > max) return false
      // Whole steps mean whole numbers; the exact grid is the control's job (some defaults sit off it).
      return !Number.isInteger(setting.step) || Number.isInteger(value)
    }
    case 'select': return options ? options.includes(value as string | number) : false
    case 'list': return items(value, item => !!options?.includes(item as string | number))
    case 'tags': case 'models': return items(value, text)
    case 'text': case 'textarea': case 'time': case 'date': case 'timezone':
      if (!text(value)) return false
      try { return !setting.pattern || new RegExp(setting.pattern).test(value as string) } catch { return false }
    case 'custom': return false
  }
}

/** Before the registry has loaded: at least the same kind of value as the default. */
function sameKind(value: unknown, fallback: SettingValue): boolean {
  if (Array.isArray(fallback)) return Array.isArray(value) && value.every(item => typeof item === 'string')
  return fallback !== null && typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value))
}

/**
 * The value to use: the saved one when it fits, else the default. `entry` is the registry entry,
 * `null` when the registry has no such setting (any saved value is stale), `undefined` while the
 * registry is still loading.
 */
export function settingValue(entry: Setting | null | undefined, saved: unknown, fallback: SettingValue): SettingValue {
  if (saved === undefined || entry === null) return fallback
  if (entry === undefined) return sameKind(saved, fallback) ? saved as SettingValue : fallback
  return validSettingValue(entry, saved) ? saved : fallback
}
