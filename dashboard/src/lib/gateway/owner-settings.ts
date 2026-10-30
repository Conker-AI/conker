import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

/**
 * The owner's settings document (every registry setting with no home of its own, by id), his
 * preferences (quiet hours, proactivity, daily budgets, plan alerts, idle timeout) and ToolGate's
 * settings for how tools run. All three are revision-checked: a save from a stale screen is
 * refused, never merged. ToolGate's lockdown is a switch with no revision.
 */
const settingsDocument = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), values: z.record(z.string().max(160), z.unknown()) }).strict()
const preferencesDocument = z.object({ revision: z.number().int().positive(), preferences: z.record(z.string(), z.unknown()) }).strict()

// ToolGate's own document, passed through by the gateway: a number left null keeps today's limit.
const toolSettingsDocument = z.object({ revision: z.number().int().nonnegative(), settings: z.record(z.string(), z.unknown()) })
const lockdownState = z.object({ lockdown: z.boolean(), reason: z.string().max(2000).optional(), changed_by: z.string().max(64).nullable().optional() })

export type OwnerSettingsDocument = z.infer<typeof settingsDocument>
export type OwnerPreferencesDocument = z.infer<typeof preferencesDocument>
export type ToolSettingsDocument = z.infer<typeof toolSettingsDocument>
export type LockdownState = z.infer<typeof lockdownState>

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError('invalid-response')
  return result.data
}

export function createOwnerSettingsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async read(signal?: AbortSignal): Promise<OwnerSettingsDocument> {
      return parse(settingsDocument, await auth.request('/api/control/pi/owner/settings', { signal }))
    },
    /** Replaces the document; a setting left out goes back to its default. No password: preferences only. */
    async save(values: Record<string, unknown>, revision: number): Promise<OwnerSettingsDocument> {
      const saved = parse(settingsDocument, await auth.request('/api/control/pi/owner/settings', { method: 'POST', body: { expected_revision: revision, values } }))
      if (saved.revision !== revision + 1) throw new GatewayError('invalid-response')
      return saved
    },
    async preferences(signal?: AbortSignal): Promise<OwnerPreferencesDocument> {
      return parse(preferencesDocument, await auth.request('/api/control/pi/owner/preferences', { signal }))
    },
    /** Asks for the password: these decide when Conker may act on its own and what it may spend. */
    async savePreferences(preferences: Record<string, unknown>, revision: number): Promise<OwnerPreferencesDocument> {
      const saved = parse(preferencesDocument, await auth.request('/api/control/pi/owner/preferences', { method: 'POST', body: { expected_revision: revision, preferences } }))
      if (saved.revision !== revision + 1) throw new GatewayError('invalid-response')
      return saved
    },
    async tools(signal?: AbortSignal): Promise<ToolSettingsDocument> {
      return parse(toolSettingsDocument, await auth.request('/api/owner/tool-settings', { signal }))
    },
    /** Replaces ToolGate's settings (a field left out goes back to today's limit); asks for the password. */
    async saveTools(settings: Record<string, unknown>, revision: number): Promise<ToolSettingsDocument> {
      const saved = parse(toolSettingsDocument, await auth.request('/api/owner/tool-settings', { method: 'PUT', body: { expected_revision: revision, settings } }))
      if (saved.revision !== revision + 1) throw new GatewayError('invalid-response')
      return saved
    },
    async lockdown(signal?: AbortSignal): Promise<LockdownState> {
      return parse(lockdownState, await auth.request('/api/owner/lockdown', { signal }))
    },
    /** On only takes power away, so the session is enough; off gives it back and asks for the password. */
    async setLockdown(enabled: boolean): Promise<LockdownState> {
      const saved = parse(lockdownState, await auth.request('/api/owner/lockdown', { method: 'POST', body: { enabled } }))
      if (saved.lockdown !== enabled) throw new GatewayError('invalid-response')
      return saved
    },
  }
}

export type OwnerSettingsClient = ReturnType<typeof createOwnerSettingsClient>
