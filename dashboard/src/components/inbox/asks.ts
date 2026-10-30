import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsksClient, ConkerAsk } from '@/lib/gateway/asks'
import { gatewayError } from '@/lib/gateway/transport'
import type { RequestNotice } from './change-requests'

/** Conker's open questions and his answers; an answer goes to that chat as his next message. */
export function useAsks(client: AsksClient | undefined, active: boolean) {
  const [items, setItems] = useState<ConkerAsk[] | null>(null), [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState<string | null>(null), [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<RequestNotice | null>(null)
  const generation = useRef(0)
  const load = useCallback(async () => {
    if (!client) return
    const current = ++generation.current
    try { const found = await client.list(); if (current === generation.current) { setItems(found); setError(null) } }
    catch (cause) { if (current === generation.current) setError(cause) }
  }, [client])
  useEffect(() => {
    let live = true
    if (active) queueMicrotask(() => { if (live) void load() })
    return () => { live = false }
  }, [active, load])
  const settle = (done: ConkerAsk) => setItems(current => current?.filter(item => item.id !== done.id) ?? current)
  const act = useCallback(async (ask: ConkerAsk, run: () => Promise<ConkerAsk>, done: RequestNotice) => {
    setPending(ask.id); setFailure(null); setNotice(null)
    try { settle(await run()); setNotice(done) }
    catch (cause) { setFailure({ id: ask.id, message: gatewayError(cause).message }) }
    finally { setPending(null) }
  }, [])
  const answer = useCallback((ask: ConkerAsk, text: string, chosen: boolean) => {
    if (!client) return
    void act(ask, () => client.answer(ask.id, text, chosen), { text: 'Sent to the chat. Conker continues there.', link: { to: `/chat?session=${encodeURIComponent(ask.sessionId)}`, label: 'Open the chat' } })
  }, [act, client])
  const dismiss = useCallback((ask: ConkerAsk) => {
    if (!client) return
    void act(ask, () => client.dismiss(ask.id), { text: 'Closed without an answer. Nothing was sent.' })
  }, [act, client])
  // Answered once the first read came back (or failed); no client means nothing to wait for.
  return { items: client ? items ?? [] : [], answered: !client || items !== null || error !== null, error, pending, failure, notice, load, answer, dismiss }
}
