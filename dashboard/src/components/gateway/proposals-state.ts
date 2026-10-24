import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayProposalClient, Proposal, ProposalDecision } from '@/lib/gateway/proposals'
import { gatewayError } from '@/lib/gateway/transport'

export const proposalOutcome: Record<ProposalDecision, string> = {
  accept: 'Accepted. Nothing runs until you set it up or approve an action.',
  decline: 'Declined. Conker will hold this idea back for 30 days.',
  never: 'Got it. Conker will not suggest this idea again; if a reworded version appears, decline it too.',
}

/** Ideas from the nightly pass: load, decide and report, for the Inbox to show as cards. */
export function useProposals(client: GatewayProposalClient | undefined, active: boolean) {
  const [items, setItems] = useState<Proposal[] | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  /** The list failed to load (shown with InlineError and Try again). */
  const [error, setError] = useState<unknown>(null)
  /** A decision failed; shown beside the card's actions. */
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mounted = useRef(true)
  const load = useCallback(async () => {
    if (!client) return
    try { const rows = await client.list(); if (mounted.current) { setItems(rows); setError(null) } }
    catch (failure) { if (mounted.current) setError(failure) }
  }, [client])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    if (active && client) queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [active, client, load])
  const decide = useCallback(async (item: Proposal, decision: ProposalDecision) => {
    if (!client) return
    setPending(item.id); setFailure(null); setNotice(null)
    try {
      await client.decide(item.id, decision)
      if (!mounted.current) return
      setItems(rows => rows?.filter(row => row.id !== item.id) ?? rows)
      setNotice(proposalOutcome[decision])
    } catch (problem) {
      if (mounted.current) setFailure({ id: item.id, message: `${gatewayError(problem).message} Refresh to see the saved decision.` })
    } finally { if (mounted.current) setPending(null) }
  }, [client])
  return { items, pending, error, failure, notice, load, decide }
}
