import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayAgentNote, GatewayJobsClient } from '@/lib/gateway/jobs'

export type AgentNotesClient = Pick<GatewayJobsClient, 'agentNotes' | 'dismissNote'>

/** What AI jobs found, until opened. A failed read keeps the last list. */
export function useAgentNotes(client: AgentNotesClient | undefined, active: boolean) {
  const [items, setItems] = useState<GatewayAgentNote[] | null>(null), [error, setError] = useState<unknown>(null)
  const generation = useRef(0)
  const load = useCallback(async () => {
    if (!client) return
    const current = ++generation.current
    try { const notes = await client.agentNotes(); if (current === generation.current) { setItems(notes); setError(null) } }
    catch (cause) { if (current === generation.current) setError(cause) }
  }, [client])
  useEffect(() => {
    let live = true
    if (active) queueMicrotask(() => { if (live) void load() })
    return () => { live = false }
  }, [active, load])
  // Opening the chat is reading the note: it leaves the Inbox; the chat keeps the full reply.
  const open = useCallback((note: GatewayAgentNote) => {
    setItems(current => current?.filter(item => item.id !== note.id) ?? current)
    void client?.dismissNote(note.id).catch(() => { void load() })
  }, [client, load])
  // Answered once the first read came back (or failed); no client means nothing to wait for.
  return { items: client ? items ?? [] : [], answered: !client || items !== null || error !== null, error, load, open }
}
