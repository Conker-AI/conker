import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

// Pi's latest reading per plan window: percentages only, never prices, tokens or account details.
const usageWindow = z.object({
  provider: z.enum(['chatgpt', 'claude']),
  window: z.string().min(1).max(80).regex(/^[A-Za-z0-9_.:-]+$/),
  label: z.string().regex(/^[\w .()+/:-]{1,60}$/),
  usedPercent: z.number().int().min(0).max(100),
  resetsAt: z.string().max(40).nullable(),
  checkedAt: z.number().finite().nonnegative(),
})
// Open alerts are shown by the Inbox; Home reads the windows only.
const usage = z.object({ windows: z.array(usageWindow).max(40) })

export type PlanWindow = z.infer<typeof usageWindow>
export type PlanUsage = z.infer<typeof usage>

export function createGatewayPlansClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async usage(signal?: AbortSignal): Promise<PlanUsage> {
      const result = usage.safeParse(await auth.request('/api/control/pi/plans/usage', { signal }))
      if (!result.success) throw new GatewayError('invalid-response')
      return result.data
    },
  }
}
