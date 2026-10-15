import type { MemoryDelivery, MemoryDeliveryRead } from '@/lib/gateway/memory-delivery'

export type MemoryDeliveryWatchState = {
  phase: 'checking' | 'ready' | 'paused' | 'error'
  receipts: Record<string, MemoryDelivery>
  truncated: boolean
}
export const memoryCheckDelays = [0, 1000, 2000, 4000, 8000, 15000] as const
type Timer = number | ReturnType<typeof setTimeout>

/** Bounded, read-only polling. A manual refresh starts another bounded check of the same source. */
export function watchMemoryDelivery(options: {
  read: (signal: AbortSignal, messageId?: string) => Promise<MemoryDeliveryRead>
  available: () => boolean
  publish: (state: MemoryDeliveryWatchState) => void
  forgotten: () => void
  schedule?: (run: () => void, delay: number) => Timer
  unschedule?: (timer: Timer) => void
}) {
  const schedule = options.schedule ?? ((run: () => void, delay: number) => setTimeout(run, delay)), unschedule = options.unschedule ?? ((timer: Timer) => clearTimeout(timer))
  let canceled = false, epoch = 0, controller: AbortController | null = null, timer: Timer | undefined
  let saved: MemoryDeliveryWatchState = { phase: 'checking', receipts: {}, truncated: false }
  const available = () => !canceled && options.available()
  function stop() { epoch++; controller?.abort(); controller = null; if (timer !== undefined) unschedule(timer); timer = undefined }
  function publish(phase: MemoryDeliveryWatchState['phase']) { saved = { ...saved, phase }; if (available()) options.publish(saved) }
  function refresh(messageId?: string) {
    if (!available() || controller) return
    stop()
    const generation = epoch
    let reads = 0
    const poll = async () => {
      if (!available() || generation !== epoch) return
      const request = new AbortController(); controller = request; reads++
      publish('checking')
      try {
        const receipt = await options.read(request.signal, messageId)
        if (request.signal.aborted || !available() || generation !== epoch) return
        if (receipt.forgotten) { stop(); options.forgotten(); return }
        const receipts = { ...saved.receipts }
        if (messageId && !receipt.results.length) delete receipts[messageId]
        for (const result of receipt.results) receipts[result.messageId] = result.delivery
        saved = { ...saved, receipts, truncated: messageId ? saved.truncated : receipt.truncated }
        const pending = receipt.results.some(result => result.delivery.state === 'pending')
        const willCheckAgain = pending && reads < memoryCheckDelays.length
        publish(!willCheckAgain && Object.values(receipts).some(receipt => receipt.state === 'pending') ? 'paused' : 'ready')
        if (willCheckAgain) timer = schedule(() => { void poll() }, memoryCheckDelays[reads])
      } catch { if (!request.signal.aborted && available() && generation === epoch) publish('error') }
      finally { if (controller === request) controller = null }
    }
    // Defer the first publish so starting a watcher never synchronously updates React during an effect.
    timer = schedule(() => { void poll() }, 0)
  }
  refresh()
  return { refresh, cancel: () => { canceled = true; stop() } }
}
