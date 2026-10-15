export type ReadTimer = number | ReturnType<typeof setTimeout>
export type ReadTiming = {
  schedule?: (run: () => void, delay: number) => ReadTimer
  unschedule?: (timer: ReadTimer) => void
  timeout?: number
}

/** Abort and settle even when a transport ignores cancellation. Late replies stay detached. */
export function readRuntimeWithDeadline<T>(action: (signal: AbortSignal) => Promise<T>, request: AbortController, timing: ReadTiming = {}): Promise<T> {
  const schedule = timing.schedule ?? ((run, delay) => setTimeout(run, delay))
  const unschedule = timing.unschedule ?? (timer => clearTimeout(timer))
  return new Promise((resolve, reject) => {
    if (request.signal.aborted) { reject(new Error('History read interrupted or timed out')); return }
    let settled = false
    const deadline = schedule(() => request.abort(), timing.timeout ?? 15_000)
    const finish = (complete: () => void) => {
      if (settled) return
      settled = true
      unschedule(deadline)
      request.signal.removeEventListener('abort', abort)
      complete()
    }
    const abort = () => finish(() => reject(new Error('History read interrupted or timed out')))
    request.signal.addEventListener('abort', abort, { once: true })
    try { action(request.signal).then(value => finish(() => resolve(value)), error => finish(() => reject(error))) }
    catch (error) { finish(() => reject(error)) }
  })
}
