import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { TurnUsage } from '@/lib/gateway/turn-usage'
import { gatewayError } from '@/lib/gateway/transport'

export type UsageRead = { status: 'loading' } | { status: 'ready'; usage: TurnUsage } | { status: 'error'; message: string; unavailable: boolean }

/** One read lifetime. Auth.request also rejects responses from a rotated browser session. */
export function startTurnUsageRead(client: Pick<GatewayRuntimeClient, 'getTurnUsage'>, turnId: string, sessionId: string, available: () => boolean, publish: (value: UsageRead) => void) {
  const controller = new AbortController()
  const current = () => !controller.signal.aborted && available()
  const done = Promise.resolve().then(async () => {
    if (!current()) return
    publish({ status: 'loading' })
    try {
      const usage = await client.getTurnUsage(turnId, sessionId, { signal: controller.signal })
      if (current()) publish({ status: 'ready', usage })
    } catch (error) {
      if (!current()) return
      const failure = gatewayError(error), unavailable = failure.status === 404
      publish({ status: 'error', unavailable, message: unavailable ? 'Usage is unavailable for this turn. Its source may have been forgotten.' : ['browser-expired', 'session-changed'].includes(failure.kind) ? 'Sign in again to view usage.' : 'Could not load usage. Try reading it again.' })
    }
  })
  return { done, cancel: () => controller.abort() }
}
