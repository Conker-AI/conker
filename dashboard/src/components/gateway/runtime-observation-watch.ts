import type { RuntimeObservation, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { readRuntimeWithDeadline } from './runtime-read-deadline'

type Timer = number | ReturnType<typeof setTimeout>
export const observationTiming = { active: 2000, idle: 15_000, timeout: 15_000, maxBackoff: 60_000 } as const

/** One serialized read cycle. Metadata never grants permission to send or repeat work. */
export function watchRuntimeObservation(options: {
  observe: (signal: AbortSignal) => Promise<RuntimeObservation>
  detail: (signal: AbortSignal) => Promise<RuntimeSessionDetail>
  available: () => boolean
  version: () => number
  apply: (detail: RuntimeSessionDetail) => void
  forgotten: () => void
  failure: (failed: boolean) => void
  schedule?: (run: () => void, delay: number) => Timer
  unschedule?: (timer: Timer) => void
  timeout?: number
}) {
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay))
  const unschedule = options.unschedule ?? (timer => clearTimeout(timer))
  let stopped = false, generation = 0, failures = 0, active = false
  let revision: number | undefined, controller: AbortController | null = null, timer: Timer | undefined
  const available = () => !stopped && options.available()
  function clearTimer() { if (timer !== undefined) unschedule(timer); timer = undefined }
  function pause() { generation++; clearTimer(); controller?.abort(); controller = null }
  function queue(delay: number) {
    clearTimer()
    if (available()) timer = schedule(() => { timer = undefined; void poll() }, delay)
  }
  async function poll() {
    if (!available() || controller) return
    const request = new AbortController(), ticket = generation, version = options.version()
    controller = request
    const current = () => available() && ticket === generation && version === options.version()
    try {
      const observation = await readRuntimeWithDeadline(options.observe, request, options)
      if (!current() || request.signal.aborted) return
      if (observation.forgotten) { pause(); options.forgotten(); return }
      active = observation.active
      if (revision !== observation.revision) {
        const detail = await readRuntimeWithDeadline(options.detail, request, options)
        if (!current() || request.signal.aborted) return
        if (detail.status === 'forgotten') { pause(); options.forgotten(); return }
        options.apply(detail)
        // Keep the token read BEFORE history, so a write during that read is seen next time.
        revision = observation.revision
      }
      failures = 0; options.failure(false)
    } catch {
      if (current()) { failures++; options.failure(true) }
    } finally {
      if (controller === request) controller = null
      if (available() && ticket === generation) queue(version !== options.version() ? 0 : failures ? Math.min(observationTiming.maxBackoff, 2000 * 2 ** Math.min(failures - 1, 5)) : active ? observationTiming.active : observationTiming.idle)
    }
  }
  queue(0)
  return {
    wake: () => { if (available() && !controller) queue(0) },
    recheck: () => { pause(); if (available()) queue(0) },
    cancel: () => { stopped = true; pause() },
  }
}
