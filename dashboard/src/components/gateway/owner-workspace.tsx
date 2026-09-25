import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { ArrowLeft, Inbox, RefreshCw } from 'lucide-react'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import { ProposalsPanel } from './proposals-panel'
import { CollectionPanel, CollectionRow, CollectionSection, PageHeader } from '@/components/design-system/primitives'
import { ReferenceSection } from '@/components/reference-section'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OwnerDecisionError, type GatewayOwnerClient, type OwnerDecision, type OwnerRequest } from '@/lib/gateway/owner'
import { gatewayError } from '@/lib/gateway/transport'
import { canReleaseExpiredOwnerDecision, ownerDecisionEligibility, ownerUnavailableText, type GatewayOwnerState } from './owner-state'

const label = (value: string) => value.replaceAll('_', ' ')
const timestamp = (value: string) => new Date(value).toLocaleString()
export function GatewayOwnerWorkspace({ client, proposals, state, active }: { client: GatewayOwnerClient; proposals?: GatewayProposalClient; state: GatewayOwnerState; active: boolean }) {
  const [params] = useSearchParams(), requestId = params.get('request')
  const retained = useStore(state)
  const [rows, setRows] = useState<OwnerRequest[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<OwnerRequest | null>(null), [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const mounted = useRef(false), generation = useRef(0), controllers = useRef(new Set<AbortController>())
  const selectedId = useRef(requestId)
  useEffect(() => { selectedId.current = requestId }, [requestId])
  const busy = retained.pendingId !== null, attempt = requestId ? retained.attempts[requestId] : undefined
  const current = selected?.id === requestId ? selected : null, note = requestId ? retained.notes[requestId] ?? '' : ''
  const request = useCallback(async <T,>(read: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController(); controllers.current.add(controller)
    try { return await read(controller.signal) } finally { controllers.current.delete(controller) }
  }, [])
  useEffect(() => { mounted.current = true; const pending = controllers.current; return () => { mounted.current = false; for (const controller of pending) controller.abort() } }, [])
  const load = useCallback(async (more = false, nextCursor?: string | null) => {
    const ticket = ++generation.current, epoch = state.getState().epoch
    setLoading(true); setError(null); setNotice(null)
    try {
      if (requestId) {
        const row = await request(signal => client.getRequest(requestId, { signal }))
        if (!mounted.current || ticket !== generation.current || epoch !== state.getState().epoch) return
        setSelected(row)
        const saved = state.getState().attempts[requestId]
        if (saved) {
          state.setState(value => {
            const attempts = { ...value.attempts }
            if (row.status !== 'pending') delete attempts[requestId]
            else attempts[requestId] = { ...saved, checked: true }
            return { attempts }
          })
          setNotice(row.status === 'pending' ? 'The request is still pending. That does not prove the earlier decision was unsent. Only the identical decision may be retried.' : `ToolGate records this request as ${label(row.status)}. Inspect the recorded decision below.`)
        }
      } else {
        const page = await request(signal => client.listRequests({ limit: 50, ...(more && nextCursor ? { cursor: nextCursor } : {}), signal }))
        if (!mounted.current || ticket !== generation.current || epoch !== state.getState().epoch) return
        setRows(values => more ? [...new Map([...values, ...page.results].map(row => [row.id, row])).values()] : page.results)
        setCursor(page.nextCursor)
      }
    } catch (failure) { if (mounted.current && ticket === generation.current && epoch === state.getState().epoch) setError(gatewayError(failure).message) }
    finally { if (mounted.current && ticket === generation.current && epoch === state.getState().epoch) setLoading(false) }
  }, [client, request, requestId, state])
  useEffect(() => {
    let cancelled = false
    if (active) queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true; generation.current++ }
  }, [active, load])
  useEffect(() => {
    if (!active || !current || current.status !== 'pending') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, current])
  useEffect(() => {
    if (!Object.values(retained.notes).some(Boolean) && !Object.keys(retained.attempts).length && !retained.pendingId) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [retained.notes, retained.attempts, retained.pendingId])
  async function decide(status: OwnerDecision, retry = false) {
    if (!current || state.getState().pendingId || loading) return
    const id = current.id, epoch = state.getState().epoch, previous = state.getState().attempts[id]
    const eligibility = ownerDecisionEligibility(current, Date.now())
    if (retry ? !previous?.checked || previous.status !== status : Boolean(previous) || !(status === 'approved' ? eligibility.approve : eligibility.reject)) return
    const submittedNote = retry ? previous!.note : note
    state.setState({ pendingId: id }); setError(null); setNotice(null)
    try {
      const updated = await request(signal => client.decide(id, status, submittedNote, { signal }))
      if (!mounted.current || state.getState().epoch !== epoch) return
      if (selectedId.current === id) { generation.current++; setLoading(false); setSelected(updated) }
      state.setState(value => { const attempts = { ...value.attempts }; delete attempts[id]; const notes = { ...value.notes }; if (notes[id] === submittedNote) delete notes[id]; return { attempts, notes } })
      if (selectedId.current === id) setNotice(`Decision recorded: ${label(updated.status)}. This does not start or resume the action.`)
    } catch (failure) {
      if (!mounted.current || state.getState().epoch !== epoch) return
      if (selectedId.current === id) { generation.current++; setLoading(false); setError(failure instanceof OwnerDecisionError ? failure.message : gatewayError(failure).message) }
      if (!(failure instanceof OwnerDecisionError) || failure.outcome !== 'rejected') state.setState(value => ({ attempts: { ...value.attempts, [id]: { status, note: submittedNote, checked: false, conflict: failure instanceof OwnerDecisionError && failure.outcome === 'conflict' } } }))
    } finally { if (state.getState().epoch === epoch) state.setState({ pendingId: null }) }
  }
  const filtered = rows.filter(row => `${row.title} ${row.actor} ${row.status} ${row.action.subjectId ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const eligibility = current ? ownerDecisionEligibility(current, now) : null
  const feedback = <>{notice && <p role="status" className="rounded-lg border bg-muted p-3 text-sm leading-6">{notice}</p>}{error && <p role="alert" className="text-sm text-destructive">{error} Check the gateway’s owner-channel configuration if this persists.</p>}</>
  return <main className="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title={requestId ? 'Review request' : 'Inbox'} description={requestId ? 'Inspect the exact saved action before recording your decision.' : 'ToolGate requests requiring your decision, with recorded outcomes.'} /><Button variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw />{requestId ? 'Check saved request' : 'Refresh requests'}</Button></div>
      {requestId && <Button asChild size="sm" variant="ghost"><Link to="/inbox"><ArrowLeft />All requests</Link></Button>}
      {feedback}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading saved requests…</p>}
      {!requestId && proposals && <ProposalsPanel client={proposals} active={active} />}
      {!requestId ? <><CollectionPanel query={query} onQueryChange={setQuery} count={filtered.length} label="Search loaded requests" placeholder="Search loaded requests…" unit="requests" icon={<Inbox />} emptyTitle={query ? 'No matching requests' : 'No requests loaded'} emptyDescription={query ? 'Try another action, agent or status.' : 'Refresh to check ToolGate. This list contains action verification requests only.'}><CollectionSection title="Action requests">{filtered.map(row => <CollectionRow key={row.id} to={`/inbox?request=${encodeURIComponent(row.id)}`} title={row.title || 'Action verification'} description={`${row.actor} · ${row.action.subjectId ?? 'Unavailable action'}`} trailing={<Badge variant="outline">{label(row.status)}</Badge>} />)}</CollectionSection></CollectionPanel>{cursor && <Button variant="outline" disabled={loading} onClick={() => void load(true, cursor)}>Load older requests</Button>}<p className="text-xs text-muted-foreground">Search covers loaded records. Decisions do not automatically continue a paused run.</p></> : current && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <section className="min-w-0 space-y-5 rounded-xl border bg-card p-5" aria-label="Exact action"><div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{label(current.status)}</Badge><span className="text-xs text-muted-foreground">Requested by {current.actor}</span></div><h2 className="break-words text-lg font-semibold">{current.title || 'Action verification'}</h2><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{current.details}</p></div><ReferenceSection title="Saved action"><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">Type</dt><dd className="break-words">{current.action.subjectType ?? 'Unavailable'}</dd><dt className="text-muted-foreground">Target</dt><dd className="break-all">{current.action.subjectId ?? 'Unavailable'}</dd><dt className="text-muted-foreground">Version</dt><dd>{current.action.version ?? 'Unavailable'}</dd></dl></ReferenceSection><ReferenceSection title="Exact arguments">{current.action.args === null ? <p className="text-sm text-muted-foreground">Complete arguments are unavailable. Approval is disabled.</p> : <pre className="max-h-96 overflow-auto rounded-lg border bg-muted p-4 text-xs leading-6 whitespace-pre-wrap break-all" tabIndex={0} aria-label="Exact action arguments">{JSON.stringify(current.action.args, null, 2)}</pre>}</ReferenceSection><ReferenceSection title="Record"><p className="break-all text-xs text-muted-foreground">{current.id}</p><p className="text-xs text-muted-foreground">Created {timestamp(current.createdAt)} · Updated {timestamp(current.updatedAt)}</p>{current.approval.expiresAt && <p className="text-xs text-muted-foreground">Approval expires {timestamp(current.approval.expiresAt)}</p>}{current.approval.consumedAt && <p className="text-xs text-muted-foreground">Consumed {timestamp(current.approval.consumedAt)}</p>}</ReferenceSection></section>
        <section className="min-w-0 space-y-4 rounded-xl border bg-card p-5" aria-label="Your decision"><h2 className="font-semibold">Your decision</h2>{current.unavailableReason && <p className="text-sm leading-6 text-muted-foreground">{ownerUnavailableText[current.unavailableReason]}</p>}{eligibility?.expired && !current.unavailableReason && current.status === 'pending' && <p className="text-sm leading-6 text-muted-foreground">The approval window has expired. Refresh this record before continuing.</p>}{current.decision && <ReferenceSection title="Recorded decision"><p className="text-sm">{label(current.decision.status)} · {current.decision.actor}</p><p className="text-xs text-muted-foreground">{timestamp(current.decision.at)}</p>{current.decision.note && <p className="whitespace-pre-wrap break-words text-sm">{current.decision.note}</p>}</ReferenceSection>}{attempt ? <div className="space-y-3"><p className="text-sm leading-6">A {label(attempt.status)} decision may already have been saved. Check the request before trying again.</p><Button variant="outline" disabled={busy || loading} onClick={() => void load()}>Check decision outcome</Button>{canReleaseExpiredOwnerDecision(current, attempt) ? <Button variant="outline" disabled={busy || loading} onClick={() => { state.setState(value => { const attempts = { ...value.attempts }; delete attempts[current.id]; return { attempts } }); setError(null); setNotice('The approval attempt was declined and ToolGate confirms this request has expired. You can now reject or dismiss the expired request.') }}>Review expired request</Button> : attempt.checked && current.status === 'pending' && <Button disabled={busy || loading} onClick={() => void decide(attempt.status, true)}>Retry identical decision</Button>}</div> : current.status === 'pending' && <><div className="space-y-2"><Label htmlFor="owner-decision-note">Note (optional)</Label><Textarea id="owner-decision-note" value={note} maxLength={2000} disabled={busy || loading} onChange={event => state.setState(value => ({ notes: { ...value.notes, [current.id]: event.target.value } }))} placeholder="Why this decision fits your request…" /></div><p className="text-xs leading-5 text-muted-foreground">Approval permits this exact action to be consumed once before expiry. It does not run it. Your owner password is required to record any decision.</p><div className="flex flex-wrap gap-2"><Button disabled={busy || loading || !eligibility?.approve} onClick={() => void decide('approved')}>Approve action</Button><Button variant="outline" disabled={busy || loading || !eligibility?.reject} onClick={() => void decide('rejected')}>Reject</Button><Button variant="ghost" disabled={busy || loading || !eligibility?.reject} onClick={() => void decide('dismissed')}>Dismiss</Button></div></>}{busy && <p role="status" className="text-xs text-muted-foreground">Waiting for verification or the recorded decision…</p>}</section>
      </div>}
    </div>
  </main>
}
