import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
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

  return <section aria-labelledby="proposals-heading" className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-2">
      <h2 id="proposals-heading" className="text-base font-medium">Ideas from Conker</h2>
      <Button size="icon" variant="ghost" aria-label="Refresh ideas" title="Refresh ideas" disabled={pending !== null} onClick={() => void load()}><RefreshCw /></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {items === null && !error && <p role="status" className="text-sm text-muted-foreground">Loading ideas...</p>}
    {items?.length === 0 && <p className="text-sm text-muted-foreground">No new ideas for now. Conker looks once a day, after a model is chosen for Proposals in Settings.</p>}
    {items?.map(item => <Card key={item.id} className="min-w-0" aria-labelledby={`proposal-${item.id}`}>
      <CardHeader><CardTitle><h3 id={`proposal-${item.id}`} className="break-words [overflow-wrap:anywhere]">{item.title}</h3></CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm leading-6 [overflow-wrap:anywhere]">
        <p><span className="text-muted-foreground">Noticed: </span>{item.noticed}</p>
        <p>{item.suggestion}</p>
        <p><span className="text-muted-foreground">If you accept: </span>{item.ifApproved}</p>
        <Accordion type="single" collapsible><AccordionItem value="why"><AccordionTrigger>Why</AccordionTrigger><AccordionContent>
          <ul className="flex flex-col gap-3">{item.evidence.map(source => <li key={source.messageId} className="min-w-0 break-words text-muted-foreground">{source.available ? <Link className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" to={`/chats?session=${encodeURIComponent(source.sessionId)}&message=${encodeURIComponent(source.messageId)}`}>&ldquo;{source.excerpt}&rdquo;</Link> : <span>This message was forgotten.</span>}</li>)}</ul>
          {!item.evidence.length && <p className="text-muted-foreground">No cited messages are available.</p>}
        </AccordionContent></AccordionItem></Accordion>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap">
        <Button disabled={pending !== null} onClick={() => void decide(item, 'accept')}>Accept</Button>
        <Button variant="outline" disabled={pending !== null} onClick={() => void decide(item, 'decline')}>Not now</Button>
        <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => void decide(item, 'never')}>Never suggest this</Button>
      </CardFooter>
    </Card>)}
  </section>
}
