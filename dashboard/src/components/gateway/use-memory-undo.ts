import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createMemoryForgetRequest, type GatewayControlClient } from '@/lib/gateway/control'
import { createMemoryUndo, type MemoryUndoState } from '@/lib/chat/memory-undo'

/** Undo for the "Remembered" note; absent without an owner control client. */
export function useMemoryUndo(control: GatewayControlClient | undefined, refresh: (messageId: string) => void) {
  const [status, setStatus] = useState<Record<string, MemoryUndoState>>({})
  const run = useRef<ReturnType<typeof createMemoryUndo> | null>(null)
  const latest = useRef(refresh)
  useLayoutEffect(() => { latest.current = refresh }, [refresh])
  useEffect(() => {
    if (!control) return
    const controller = new AbortController()
    run.current = createMemoryUndo({ control, createRequest: createMemoryForgetRequest, signal: controller.signal,
      publish: (messageId, value) => setStatus(values => ({ ...values, [messageId]: value })), refresh: messageId => latest.current(messageId) })
    return () => { controller.abort(); run.current = null }
  }, [control])
  const undo = useCallback((messageId: string, memoryId: string) => { void run.current?.(messageId, memoryId) }, [])
  return { status, undo: control ? undo : undefined }
}
