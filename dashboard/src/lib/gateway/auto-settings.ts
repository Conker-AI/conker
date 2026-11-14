import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

/** Settings the routing model proposes in Auto mode. The owner sees and may change every value. */
export type Complexity = 'easy' | 'hard'
export type Research = 'off' | 'web' | 'deep'
export type AutoSettingsField = 'complexity' | 'think' | 'research'
export type AutoEffort = 'light' | 'medium' | 'high' | 'max'
export type AutoSettings = { complexity: Complexity; think: boolean; research: Research; effort?: AutoEffort; reasons: Record<AutoSettingsField, string> & { effort?: string }; modelId: string }

const fields: readonly AutoSettingsField[] = ['complexity', 'think', 'research']
const efforts: readonly unknown[] = ['light', 'medium', 'high', 'max']
const okReason = (reason: unknown) => typeof reason === 'string' && reason.trim().length > 0 && reason.length <= 160
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseAutoSettings(value: unknown): AutoSettings {
  const bad = (): never => { throw new GatewayError('validation') }
  if (!record(value) || !record(value.reasons)) return bad()
  const { complexity, think, research, reasons, modelId, effort } = value as Record<string, unknown> & { reasons: Record<string, unknown> }
  if (complexity !== 'easy' && complexity !== 'hard') return bad()
  if (research !== 'off' && research !== 'web' && research !== 'deep') return bad()
  if (typeof think !== 'boolean' || typeof modelId !== 'string' || !modelId) return bad()
  // An effort and its reason come together or not at all; a reply without them is still valid.
  const withEffort = effort !== undefined
  if (withEffort ? !efforts.includes(effort) || !okReason(reasons.effort) : reasons.effort !== undefined) return bad()
  if (Object.keys(reasons).length !== fields.length + (withEffort ? 1 : 0) || !fields.every(field => okReason(reasons[field]))) return bad()
  const base: AutoSettings = { complexity, think, research, modelId, reasons: { complexity: reasons.complexity as string, think: reasons.think as string, research: reasons.research as string } }
  return withEffort ? { ...base, effort: effort as AutoEffort, reasons: { ...base.reasons, effort: reasons.effort as string } } : base
}

export function createAutoSettingsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async propose(text: string, options: { sessionId?: string | null; harnessDisabled?: boolean; signal?: AbortSignal } = {}): Promise<AutoSettings> {
      const response = await auth.request('/api/pi/models/auto-settings', { method: 'POST', body: { text, ...(options.sessionId ? { session_id: options.sessionId } : {}), ...(options.harnessDisabled ? { harness_disabled: true } : {}) }, ...(options.signal ? { signal: options.signal } : {}) })
      return parseAutoSettings(response)
    },
  }
}
