import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanUsage } from '@/lib/gateway/plans'
import { gatewayError } from '@/lib/gateway/transport'
import { summarizePlans, type PlanState } from './home-model'

/** Plan usage for Home. A failed refresh keeps the last reading; its check time shows its age. */
export function usePlanUsage(plans: { usage: (signal?: AbortSignal) => Promise<PlanUsage> }) {
  const [state, setState] = useState<PlanState>({ status: 'loading' })
  const generation = useRef(0)
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current
    try {
      const usage = await plans.usage(signal)
      if (current === generation.current) setState(summarizePlans(usage))
    } catch (error) {
      if (signal?.aborted || current !== generation.current) return
      const status = gatewayError(error).status
      setState(previous => status === 403 || status === 404 ? { status: 'unsupported' } : previous.status === 'ready' ? previous : { status: 'failed', error })
    }
  }, [plans])
  useEffect(() => {
    const controller = new AbortController(); let active = true
    queueMicrotask(() => { if (active) void load(controller.signal) })
    return () => { active = false; controller.abort() }
  }, [load])
  return [state, load] as const
}
