import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { GatewayError, gatewayError } from '@/lib/gateway/transport'
import { useTheme } from '@/hooks/use-theme'
import { readDeviceSetting, writeDeviceSetting } from './device'
import { publishServerSettings } from './server-setting'
import { sameValue, type Setting, type SettingValue } from './registry'

export type RowStatus = { state: 'saving' | 'saved' | 'failed'; message?: string }
type Documents = {
  settings: { revision: number; values: Record<string, unknown> } | null
  preferences: { revision: number; preferences: Record<string, unknown> } | null
  search: { revision: number; configuration: Record<string, unknown> } | null
}

function at(document: unknown, field: string): unknown {
  let value = document
  for (const part of field.split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

function withField(document: Record<string, unknown>, field: string, value: unknown): Record<string, unknown> {
  const copy = structuredClone(document)
  const parts = field.split('.'), leaf = parts.pop()!
  let target: Record<string, unknown> = copy
  for (const part of parts) target = (target[part] ??= {}) as Record<string, unknown>
  target[leaf] = value
  return copy
}

/**
 * Every setting's current value, read from its own home, and one way to change it. Changes save
 * at once, one at a time per home (so revisions never race), and each row reports Saving, Saved or
 * what went wrong. A conflict reloads the latest saved values instead of overwriting them.
 */
export function useSettings(client: GatewayControlClient) {
  const { theme, setTheme } = useTheme()
  const [documents, setDocuments] = useState<Documents>({ settings: null, preferences: null, search: null })
  const [loadErrors, setLoadErrors] = useState<Partial<Record<keyof Documents, string>>>({})
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [device, setDevice] = useState(0)
  const latest = useRef(documents), queues = useRef(new Map<string, Promise<void>>()), timers = useRef(new Map<string, number>())
  useEffect(() => { latest.current = documents }, [documents])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const [settings, preferences, search] = await Promise.allSettled([client.settings.read(signal), client.settings.preferences(signal), client.search.settings(signal)])
    if (signal?.aborted) return
    const next: Documents = {
      settings: settings.status === 'fulfilled' ? settings.value : null,
      preferences: preferences.status === 'fulfilled' ? preferences.value : null,
      search: search.status === 'fulfilled' ? search.value as Documents['search'] : null,
    }
    const message = (result: PromiseSettledResult<unknown>) => result.status === 'rejected' ? gatewayError(result.reason).message : undefined
    setLoadErrors({ settings: message(settings), preferences: message(preferences), search: message(search) })
    setDocuments(next); latest.current = next; setLoading(false)
    if (next.settings) publishServerSettings(next.settings)
  }, [client])
  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal) })
    return () => controller.abort()
  }, [load])

  const homeOf = (setting: Setting): keyof Documents | 'browser' | null => {
    const home = setting.home
    if (!home) return null
    if (home.service === 'browser') return 'browser'
    return home.path === '/owner/settings' ? 'settings' : home.path === '/owner/preferences' ? 'preferences' : home.path === '/search/settings' ? 'search' : null
  }

  /** The value shown for a setting: what its home holds, or its default. */
  const value = useCallback((setting: Setting): SettingValue => {
    void device
    const home = homeOf(setting)
    if (setting.id === 'appearance.theme') return theme
    if (home === 'browser') return readDeviceSetting(setting)
    if (home === 'settings') return (documents.settings?.values[setting.id] as SettingValue | undefined) ?? setting.default
    if (home === 'preferences' && setting.home?.service === 'pi') return (at(documents.preferences?.preferences, setting.home.field) as SettingValue | undefined) ?? setting.default
    if (home === 'search' && setting.home?.service === 'pi') return (at(documents.search?.configuration, setting.home.field) as SettingValue | undefined) ?? setting.default
    return setting.default
  }, [documents, theme, device])

  /** Whether this setting's home could be read, so the row can be changed. */
  const available = useCallback((setting: Setting) => {
    const home = homeOf(setting)
    return home === null || home === 'browser' || documents[home] !== null
  }, [documents])

  const report = useCallback((id: string, status: RowStatus | null) => {
    window.clearTimeout(timers.current.get(id))
    setStatuses(current => { const next = { ...current }; if (status) next[id] = status; else delete next[id]; return next })
    if (status?.state === 'saved') timers.current.set(id, window.setTimeout(() => setStatuses(current => { const next = { ...current }; delete next[id]; return next }), 2500))
  }, [])

  const write = useCallback((setting: Setting, next: SettingValue) => {
    const home = homeOf(setting)
    if (!home) return
    if (setting.id === 'appearance.theme') { setTheme(next as 'system' | 'light' | 'dark'); report(setting.id, { state: 'saved' }); return }
    if (home === 'browser') { writeDeviceSetting(setting, next); setDevice(count => count + 1); report(setting.id, { state: 'saved' }); return }
    report(setting.id, { state: 'saving' })
    const task = async () => {
      const current = latest.current
      try {
        if (home === 'settings' && current.settings) {
          const values = { ...current.settings.values }
          // Back at its default, a setting leaves the document: "changed" stays honest.
          if (sameValue(next, setting.default)) delete values[setting.id]; else values[setting.id] = next
          const saved = await client.settings.save(values, current.settings.revision)
          setDocuments(documents => ({ ...documents, settings: saved })); latest.current = { ...latest.current, settings: saved }
          // Every other screen follows at once (the sidebar, Home, Memory...).
          publishServerSettings(saved)
        } else if (home === 'preferences' && current.preferences && setting.home?.service === 'pi') {
          const saved = await client.settings.savePreferences(withField(current.preferences.preferences, setting.home.field, next), current.preferences.revision)
          setDocuments(documents => ({ ...documents, preferences: saved })); latest.current = { ...latest.current, preferences: saved }
        } else if (home === 'search' && current.search && setting.home?.service === 'pi') {
          const saved = await client.search.save(withField(current.search.configuration, setting.home.field, next) as never, current.search.revision) as unknown as Documents['search']
          setDocuments(documents => ({ ...documents, search: saved })); latest.current = { ...latest.current, search: saved }
        } else throw new GatewayError('dependency')
        report(setting.id, { state: 'saved' })
      } catch (cause) {
        const failure = gatewayError(cause)
        if (failure.status === 409) { await load(); report(setting.id, { state: 'failed', message: 'Changed somewhere else. Showing the latest; try again.' }) }
        else report(setting.id, { state: 'failed', message: failure.kind === 'verification-cancelled' ? 'Not saved: the password was not confirmed.' : failure.message })
      }
    }
    const queued = (queues.current.get(home) ?? Promise.resolve()).then(task)
    queues.current.set(home, queued)
  }, [client, load, setTheme, report])

  return {
    loading, loadErrors, statuses, value, available, reload: () => load(),
    set: write,
    reset: (setting: Setting) => write(setting, setting.default),
    changed: (setting: Setting) => setting.type !== 'custom' && !sameValue(value(setting), setting.default),
  }
}

export type SettingsState = ReturnType<typeof useSettings>
