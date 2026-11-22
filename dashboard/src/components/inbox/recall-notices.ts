import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecallNotice, RecallNoticesClient } from '@/lib/gateway/recall-notices'
import { gatewayError } from '@/lib/gateway/transport'

/** Memories he corrected or forgot that earlier answers had used; Dismiss hides the card only. */
export function useRecallNotices(client: RecallNoticesClient | undefined, active: boolean) {
  const [items, setItems] = useState<RecallNotice[] | null>(null),
    [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState<string | null>(null),
    [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  const generation = useRef(0)
  const load = useCallback(async () => {
    if (!client) return
    const current = ++generation.current
    try {
      const found = await client.list()
      if (current === generation.current) {
        setItems(found)
        setError(null)
      }
    } catch (cause) {
      if (current === generation.current) setError(cause)
    }
  }, [client])
  useEffect(() => {
    let live = true
    if (active)
      queueMicrotask(() => {
        if (live) void load()
      })
    return () => {
      live = false
    }
  }, [active, load])
  const dismiss = useCallback(
    async (notice: RecallNotice) => {
      if (!client || pending) return
      setPending(notice.id)
      setFailure(null)
      try {
        await client.dismiss(notice.id)
        setItems(current => current?.filter(item => item.id !== notice.id) ?? current)
      } catch (cause) {
        setFailure({ id: notice.id, message: gatewayError(cause).message })
      } finally {
        setPending(null)
      }
    },
    [client, pending],
  )
  // Answered once the first read came back (or failed); no client means nothing to wait for.
  return { items: client ? (items ?? []) : [], answered: !client || items !== null || error !== null, error, pending, failure, load, dismiss }
}
