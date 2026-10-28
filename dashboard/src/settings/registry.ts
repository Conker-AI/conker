/**
 * Conker's settings registry: one JSON file per topic in ./registry, each with sections, each with
 * settings in one shape. The Settings screen, `conker config` and docs/reference/settings.md all
 * read these files; a new setting is one entry in one file. The wording rules (sentence-case
 * titles, one plain sentence each) are checked by tests/test_settings_registry.py.
 */
export type SettingType = 'toggle' | 'number' | 'slider' | 'select' | 'list' | 'time' | 'date' | 'timezone' | 'text' | 'textarea' | 'tags' | 'models' | 'custom'
export type SettingScope = 'global' | 'device' | 'agent' | 'chat'
export type SettingEffect = 'live' | 'next-turn' | 'restart' | 'stored'
export type SettingValue = boolean | number | string | string[] | null
export type SettingOption = { value: string | number; label: string }
export type SettingHome =
  | { service: 'browser' }
  | { service: 'pi'; path: string; key: string; field: string; flat?: boolean; verify?: boolean }

export type Setting = {
  id: string; title: string; description: string; type: SettingType; default: SettingValue
  tier: 'basic' | 'advanced'; scope: SettingScope; effect: SettingEffect
  options?: SettingOption[]; min?: number; max?: number; step?: number; unit?: string; ends?: [string, string]
  max_length?: number; max_items?: number; pattern?: string; component?: string
  keywords: string[]; related: string[]; dependsOn?: { id: string; value: SettingValue }
  home?: SettingHome; group: string; section: string
}
export type SettingsSection = { id: string; title: string; description?: string; settings: Setting[] }
export type SettingsGroup = {
  id: string; title: string; description: string; icon: string; category: string; order: number
  sections: SettingsSection[]
}

/** Topic groups in the side list, under these headings. */
export const CATEGORIES: { id: string; title: string }[] = [
  { id: 'you', title: 'You' },
  { id: 'inbox', title: 'Inbox and alerts' },
  { id: 'talk', title: 'Chats and answers' },
  { id: 'brain', title: 'Conker' },
  { id: 'safety', title: 'Safety and privacy' },
  { id: 'system', title: 'System' },
]

/** A setting with no home of its own lives in Pi's owner settings document under its id. */
const OWNER_SETTINGS = { service: 'pi', path: '/owner/settings', key: 'values', flat: true } as const

type RawSetting = Omit<Setting, 'group' | 'section' | 'keywords' | 'related'> & { keywords?: string[]; related?: string[] }
type RawGroup = Omit<SettingsGroup, 'sections'> & { schemaVersion: number; sections: (Omit<SettingsSection, 'settings'> & { settings: RawSetting[] })[] }

function normalize(raw: RawGroup): SettingsGroup {
  return {
    ...raw,
    sections: raw.sections.map(section => ({
      ...section,
      settings: section.settings.map(setting => ({
        keywords: [], related: [], ...setting, group: raw.id, section: section.id,
        ...(setting.type !== 'custom' && !setting.home ? { home: { ...OWNER_SETTINGS, field: setting.id } } : {}),
      })),
    })),
  }
}

const files = import.meta.glob<RawGroup>('./registry/*.json', { eager: true, import: 'default' })
export const SETTINGS_GROUPS: SettingsGroup[] = Object.values(files).map(normalize).sort((a, b) => a.order - b.order)
export const ALL_SETTINGS: Setting[] = SETTINGS_GROUPS.flatMap(group => group.sections.flatMap(section => section.settings))
export const SETTINGS_BY_ID = new Map(ALL_SETTINGS.map(setting => [setting.id, setting]))

/** Settings the Settings screen edits: chat and agent ones live in each chat and agent. */
export const onScreen = (setting: Setting) => setting.scope === 'global' || setting.scope === 'device'

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function optionLabel(setting: Setting, value: unknown): string {
  return setting.options?.find(option => option.value === value)?.label ?? String(value ?? '')
}

/** Search across titles, descriptions, ids, keywords, option labels and the topic's name. */
export function matches(setting: Setting, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const group = SETTINGS_GROUPS.find(item => item.id === setting.group)
  const haystack = [setting.title, setting.description, setting.id, group?.title ?? '', ...setting.keywords, ...(setting.options ?? []).map(option => option.label)].join(' ').toLocaleLowerCase()
  return words.every(word => haystack.includes(word))
}
