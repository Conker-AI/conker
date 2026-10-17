import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

/** Settings the routing model proposes in Auto mode. The owner sees and may change every value. */
export type Complexity = 'easy' | 'hard'
export type Research = 'off' | 'web' | 'deep'
export type AutoSettingsField = 'complexity' | 'think' | 'research'
export type AutoSettings = { complexity: Complexity; think: boolean; research: Research; reasons: Record<AutoSettingsField, string>; modelId: string }

const fields: readonly AutoSettingsField[] = ['complexity', 'think', 'research']
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseAutoSettings(value: unknown): AutoSettings {
  const bad = (): never => { throw new GatewayError('validation') }
  if (!record(value) || !record(value.reasons)) return bad()
  const { complexity, think, research, reasons, modelId } = value as Record<string, unknown> & { reasons: Record<string, unknown> }
  if (complexity !== 'easy' && complexity !== 'hard') return bad()
  if (research !== 'off' && research !== 'web' && research !== 'deep') return bad()
  if (typeof think !== 'boolean' || typeof modelId !== 'string' || !modelId) return bad()
  if (Object.keys(reasons).length !== fields.length || !fields.every(field => typeof reasons[field] === 'string' && (reasons[field] as string).trim().length > 0 && (reasons[field] as string).length <= 160)) return bad()
  return { complexity, think, research, modelId, reasons: { complexity: reasons.complexity as string, think: reasons.think as string, research: reasons.research as string } }
}

export function createAutoSettingsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async propose(text: string, options: { sessionId?: string | null; harnessDisabled?: boolean; signal?: AbortSignal } = {}): Promise<AutoSettings> {
      const response = await auth.request('/api/pi/models/auto-settings', { method: 'POST', body: { text, ...(options.sessionId ? { session_id: options.sessionId } : {}), ...(options.harnessDisabled ? { harness_disabled: true } : {}) }, ...(options.signal ? { signal: options.signal } : {}) })
      return parseAutoSettings(response)
    },
  }
}
