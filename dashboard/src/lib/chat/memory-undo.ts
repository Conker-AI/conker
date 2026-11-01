import type { GatewayControlClient, MemoryForgetPreview, MemoryForgetRequest } from '@/lib/gateway/control'
import { memoryForgetFailure } from '@/lib/gateway/memory-forget-state'

/** What the owner sees after pressing Undo on a "Remembered" note. */
export type MemoryUndoState = { phase: 'working' | 'forgotten' | 'failed'; message?: string }

/**
 * Undo is the Memory screen's forget flow without its dialog: preview the exact current version,
 * then forget that version. As there, a reviewed request survives an uncertain answer so a retry
 * repeats the same identity, and is dropped only when the memory changed or went away.
 */
export function createMemoryUndo(options: {
  control: Pick<GatewayControlClient, 'forgetPreview' | 'forgetMemory'>
  createRequest: (preview: Pick<MemoryForgetPreview, 'memoryId' | 'revision'>) => MemoryForgetRequest
  publish: (messageId: string, state: MemoryUndoState) => void
  refresh: (messageId: string) => void
  signal?: AbortSignal
}) {
  const requests = new Map<string, MemoryForgetRequest>(), running = new Set<string>()
  return async function undo(messageId: string, memoryId: string): Promise<void> {
    if (running.has(memoryId)) return
    running.add(memoryId)
    const live = () => !options.signal?.aborted
    options.publish(messageId, { phase: 'working' })
    try {
      let request = requests.get(memoryId)
      if (!request) {
        const preview = await options.control.forgetPreview(memoryId, options.signal)
        if (!live()) return
        request = options.createRequest(preview); requests.set(memoryId, request)
      }
      await options.control.forgetMemory(request, options.signal)
      if (!live()) return
      requests.delete(memoryId)
      options.publish(messageId, { phase: 'forgotten' }); options.refresh(messageId)
    } catch (failure) {
      if (!live()) return
      const problem = memoryForgetFailure(failure)
      if (problem.reset || problem.privateUnavailable) requests.delete(memoryId)
      options.publish(messageId, { phase: 'failed', message: problem.message })
      if (!problem.privateUnavailable) options.refresh(messageId)
    } finally { running.delete(memoryId) }
  }
}
