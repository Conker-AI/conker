import type { RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { readRuntimeWithDeadline, type ReadTiming } from './runtime-read-deadline'

/** Explicit history reads share an invalidation generation with the quiet observer. */
export function createRuntimeDetailReader(options: ReadTiming & {
  read: (id: string, signal: AbortSignal) => Promise<RuntimeSessionDetail>
  scope: (id: string) => string | null
  apply: (detail: RuntimeSessionDetail) => void
  pending: (value: boolean) => void
  failure: (error: unknown | null) => void
}) {
  let generation = 0, controller: AbortController | null = null
  function cancel(notify = true) {
    generation++; controller?.abort(); controller = null
    if (notify) options.pending(false)
  }
  return {
    cancel, generation: () => generation,
    async refresh(id: string) {
      const scope = options.scope(id)
      if (scope === null) return false
      cancel(false)
      const ticket = generation, request = new AbortController()
      controller = request; options.pending(true); options.failure(null)
      const current = () => !request.signal.aborted && ticket === generation && options.scope(id) === scope
      try {
        const detail = await readRuntimeWithDeadline(signal => options.read(id, signal), request, options)
        if (!current()) return false
        options.apply(detail)
        return true
      } catch (error) { if (ticket === generation && options.scope(id) === scope) options.failure(error); return false }
      finally { if (controller === request) { controller = null; options.pending(false) } }
    },
  }
}
