import { useCallback, useEffect, useRef, useState } from 'react'
import { createHostOpId, hostProblem, type GatewayHostOpsClient, type HostAction, type HostProblem, type HostReceipt } from '@/lib/gateway/host-ops'
import { receiptTarget } from '@/lib/server-actions'

/** A start that has no receipt yet: being sent, lost on the way back, or turned down. */
export type ServerAttempt = { id: string; action: HostAction; state: 'sending' | 'lost' | 'problem'; problem?: HostProblem; checking?: boolean }
const POLL_MS = 3000

/**
 * Server action receipts for one screen: the journal (GET /api/host/ops), polling the ones still
 * working until the helper records how they ended, and starting an action with a fresh id. A lost
 * answer stays Unknown with a Check that only reads the receipt by id; nothing is resent by itself.
 */
export function useServerActions(client: GatewayHostOpsClient, onSettled?: (receipt: HostReceipt) => void) {
  const [rows, setRows] = useState<HostReceipt[] | null>(null)
  const [damaged, setDamaged] = useState(0)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [attempts, setAttempts] = useState<Record<string, ServerAttempt>>({})
  const [reachable, setReachable] = useState(true)
  const lifetime = useRef<AbortController | null>(null)
  const settled = useRef(onSettled)
  useEffect(() => { settled.current = onSettled })
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])

  const shown = useRef<HostReceipt[] | null>(null)
  useEffect(() => { shown.current = rows }, [rows])
  const merge = useCallback((receipt: HostReceipt, fresh = false) => {
    const before = shown.current?.find(row => row.id === receipt.id)
    setRows(current => {
      const list = current ?? []
      return list.some(row => row.id === receipt.id) ? list.map(row => row.id === receipt.id ? receipt : row) : [receipt, ...list]
    })
    // Tell the screen once an action has ended, so it reads the server again.
    if (receipt.outcome !== 'working' && (before?.outcome === 'working' || fresh && !before)) settled.current?.(receipt)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const value = await client.receipts(lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return
      setRows(value.operations); setDamaged(value.damagedRecords); setLoadError(null)
    } catch (error) { if (!lifetime.current?.signal.aborted) setLoadError(error) }
  }, [client])
  useEffect(() => { void refresh() }, [refresh])

  // Poll only the receipts still working, while this page is visible. A failed poll keeps the
  // receipt working (a backup can pause this server) and simply asks again.
  const working = (rows ?? []).filter(row => row.outcome === 'working').map(row => row.id).join(' ')
  useEffect(() => {
    if (!working) return
    let timer = 0, stopped = false
    const poll = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        let ok = true
        for (const id of working.split(' ')) {
          try { merge(await client.receipt(id, lifetime.current?.signal)) } catch { ok = false }
          if (stopped) return
        }
        setReachable(ok)
      }
      timer = window.setTimeout(() => void poll(), POLL_MS)
    }
    timer = window.setTimeout(() => void poll(), POLL_MS)
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [client, merge, working])

  const busy = rows?.find(row => row.outcome === 'working') ?? Object.values(attempts).find(item => item.state === 'sending') ?? null

  const start = useCallback(async (action: HostAction) => {
    const id = createHostOpId(), target = receiptTarget(action)
    const set = (value: ServerAttempt | null) => setAttempts(current => {
      const next = { ...current }
      if (value) next[target] = value; else delete next[target]
      return next
    })
    set(null)
    try {
      const receipt = await client.start(id, action, { signal: lifetime.current?.signal, onDispatch: () => set({ id, action, state: 'sending' }) })
      if (lifetime.current?.signal.aborted) return
      set(null); merge(receipt, true)
    } catch (error) {
      if (lifetime.current?.signal.aborted) return
      const problem = hostProblem(error, true)
      if (problem.kind === 'not-sent' && gatewayCancelled(error)) { set(null); return }
      set({ id, action, state: problem.kind === 'lost' ? 'lost' : 'problem', problem })
      // Busy: the action in the way (perhaps started on the server) shows once the journal is read again.
      if (problem.kind === 'busy') void refresh()
    }
  }, [client, merge, refresh])

  /** Reads a lost start back by its id: its receipt, or proof that it never reached the server. */
  const checkAttempt = useCallback(async (target: string) => {
    const attempt = attempts[target]
    if (!attempt || attempt.checking) return
    setAttempts(current => ({ ...current, [target]: { ...attempt, checking: true } }))
    try {
      const receipt = await client.receipt(attempt.id, lifetime.current?.signal)
      setAttempts(current => { const next = { ...current }; delete next[target]; return next })
      merge(receipt, true)
    } catch (error) {
      const problem = hostProblem(error)
      setAttempts(current => ({ ...current, [target]: problem.kind === 'not-found' ? { ...attempt, state: 'problem', problem, checking: false } : { ...attempt, checking: false } }))
    }
  }, [attempts, client, merge])

  const latest = useCallback((target: string) => (rows ?? []).find(row => receiptTarget(row) === target) ?? null, [rows])
  return { rows, damaged, loadError, attempts, busy, reachable, start, checkAttempt, latest, refresh }
}
export type ServerActions = ReturnType<typeof useServerActions>

function gatewayCancelled(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { kind?: string }).kind === 'verification-cancelled'
}
