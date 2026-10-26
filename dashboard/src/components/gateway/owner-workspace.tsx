import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { ArrowLeft, CheckCheck, RefreshCw } from 'lucide-react'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import { IdeaCard } from './proposals-panel'
import { useProposals } from './proposals-state'
import { CollectionRow, CollectionSection, PageHeader, WorkspaceAction } from '@/components/design-system/primitives'
import { FilterChip } from '@/components/design-system/list-card'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import { useLater } from '@/components/inbox/later'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { GatewayPageFrame } from './page-frame'
import { ApprovalCard } from '@/components/inbox/approval-card'
import { AgentNoteCard } from '@/components/inbox/agent-note-card'
import { ChangeRequestCard } from '@/components/inbox/change-request-card'
import { useChangeRequests } from '@/components/inbox/change-requests'
import { HandledList } from '@/components/inbox/handled-list'
import type { AccessClient } from '@/lib/gateway/access'
import type { ChangeRequestsClient } from '@/lib/gateway/change-requests'
import type { GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'
import { useAgentNotes, type AgentNotesClient } from '@/components/inbox/agent-notes'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { OwnerDecisionError, type GatewayOwnerClient, type OwnerDecision, type OwnerRequest } from '@/lib/gateway/owner'
import { gatewayError } from '@/lib/gateway/transport'
import { ownerDecisionEligibility, type GatewayOwnerState } from './owner-state'

const label = (value: string) => value.replaceAll('_', ' ')
export function GatewayOwnerWorkspace({ client, proposals, checks, changes, drafts, access, state, active }: { client: GatewayOwnerClient; proposals?: GatewayProposalClient; checks?: AgentNotesClient; changes?: ChangeRequestsClient; drafts?: GatewayEditorDrafts; access?: AccessClient; state: GatewayOwnerState; active: boolean }) {
  const [params] = useSearchParams(), requestId = params.get('request')
  const retained = useStore(state)
  const [rows, setRows] = useState<OwnerRequest[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<OwnerRequest | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [filter, setFilter] = useState<'all' | 'decisions' | 'ideas' | 'checks'>('all')
  const [undo, setUndo] = useState<{ key: string; title: string } | null>(null)
  const ideas = useProposals(proposals, active && !requestId)
  const notes = useAgentNotes(checks, active && !requestId)
  const requests = useChangeRequests(changes, drafts, active && !requestId)
  const { isLater, later, restore } = useLater()
  const [now, setNow] = useState(Date.now)
  const mounted = useRef(false), generation = useRef(0), controllers = useRef(new Set<AbortController>())
  const selectedId = useRef(requestId)
  useEffect(() => { selectedId.current = requestId }, [requestId])
  const busy = retained.pendingId !== null
  const current = selected?.id === requestId ? selected : null
  const invalidateLoad = useCallback(() => { generation.current += 1 }, [])
  const request = useCallback(async <T,>(read: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController(); controllers.current.add(controller)
    try { return await read(controller.signal) } finally { controllers.current.delete(controller) }
  }, [])
  useEffect(() => { mounted.current = true; const pending = controllers.current; return () => { mounted.current = false; for (const controller of pending) controller.abort() } }, [])
  const load = useCallback(async (more = false, nextCursor?: string | null, checkedId = requestId) => {
    const ticket = ++generation.current, epoch = state.getState().epoch
    setLoading(true); setError(null); setNotice(null); setLoadError(null)
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
          setNotice(row.status === 'pending' ? 'The request is still pending. That does not prove the earlier decision was unsent. Only the identical decision may be retried.' : `This request is ${label(row.status)}. ${requestId ? 'Inspect the recorded decision below.' : 'Find its recorded decision in Earlier.'}`)
        }
      } else {
        const page = await request(signal => client.listRequests({ limit: 50, ...(more && nextCursor ? { cursor: nextCursor } : {}), signal }))
        if (!mounted.current || ticket !== generation.current || epoch !== state.getState().epoch) return
        setRows(values => more ? [...new Map([...values, ...page.results].map(row => [row.id, row])).values()] : page.results)
        setCursor(page.nextCursor)
      }
    } catch (failure) { if (mounted.current && ticket === generation.current && epoch === state.getState().epoch) setLoadError(failure) }
    finally { if (mounted.current && ticket === generation.current && epoch === state.getState().epoch) setLoading(false) }
  }, [client, request, requestId, state])
  useEffect(() => {
    let cancelled = false
    if (active) queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true; invalidateLoad() }
  }, [active, invalidateLoad, load])
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
  const earlier = (row: OwnerRequest) => row.status !== 'pending' || ownerDecisionEligibility(row, now).expired
  // Keep uncertain attempts visible until the owner checks their saved outcome.
  const pendingRows = rows.filter(row => !earlier(row) || retained.attempts[row.id])
  const earlierRows = rows.filter(row => earlier(row) && !retained.attempts[row.id])
  const decisionKey = (id: string) => `decision:${id}`, ideaKey = (id: string) => `idea:${id}`, checkKey = (id: string) => `check:${id}`, changeKey = (id: string) => `change:${id}`
  const nowDecisions = pendingRows.filter(row => retained.attempts[row.id] || !isLater(decisionKey(row.id)))
  const laterDecisions = pendingRows.filter(row => !retained.attempts[row.id] && isLater(decisionKey(row.id)))
  const nowIdeas = (ideas.items ?? []).filter(item => !isLater(ideaKey(item.id)))
  const laterIdeas = (ideas.items ?? []).filter(item => isLater(ideaKey(item.id)))
  const nowNotes = notes.items.filter(item => !isLater(checkKey(item.id))), laterNotes = notes.items.filter(item => isLater(checkKey(item.id)))
  const showDecisions = filter === 'all' || filter === 'decisions', showIdeas = filter === 'all' || filter === 'ideas', showNotes = filter === 'all' || filter === 'checks'
  const nowChanges = requests.items.filter(item => !isLater(changeKey(item.id))), laterChanges = requests.items.filter(item => isLater(changeKey(item.id)))
  const needsCount = nowDecisions.length + nowChanges.length + nowIdeas.length + nowNotes.length
  const today = new Date(now).toDateString()
  const decidedToday = rows.filter(row => row.decision && new Date(row.decision.at).toDateString() === today).length
  const moveLater = (key: string, title: string) => { later(key); setUndo({ key, title }) }
  const card = (row: OwnerRequest, detail = false) => <ApprovalCard key={row.id} request={row} now={now} detail={detail}
    note={retained.notes[row.id] ?? ''} attempt={retained.attempts[row.id]} busy={busy || loading} processing={retained.pendingId === row.id}
    onNote={note => state.setState(value => ({ notes: { ...value.notes, [row.id]: note } }))}
    onDecide={(status, retry) => void decide(row, status, retry)} onCheck={() => void load(false, undefined, row.id)}
    onRelease={() => { state.setState(value => { const attempts = { ...value.attempts }; delete attempts[row.id]; return { attempts } }); setError(null); setNotice('The approval attempt was declined and this request has expired. Nothing was done.') }}
    onLater={() => moveLater(decisionKey(row.id), row.title || 'Review this action')} />
  const refresh = () => { void load(); if (!requestId) { void ideas.load(); void notes.load(); void requests.load() } }
  const refreshButton = <WorkspaceAction iconOnly aria-label={requestId ? 'Check saved request' : 'Refresh Inbox'} title={requestId ? 'Check saved request' : 'Refresh Inbox'} disabled={loading || busy} onClick={refresh}><RefreshCw /></WorkspaceAction>
  const chip = (value: typeof filter, text: string, count: number) => <FilterChip key={value} active={filter === value} count={count} onClick={() => setFilter(value)}>{text}</FilterChip>
  const laterCount = (showDecisions ? laterDecisions.length + laterChanges.length : 0) + (showIdeas ? laterIdeas.length : 0) + (showNotes ? laterNotes.length : 0)
  return <GatewayPageFrame className="h-full">
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-5">
      {!requestId && <PageHeader title="Inbox" actionsOnly actions={refreshButton} />}
      {requestId ? <div className="flex items-center justify-between gap-3"><Button size="sm" variant="ghost" render={<Link to="/inbox" />}><ArrowLeft />Inbox</Button>{refreshButton}</div> : <>
        <div className="flex flex-col gap-3">
          {/* A failed load is never summarized as "All clear". */}
          <p className="text-sm text-muted-foreground">{loadError !== null || ideas.error !== null ? 'Part of your Inbox didn’t load' : needsCount ? `${needsCount} ${needsCount === 1 ? 'needs' : 'need'} you` : 'All clear'}{loadError === null && <> · {decidedToday} decided today</>}</p>
          {loadError === null && <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
            {chip('all', 'All', needsCount)}{chip('decisions', 'Decisions', nowDecisions.length + nowChanges.length)}{chip('ideas', 'Ideas', nowIdeas.length)}{notes.items.length > 0 && chip('checks', 'From AI jobs', nowNotes.length)}
          </div>}
        </div>
      </>}
      {notice && <p role="status" className="text-sm leading-6 text-muted-foreground">{notice}</p>}
      {ideas.notice && !requestId && <p role="status" className="text-sm leading-6 text-muted-foreground">{ideas.notice}</p>}
      {requests.notice && !requestId && <p role="status" className="text-sm leading-6 text-muted-foreground">{requests.notice.text}{requests.notice.link && <> <Link className="font-medium text-foreground underline underline-offset-4" to={requests.notice.link.to}>{requests.notice.link.label}</Link></>}</p>}
      {undo && !requestId && <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Moved “{undo.title}” to Later.
        <Button type="button" size="xs" variant="outline" onClick={() => { restore(undo.key); setUndo(null) }}>Undo</Button></p>}
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error} Check the gateway&apos;s owner-channel configuration if this persists.</p>}
      {loadError !== null && <InlineError error={loadError} onRetry={() => load()} />}
      {requestId ? (current ? card(current, true) : loading && <ListSkeleton rows={2} label="Loading the request…" />) : <>
        {showIdeas && ideas.error !== null && <InlineError error={ideas.error} title="Ideas didn’t load" onRetry={() => ideas.load()} />}
        {loading && !rows.length && <ListSkeleton rows={3} label="Loading your Inbox…" />}
        {showDecisions && requests.error !== null && <InlineError error={requests.error} title="Conker’s requests didn’t load" onRetry={() => requests.load()} />}
        {(showDecisions && (nowDecisions.length > 0 || nowChanges.length > 0)) || (showIdeas && nowIdeas.length > 0) || (showNotes && nowNotes.length > 0) ? <section aria-label="Needs you" className="flex flex-col gap-3">
          {showDecisions && nowDecisions.map(row => card(row))}
          {showDecisions && nowChanges.map(request => <ChangeRequestCard key={request.id} request={request} now={now} busy={requests.pending === request.id} error={requests.failure?.id === request.id ? requests.failure.message : null}
            onApprove={() => void requests.approve(request)} onDecline={() => void requests.decline(request)} onLater={() => moveLater(changeKey(request.id), request.title)} />)}
          {showNotes && nowNotes.map(note => <AgentNoteCard key={note.id} note={note} now={now} onOpen={() => notes.open(note)} onLater={() => moveLater(checkKey(note.id), note.title)} />)}
          {showIdeas && nowIdeas.map(item => <IdeaCard key={item.id} item={item} pending={ideas.pending !== null} failure={ideas.failure?.id === item.id ? ideas.failure.message : null}
            onDecide={decision => void ideas.decide(item, decision)} onLater={() => moveLater(ideaKey(item.id), item.title)} />)}
        </section> : !loading && loadError === null && <Empty className="py-10 md:py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CheckCheck className="text-success-foreground" /></EmptyMedia>
            <EmptyTitle>{filter === 'all' ? 'Nothing needs you' : filter === 'decisions' ? 'No decisions waiting' : filter === 'checks' ? 'Nothing new from your AI jobs' : 'No new ideas'}</EmptyTitle>
            <EmptyDescription>{filter === 'ideas' ? 'Conker looks once a day, after a model is chosen for Proposals in Settings.' : `You decided ${decidedToday} today. New requests from Conker appear here.`}</EmptyDescription>
          </EmptyHeader>
        </Empty>}
        {laterCount > 0 && <section aria-labelledby="inbox-later" className="flex flex-col gap-2">
          <h2 id="inbox-later" className="text-sm font-medium text-muted-foreground">Later <span className="tabular-nums">{laterCount}</span></h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {[...(showDecisions ? laterDecisions.map(row => ({ key: decisionKey(row.id), title: row.title || 'Review this action', kind: 'Permission' })) : []),
              ...(showDecisions ? laterChanges.map(item => ({ key: changeKey(item.id), title: item.title, kind: 'Conker’s request' })) : []),
              ...(showIdeas ? laterIdeas.map(item => ({ key: ideaKey(item.id), title: item.title, kind: 'Idea' })) : []),
              ...(showNotes ? laterNotes.map(item => ({ key: checkKey(item.id), title: item.title, kind: 'AI job' })) : [])].map(item => <li key={item.key} className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.title}</span><span className="shrink-0 text-xs text-muted-foreground">{item.kind}</span>
              <Button type="button" size="xs" variant="ghost" onClick={() => restore(item.key)}>Bring back</Button>
            </li>)}
          </ul>
          <p className="text-xs text-muted-foreground">Later only reorders your Inbox. Nothing is decided, and a permission still expires on its own.</p>
        </section>}
        <Accordion>{access && <AccordionItem value="handled"><AccordionTrigger>Handled</AccordionTrigger><AccordionContent><HandledList client={access} now={now} /></AccordionContent></AccordionItem>}<AccordionItem value="earlier"><AccordionTrigger>Earlier</AccordionTrigger><AccordionContent>
          <CollectionSection title="Past requests">{earlierRows.map(row => <CollectionRow key={row.id} to={`/inbox?request=${encodeURIComponent(row.id)}`} title={row.title || 'Review this action'} description={row.status === 'pending' ? 'This request expired. Nothing was done.' : label(row.status)} />)}</CollectionSection>
          {!earlierRows.length && <p className="text-sm text-muted-foreground">No earlier requests.</p>}
          {cursor && <Button variant="outline" disabled={loading || busy} onClick={() => void load(true, cursor)}>Load older requests</Button>}
        </AccordionContent></AccordionItem></Accordion>
        <p className="text-xs text-muted-foreground">Decisions do not automatically continue a paused run.</p>
      </>}
    </div>
  </GatewayPageFrame>
}
