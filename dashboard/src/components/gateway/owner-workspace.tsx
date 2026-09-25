import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import { ProposalsPanel } from './proposals-panel'
import { CollectionSearch, CollectionRow, CollectionSection, PageHeader } from '@/components/design-system/primitives'
import { ApprovalCard } from '@/components/inbox/approval-card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { OwnerDecisionError, type GatewayOwnerClient, type OwnerDecision, type OwnerRequest } from '@/lib/gateway/owner'
import { gatewayError } from '@/lib/gateway/transport'
import { ownerDecisionEligibility, type GatewayOwnerState } from './owner-state'

const label = (value: string) => value.replaceAll('_', ' ')
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
  const busy = retained.pendingId !== null
  const current = selected?.id === requestId ? selected : null
  const request = useCallback(async <T,>(read: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController(); controllers.current.add(controller)
    try { return await read(controller.signal) } finally { controllers.current.delete(controller) }
  }, [])
  useEffect(() => { mounted.current = true; const pending = controllers.current; return () => { mounted.current = false; for (const controller of pending) controller.abort() } }, [])
  const load = useCallback(async (more = false, nextCursor?: string | null, checkedId = requestId) => {
    const ticket = ++generation.current, epoch = state.getState().epoch
    setLoading(true); setError(null); setNotice(null)
    try {
      if (checkedId) {
        const row = await request(signal => client.getRequest(checkedId, { signal }))
        if (!mounted.current || ticket !== generation.current || epoch !== state.getState().epoch) return
        if (selectedId.current === checkedId) setSelected(row)
        setRows(values => values.map(value => value.id === row.id ? row : value))
        const saved = state.getState().attempts[checkedId]
        if (saved) {
          state.setState(value => {
            const attempts = { ...value.attempts }
            if (row.status !== 'pending') delete attempts[checkedId]
            else attempts[checkedId] = { ...saved, checked: true }
            return { attempts }
          })
          setNotice(row.status === 'pending' ? 'The request is still pending. That does not prove the earlier decision was unsent. Only the identical decision may be retried.' : `ToolGate records this request as ${label(row.status)}. ${requestId ? 'Inspect the recorded decision below.' : 'Find its recorded decision in Earlier.'}`)
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
    if (!active || !(current?.status === 'pending' || rows.some(row => row.status === 'pending'))) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, current, rows])
  useEffect(() => {
    if (!Object.values(retained.notes).some(Boolean) && !Object.keys(retained.attempts).length && !retained.pendingId) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [retained.notes, retained.attempts, retained.pendingId])
  async function decide(current: OwnerRequest, status: OwnerDecision, retry = false) {
    if (!current || state.getState().pendingId || loading) return
    const id = current.id, epoch = state.getState().epoch, previous = state.getState().attempts[id]
    const eligibility = ownerDecisionEligibility(current, Date.now())
    if (retry ? !previous?.checked || previous.status !== status : Boolean(previous) || !(status === 'approved' ? eligibility.approve : eligibility.reject)) return
    const submittedNote = retry ? previous!.note : state.getState().notes[id] ?? ''
    state.setState({ pendingId: id }); setError(null); setNotice(null)
    try {
      const updated = await request(signal => client.decide(id, status, submittedNote, { signal }))
      if (!mounted.current || state.getState().epoch !== epoch) return
      if (selectedId.current === id) { generation.current++; setLoading(false); setSelected(updated) }
      setRows(values => values.map(row => row.id === id ? updated : row))
      state.setState(value => { const attempts = { ...value.attempts }; delete attempts[id]; const notes = { ...value.notes }; if (notes[id] === submittedNote) delete notes[id]; return { attempts, notes } })
      if (!selectedId.current || selectedId.current === id) setNotice(`Decision recorded: ${label(updated.status)}. This does not start or resume the action.`)
    } catch (failure) {
      if (!mounted.current || state.getState().epoch !== epoch) return
      if (!selectedId.current || selectedId.current === id) { generation.current++; setLoading(false); setError(failure instanceof OwnerDecisionError ? failure.message : gatewayError(failure).message) }
      if (!(failure instanceof OwnerDecisionError) || failure.outcome !== 'rejected') state.setState(value => ({ attempts: { ...value.attempts, [id]: { status, note: submittedNote, checked: false, conflict: failure instanceof OwnerDecisionError && failure.outcome === 'conflict' } } }))
    } finally { if (state.getState().epoch === epoch) state.setState({ pendingId: null }) }
  }
  const filtered = rows.filter(row => `${row.title} ${row.actor} ${row.status} ${row.action.subjectId ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const earlier = (row: OwnerRequest) => row.status !== 'pending' || ownerDecisionEligibility(row, now).expired
  // Keep uncertain attempts visible until the owner checks their saved outcome.
  const pendingRows = filtered.filter(row => !earlier(row) || retained.attempts[row.id])
  const earlierRows = filtered.filter(row => earlier(row) && !retained.attempts[row.id])
  const card = (row: OwnerRequest, detail = false) => <ApprovalCard key={row.id} request={row} now={now} detail={detail}
    note={retained.notes[row.id] ?? ''} attempt={retained.attempts[row.id]} busy={busy || loading} processing={retained.pendingId === row.id}
    onNote={note => state.setState(value => ({ notes: { ...value.notes, [row.id]: note } }))}
    onDecide={(status, retry) => void decide(row, status, retry)} onCheck={() => void load(false, undefined, row.id)}
    onRelease={() => { state.setState(value => { const attempts = { ...value.attempts }; delete attempts[row.id]; return { attempts } }); setError(null); setNotice('The approval attempt was declined and ToolGate confirms this request has expired. Nothing was done.') }} />
  return <main className="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Inbox" description="Things waiting for you." />
        <Button variant="ghost" size="icon" aria-label={requestId ? 'Check saved request' : 'Refresh requests'} title={requestId ? 'Check saved request' : 'Refresh requests'} disabled={loading || busy} onClick={() => void load()}><RefreshCw /></Button>
      </div>
      {requestId && <Button asChild size="sm" variant="ghost" className="self-start"><Link to="/inbox"><ArrowLeft />Inbox</Link></Button>}
      {notice && <p role="status" className="text-sm leading-6 text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error} Check the gateway&apos;s owner-channel configuration if this persists.</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading saved requests...</p>}
      {requestId ? current && card(current, true) : <>
        {(rows.length > 0 || query) && <CollectionSearch value={query} onChange={event => setQuery(event.target.value)} label="Search loaded requests" placeholder="Search requests..." />}
        <section aria-labelledby="approvals-heading" className="flex flex-col gap-4">
          <h2 id="approvals-heading" className="text-base font-medium">Needs your OK</h2>
          {pendingRows.map(row => card(row))}
          {!loading && !error && pendingRows.length === 0 && <p className="text-sm text-muted-foreground">{query ? 'No matching requests.' : "You're all caught up."}</p>}
        </section>
        {proposals && <ProposalsPanel client={proposals} active={active} />}
        <Accordion type="single" collapsible><AccordionItem value="earlier"><AccordionTrigger>Earlier</AccordionTrigger><AccordionContent>
          <CollectionSection title="Past requests">{earlierRows.map(row => <CollectionRow key={row.id} to={`/inbox?request=${encodeURIComponent(row.id)}`} title={row.title || 'Review this action'} description={row.status === 'pending' ? 'This request expired. Nothing was done.' : label(row.status)} />)}</CollectionSection>
          {!earlierRows.length && <p className="text-sm text-muted-foreground">{query ? 'No matching earlier requests.' : 'No earlier requests.'}</p>}
          {cursor && <Button variant="outline" disabled={loading || busy} onClick={() => void load(true, cursor)}>Load older requests</Button>}
        </AccordionContent></AccordionItem></Accordion>
        <p className="text-xs text-muted-foreground">Search covers loaded requests. Decisions do not automatically continue a paused run.</p>
      </>}
    </div>
  </main>
}
