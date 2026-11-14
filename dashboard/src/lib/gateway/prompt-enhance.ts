import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

/** What Pi's POST /prompts/enhance sends: the rewrite, what changed and which model wrote it. Nothing is saved or sent. */
const enhanced = z.object({
  text: z.string().min(1).max(16000), notes: z.array(z.string().max(500)).max(5), modelId: z.string().max(200),
  templateId: z.string().nullish(), fields: z.record(z.string(), z.string()).optional(),
}).strict()

export type EnhancedPrompt = z.infer<typeof enhanced>
export type EnhanceOptions = { sessionId?: string | null; privacy?: { memoryDisabled?: boolean; harnessDisabled?: boolean }; signal?: AbortSignal }

export function createPromptEnhanceClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    /** Rewrites an unsent draft. One model call on Pi's side, so press once and wait. */
    async enhance(text: string, { sessionId, privacy, signal }: EnhanceOptions = {}): Promise<EnhancedPrompt> {
      const body = { text, ...(sessionId ? { sessionId } : {}), ...(privacy && Object.keys(privacy).length ? { privacy } : {}) }
      const result = enhanced.safeParse(await auth.request('/api/control/pi/prompts/enhance', { method: 'POST', body, signal }))
      if (!result.success) throw new GatewayError('invalid-response')
      return result.data
    },
  }
}

export type PromptEnhanceClient = ReturnType<typeof createPromptEnhanceClient>
