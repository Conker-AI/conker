import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Lightbulb, RefreshCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GatewayProposalClient, Proposal, ProposalDecision } from '@/lib/gateway/proposals'
import { gatewayError } from '@/lib/gateway/transport'

const decided: Record<ProposalDecision, string> = { accept: 'Accepted. Nothing runs until you set it up or approve an action.', decline: 'Declined. Conker will hold this idea back for 30 days.', never: 'Got it. Conker will not suggest this idea again; if a reworded version appears, decline it too.' }

/** Proposals from the nightly pass: what Conker noticed, why, and what approving would mean. */
export function ProposalsPanel({ client, active }: { client: GatewayProposalClient; active: boolean }) {
  const [items, setItems] = useState<Proposal[] | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const mounted = useRef(true)
  const load = useCallback(async () => {
    try { const rows = await client.list(); if (mounted.current) { setItems(rows); setError(null) } }
    catch (failure) { if (mounted.current) setError(gatewayError(failure).message) }
  }, [client])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    if (active) queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [active, load])

  async function decide(item: Proposal, decision: ProposalDecision) {
    setPending(item.id); setError(null); setNotice(null)
    try {
      await client.decide(item.id, decision)
      if (!mounted.current) return
      setItems(rows => rows?.filter(row => row.id !== item.id) ?? rows)
      setNotice(decided[decision])
    } catch (failure) {
      if (mounted.current) setError(`${gatewayError(failure).message} Refresh to see the saved decision.`)
    } finally { if (mounted.current) setPending(null) }
  }

  return <section aria-labelledby="proposals-heading" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="proposals-heading" className="flex items-center gap-2 text-base font-semibold"><Lightbulb className="size-4" />Proposals</h2>
      <Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw />Refresh</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {items === null && !error && <p role="status" className="text-sm text-muted-foreground">Loading proposals…</p>}
    {items?.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm leading-6 text-muted-foreground">Nothing new noticed. Proposals appear after a daily pass once a model is assigned to the Proposals role in Settings.</p>}
    {items?.map(item => <article key={item.id} className="min-w-0 space-y-3 rounded-lg border p-4" aria-labelledby={`proposal-${item.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 id={`proposal-${item.id}`} className="font-medium">{item.title}</h3><Badge variant="outline">Proposal</Badge></div>
      <dl className="space-y-2 text-sm leading-6">
        <div><dt className="text-xs font-medium text-muted-foreground">Noticed</dt><dd>{item.noticed}</dd></div>
        <div><dt className="text-xs font-medium text-muted-foreground">Suggestion</dt><dd>{item.suggestion}</dd></div>
        <div><dt className="text-xs font-medium text-muted-foreground">If you accept</dt><dd>{item.ifApproved}</dd></div>
      </dl>
      <details className="text-sm"><summary className="cursor-pointer rounded-sm text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Why: {item.evidence.length} of your messages</summary>
        <ul className="mt-2 space-y-1">{item.evidence.map(source => <li key={source.messageId} className="min-w-0 break-words text-muted-foreground">{source.available ? <Link className="underline-offset-4 hover:underline" to={`/chats?session=${encodeURIComponent(source.sessionId)}&message=${encodeURIComponent(source.messageId)}`}>“{source.excerpt}”</Link> : <span className="italic">This message was forgotten.</span>}</li>)}</ul>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending !== null} onClick={() => void decide(item, 'accept')}><Check />Accept</Button>
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void decide(item, 'decline')}><X />Not now</Button>
        <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => void decide(item, 'never')}>Never suggest this</Button>
      </div>
    </article>)}
  </section>
}
