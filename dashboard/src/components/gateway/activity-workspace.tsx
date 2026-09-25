import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { Plus, RefreshCw } from 'lucide-react'
import { CollectionEmpty, PageHeader } from '@/components/design-system/primitives'
import { DetailPanel, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GatewayActivityMutationError, createTaskRequestId, type GatewayActivityClient, type GatewayActivityEvent, type GatewayActivityRun, type GatewayTask, type GatewayTaskStatus } from '@/lib/gateway/activity'
import type { GatewayRuntimeClient, RuntimeSession } from '@/lib/gateway/runtime'
import { gatewayError } from '@/lib/gateway/transport'
import { GatewayTaskEditor, GatewayTaskReview } from './activity-forms'
import { GatewayEventDetails, GatewayRunDetails, GatewayTaskDetails } from './activity-details'
import { GatewayEventsTable, GatewayRunsTable, GatewayTasksTable } from './activity-tables'
import { draftFromTask, forgetActivityDrafts, isTerminalTask, maskForgottenTask, reviewDraftKey, taskDraftKey, taskStatusLabels, taskTitle, visibleReferenceRuns, type ActivityMutation, type GatewayActivityWorkspaceState, type ReferenceRunsState } from './activity-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'

type Props = { client: GatewayActivityClient; runtime: GatewayRuntimeClient; state: GatewayActivityWorkspaceState; sourcePrivacy: GatewaySourcePrivacyState; active: boolean; dispatchBlocked?: boolean; retainedTaskId?: string; onWork: (task: GatewayTask) => void }
const uniqueRows = <T extends { id: string }>(old: T[], incoming: T[]) => [...new Map([...old, ...incoming].map(item => [item.id, item])).values()]

export function GatewayActivityWorkspace({ client, runtime, state, sourcePrivacy, active, onWork, dispatchBlocked, retainedTaskId }: Props) {
  const retained = useStore(state), [params, setParams] = useSearchParams()
  const forgottenIds = useStore(sourcePrivacy, value => value.sessionIds)
  const tab = params.get('tab') === 'runs' ? 'runs' : params.get('tab') === 'events' ? 'events' : 'tasks'
  const taskId = params.get('task'), runId = params.get('run'), eventId = params.get('event')
  const taskFilter = params.get('taskId') ?? undefined, runFilter = params.get('runId') ?? undefined, sessionFilter = params.get('sessionId') ?? undefined
  const [tasks, setTasks] = useState<GatewayTask[]>([]), [runs, setRuns] = useState<GatewayActivityRun[]>([]), [events, setEvents] = useState<GatewayActivityEvent[]>([])
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [taskCursor, setTaskCursor] = useState<string | null>(null), [runCursor, setRunCursor] = useState<string | null>(null), [eventCursor, setEventCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<GatewayTask | null>(null), [selectedRun, setSelectedRun] = useState<GatewayActivityRun | null>(null)
  const [selectionPending, setSelectionPending] = useState(false), [selectionError, setSelectionError] = useState<string | null>(null)
  const [filter, setFilter] = useState('active')
  const [referenceRuns, setReferenceRuns] = useState<ReferenceRunsState>({ sessionId: null, runs: [], cursor: null, pending: false, error: null })
  const mounted = useRef(false), controllers = useRef(new Set<AbortController>()), generations = useRef<Record<string, number>>({})
  const busy = retained.mutation?.phase === 'pending'
  const dialog = retained.dialog
  const dialogTaskId = dialog && dialog.kind !== 'create' ? dialog.taskId : null
  const safeTasks = tasks.map(task => forgottenIds.includes(task.sessionId) ? maskForgottenTask(task) : task)
  const safeSelectedTask = selectedTask && forgottenIds.includes(selectedTask.sessionId) ? maskForgottenTask(selectedTask) : selectedTask
  const safeSessions = sessions.map(session => forgottenIds.includes(session.id) ? maskForgottenSession(session) : session)
  const dialogTask = safeSelectedTask?.id === dialogTaskId ? safeSelectedTask : safeTasks.find(task => task.id === dialogTaskId)
  const editorKey = dialog?.kind === 'create' ? taskDraftKey() : taskDraftKey(dialogTaskId ?? undefined)
  const savedEditorDraft = retained.drafts[editorKey]
  const editorDraft = savedEditorDraft && !forgottenIds.includes(savedEditorDraft.sessionId) ? savedEditorDraft : undefined
  const reviewKey = dialog?.kind === 'review' ? reviewDraftKey(dialog.taskId, dialog.status) : ''
  const savedReview = retained.reviews[reviewKey]
  const review = savedReview && !forgottenIds.includes(savedReview.sessionId) ? savedReview : undefined
  const selectedEvent = events.find(event => event.id === eventId)
  const sourceSessionId = dialog?.kind === 'review' ? dialogTask?.sessionId : editorDraft?.sessionId
  const visibleReferences = visibleReferenceRuns(referenceRuns, sourceSessionId)
  const dialogKind = dialog?.kind

  const request = useCallback(async <T,>(action: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController(); controllers.current.add(controller)
    try { return await action(controller.signal) } finally { controllers.current.delete(controller) }
  }, [])
  const mergeTask = useCallback((task: GatewayTask) => {
    if (sourcePrivacy.getState().sessionIds.includes(task.sessionId)) task = maskForgottenTask(task)
    setTasks(values => uniqueRows(values, [task])); setSelectedTask(current => current?.id === task.id ? task : current)
    if (task.contentStatus === 'forgotten') forgetActivityDrafts(state, new Set([task.sessionId]), new Set([task.id]))
  }, [sourcePrivacy, state])
  const forgetSources = useCallback((sessionIds: Set<string>, taskIds: Set<string> = new Set()) => {
    if (!sessionIds.size && !taskIds.size) return
    sourcePrivacy.getState().markForgotten([...sessionIds])
    forgetActivityDrafts(state, sessionIds, taskIds)
    setTasks(values => values.map(task => sessionIds.has(task.sessionId) || taskIds.has(task.id) ? maskForgottenTask(task) : task))
    setSelectedTask(task => task && (sessionIds.has(task.sessionId) || taskIds.has(task.id)) ? maskForgottenTask(task) : task)
    setSessions(values => values.map(session => sessionIds.has(session.id) ? { ...session, title: '', summary: null, status: 'forgotten' } : session))
  }, [sourcePrivacy, state])
  const load = useCallback(async (more = false, cursor?: string | null) => {
    if (!mounted.current) return
    const generation = (generations.current.list ?? 0) + 1; generations.current.list = generation
    setLoading(true); setError(null)
    try {
      const options = { limit: 50, ...(more && cursor ? { cursor } : {}), sessionId: sessionFilter, taskId: taskFilter }
      if (tab === 'tasks') {
        const page = await request(signal => client.listTasks({ limit: 50, sessionId: sessionFilter, ...(more && cursor ? { cursor } : {}), signal }))
        if (!mounted.current || generation !== generations.current.list) return
        const safe = page.results.map(task => sourcePrivacy.getState().sessionIds.includes(task.sessionId) ? maskForgottenTask(task) : task)
        setTasks(values => more ? uniqueRows(values, safe) : safe); setTaskCursor(page.nextCursor)
        const hidden = page.results.filter(task => task.contentStatus === 'forgotten')
        forgetSources(new Set(hidden.map(task => task.sessionId)), new Set(hidden.map(task => task.id)))
      } else if (tab === 'runs') {
        const page = await request(signal => client.listRuns({ ...options, signal }))
        if (!mounted.current || generation !== generations.current.list) return
        setRuns(values => more ? uniqueRows(values, page.results) : page.results); setRunCursor(page.nextCursor)
        forgetSources(new Set(page.results.filter(run => run.contentStatus === 'forgotten').map(run => run.sessionId)))
      } else {
        const page = await request(signal => client.listEvents({ ...options, runId: runFilter, signal }))
        if (!mounted.current || generation !== generations.current.list) return
        setEvents(values => more ? uniqueRows(values, page.results) : page.results); setEventCursor(page.nextCursor)
        forgetSources(new Set(page.results.filter(event => event.contentStatus === 'forgotten').map(event => event.sessionId)))
      }
    } catch (failure) { if (mounted.current && generation === generations.current.list) setError(gatewayError(failure).message) }
    finally { if (mounted.current && generation === generations.current.list) setLoading(false) }
  }, [client, forgetSources, request, runFilter, sessionFilter, sourcePrivacy, tab, taskFilter])
  const loadSelection = useCallback(async (id: string, kind: 'task' | 'run') => {
    if (!mounted.current) return
    const generation = (generations.current.selection ?? 0) + 1; generations.current.selection = generation
    setSelectionPending(true); setSelectionError(null)
    try {
      if (kind === 'task') {
        const response = await request(signal => client.getTask(id, { signal }))
        const task = sourcePrivacy.getState().sessionIds.includes(response.sessionId) ? maskForgottenTask(response) : response
        if (!mounted.current || generation !== generations.current.selection) return
        setSelectedTask(task); mergeTask(task)
        if (task.contentStatus === 'forgotten') forgetSources(new Set([task.sessionId]), new Set([task.id]))
      } else {
        const run = await request(signal => client.getRun(id, { signal }))
        if (!mounted.current || generation !== generations.current.selection) return
        setSelectedRun(run)
        if (run.contentStatus === 'forgotten') forgetSources(new Set([run.sessionId]))
      }
    } catch (failure) { if (mounted.current && generation === generations.current.selection) setSelectionError(gatewayError(failure).message) }
    finally { if (mounted.current && generation === generations.current.selection) setSelectionPending(false) }
  }, [client, forgetSources, mergeTask, request, sourcePrivacy])
  const loadReferences = useCallback(async (sessionId: string, cursor?: string | null) => {
    if (!mounted.current) return
    const generation = (generations.current.refs ?? 0) + 1; generations.current.refs = generation
    setReferenceRuns(current => ({ sessionId, runs: cursor && current.sessionId === sessionId ? current.runs : [], cursor: cursor && current.sessionId === sessionId ? current.cursor : null, pending: true, error: null }))
    try {
      const page = await request(signal => client.listRuns({ sessionId, limit: 50, ...(cursor ? { cursor } : {}), signal }))
      if (!mounted.current || generation !== generations.current.refs) return
      setReferenceRuns(current => ({ sessionId, runs: cursor && current.sessionId === sessionId ? uniqueRows(current.runs, page.results) : page.results, cursor: page.nextCursor, pending: false, error: null }))
      forgetSources(new Set(page.results.filter(run => run.contentStatus === 'forgotten').map(run => run.sessionId)))
    } catch (failure) { if (mounted.current && generation === generations.current.refs) setReferenceRuns(current => ({ ...current, pending: false, error: gatewayError(failure).message })) }
  }, [client, forgetSources, request])
  useEffect(() => { mounted.current = true; const pending = controllers.current; return () => { mounted.current = false; for (const controller of pending) controller.abort(); pending.clear() } }, [])
  useEffect(() => {
    forgetActivityDrafts(state, new Set(sourcePrivacy.getState().sessionIds), new Set())
    return sourcePrivacy.subscribe(value => forgetSources(new Set(value.sessionIds)))
  }, [forgetSources, sourcePrivacy, state])
  useEffect(() => { let current = true; queueMicrotask(() => { if (current && active) void load() }); return () => { current = false } }, [active, load])
  useEffect(() => {
    if (!active) return
    let current = true
    void request(signal => runtime.listSessions({ signal })).then(rows => {
      if (!current || !mounted.current) return
      setSessions(rows.map(session => sourcePrivacy.getState().sessionIds.includes(session.id) ? maskForgottenSession(session) : session))
      forgetSources(new Set(rows.filter(session => session.status === 'forgotten').map(session => session.id)))
    }).catch(failure => { if (current && mounted.current) setError(gatewayError(failure).message) })
    return () => { current = false }
  }, [active, forgetSources, request, runtime, sourcePrivacy])
  useEffect(() => { let current = true; queueMicrotask(() => { if (!current || !active) return; if (taskId) void loadSelection(taskId, 'task'); else if (runId) void loadSelection(runId, 'run') }); return () => { current = false } }, [active, taskId, runId, loadSelection])
  useEffect(() => { let current = true; queueMicrotask(() => { if (current && active && sourceSessionId && dialogKind) void loadReferences(sourceSessionId) }); return () => { current = false } }, [active, sourceSessionId, dialogKind, loadReferences])
  useEffect(() => {
    if (!Object.keys(retained.drafts).length && !Object.keys(retained.reviews).length && !retained.mutation) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [retained.drafts, retained.reviews, retained.mutation])

  const select = useCallback((kind: 'task' | 'run' | 'event', id: string) => {
    setParams(previous => { const next = new URLSearchParams(previous); for (const key of ['task', 'run', 'event']) next.delete(key); next.set('tab', kind === 'task' ? 'tasks' : kind === 'run' ? 'runs' : 'events'); next.set(kind, id); return next })
  }, [setParams])
  const openTask = useCallback((task: GatewayTask) => select('task', task.id), [select])
  const openRun = useCallback((run: GatewayActivityRun) => select('run', run.id), [select])
  const openEvent = useCallback((event: GatewayActivityEvent) => select('event', event.id), [select])
  function closeDetails() { setParams(previous => { const next = new URLSearchParams(previous); for (const key of ['task', 'run', 'event']) next.delete(key); return next }) }
  function openCreate() {
    state.setState(value => ({ dialog: { kind: 'create' }, error: null, drafts: value.drafts.create ? value.drafts : { ...value.drafts, create: { outcome: '', criteria: '', sessionId: '', parentTaskId: '', runIds: [], requestId: createTaskRequestId() } } }))
  }
  function openEdit(task: GatewayTask) {
    const key = taskDraftKey(task.id)
    state.setState(value => ({ dialog: { kind: 'edit', taskId: task.id }, error: null, drafts: value.drafts[key] ? value.drafts : { ...value.drafts, [key]: draftFromTask(task) } }))
  }
  function openReview(task: GatewayTask, status: GatewayTaskStatus) {
    const key = reviewDraftKey(task.id, status)
    state.setState(value => ({ dialog: { kind: 'review', taskId: task.id, status }, error: null, reviews: value.reviews[key] ? value.reviews : { ...value.reviews, [key]: { taskId: task.id, sessionId: task.sessionId, status, revision: task.revision, note: '', checked: [] } } }))
  }
  function discardDraft() {
    state.setState(value => { const drafts = { ...value.drafts }, reviews = { ...value.reviews }; delete drafts[editorKey]; delete reviews[reviewKey]; return { drafts, reviews, dialog: null, error: null } })
  }
  async function mutate(operation: ActivityMutation, action: (signal: AbortSignal) => Promise<GatewayTask>) {
    if (state.getState().mutation) return
    const startedEpoch = state.getState().epoch
    state.setState({ mutation: { ...operation, phase: 'pending' }, error: null, notice: null })
    try {
      const response = await request(action)
      const task = sourcePrivacy.getState().sessionIds.includes(response.sessionId) ? maskForgottenTask(response) : response
      if (state.getState().epoch !== startedEpoch) return
      state.setState(value => { const drafts = { ...value.drafts }, reviews = { ...value.reviews }; delete drafts[operation.key]; delete reviews[operation.key]; return { mutation: null, dialog: null, drafts, reviews, notice: 'Task saved. No work was started.' } })
      if (mounted.current) { mergeTask(task); if (task.contentStatus === 'forgotten') forgetSources(new Set([task.sessionId]), new Set([task.id])); setFilter(task.archivedAt ? 'archived' : isTerminalTask(task) ? 'history' : 'active'); select('task', task.id) }
    } catch (failure) {
      if (state.getState().epoch !== startedEpoch) return
      const classified = failure instanceof GatewayActivityMutationError ? failure : null
      const safeOperation = operation.input && sourcePrivacy.getState().sessionIds.includes(operation.input.sessionId) ? { ...operation, input: undefined } : operation
      state.setState({ mutation: classified?.outcome === 'rejected' ? null : { ...safeOperation, phase: classified?.outcome === 'conflict' ? 'conflict' : 'unknown' }, error: classified?.message ?? gatewayError(failure).message })
    }
  }
  function saveEditor() {
    if (!editorDraft) return
    const fields = { outcome: editorDraft.outcome, criteria: editorDraft.criteria.split('\n').map(value => value.trim()).filter(Boolean), parentTaskId: editorDraft.parentTaskId || null, runIds: editorDraft.runIds }
    if (dialog?.kind === 'create') {
      const input = { ...fields, sessionId: editorDraft.sessionId, requestId: editorDraft.requestId! }
      void mutate({ key: editorKey, kind: 'create', phase: 'pending', requestId: input.requestId, input }, signal => client.createTask(input, { signal }))
    } else if (dialogTask) void mutate({ key: editorKey, kind: 'edit', phase: 'pending', taskId: dialogTask.id, revision: editorDraft.revision }, signal => client.updateTask(dialogTask.id, { ...fields, expectedRevision: editorDraft.revision! }, { signal }))
  }
  function saveReview() {
    if (!review || !dialogTask) return
    void mutate({ key: reviewKey, kind: 'review', phase: 'pending', taskId: dialogTask.id, revision: review.revision }, signal => client.transitionTask(dialogTask.id, { expectedRevision: review.revision, status: review.status, note: review.note, ...(review.status === 'completed' ? { completedCriterionIds: review.checked } : {}) }, { signal }))
  }
  async function reconcile() {
    const mutation = state.getState().mutation
    if (!mutation || mutation.phase === 'pending') return
    const startedEpoch = state.getState().epoch
    setSelectionPending(true)
    try {
      const response = mutation.requestId ? await request(signal => client.getTaskByRequest(mutation.requestId!, { signal })) : await request(signal => client.getTask(mutation.taskId!, { signal }))
      const task = sourcePrivacy.getState().sessionIds.includes(response.sessionId) ? maskForgottenTask(response) : response
      if (state.getState().epoch !== startedEpoch) return
      if (mutation.kind === 'create') {
        state.setState(value => { const drafts = { ...value.drafts }; delete drafts[mutation.key]; return { mutation: null, dialog: null, drafts, error: null, notice: 'The saved request matched an existing task. No creation was repeated.' } })
      } else state.setState({ mutation: { ...mutation, checked: true }, error: null, notice: 'Current task loaded. Review it before discarding the retained change; nothing was saved again.' })
      if (mounted.current) { mergeTask(task); if (task.contentStatus === 'forgotten') forgetSources(new Set([task.sessionId]), new Set([task.id])); setSelectedTask(task); select('task', task.id) }
    } catch (failure) {
      if (state.getState().epoch !== startedEpoch) return
      const safe = gatewayError(failure)
      state.setState({ ...(mutation.requestId && safe.status === 404 ? { mutation: { ...state.getState().mutation!, notFound: true } } : {}), error: mutation.requestId && safe.status === 404 ? 'No task was found for this saved request yet. You can check again or explicitly retry the same saved request. Its identity prevents duplicate creation.' : safe.message })
    } finally { if (mounted.current) setSelectionPending(false) }
  }
  function acceptCurrentRecord() {
    const mutation = state.getState().mutation
    if (!mutation?.checked || mutation.phase === 'pending') return
    state.setState(value => { const drafts = { ...value.drafts }, reviews = { ...value.reviews }; delete drafts[mutation.key]; delete reviews[mutation.key]; return { mutation: null, dialog: null, drafts, reviews, error: null, notice: 'Current task kept. Retained change discarded; nothing was saved.' } })
  }
  function retryCreation() {
    const mutation = state.getState().mutation
    if (mutation?.kind !== 'create' || mutation.phase !== 'unknown' || !mutation.notFound || !mutation.input || sourcePrivacy.getState().sessionIds.includes(mutation.input.sessionId)) return
    const input = mutation.input
    state.setState({ mutation: null })
    void mutate({ ...mutation, notFound: false, checked: false, phase: 'pending' }, signal => client.createTask(input, { signal }))
  }
  const recovery = retained.mutation && retained.mutation.phase !== 'pending' ? <div className="space-y-3 rounded-lg border p-4"><p className="text-sm font-medium">{retained.mutation.phase === 'conflict' ? 'This change was not accepted' : 'Task change result unknown'}</p><p className="text-xs leading-5 text-muted-foreground">Further task changes are blocked until the current task is checked. Nothing will be repeated automatically. Available drafts are retained.</p>{retained.mutation.requestId && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Technical details</summary><p className="mt-1 break-all">Request {retained.mutation.requestId}</p></details>}<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={selectionPending} onClick={() => void reconcile()}>Check current task</Button>{retained.mutation.kind === 'create' && retained.mutation.phase === 'unknown' && retained.mutation.notFound && retained.mutation.input && !forgottenIds.includes(retained.mutation.input.sessionId) && <Button variant="outline" size="sm" disabled={selectionPending} onClick={retryCreation}>Retry same creation request</Button>}{retained.mutation.checked && <><Button variant="outline" size="sm" onClick={() => state.setState({ dialog: null })}>View current task</Button><Button variant="outline" size="sm" className="h-auto min-h-(--control-height-sm) whitespace-normal" onClick={acceptCurrentRecord}>Keep current task and discard change</Button></>}</div></div> : null
  const filteredTasks = safeTasks.filter(task => filter === 'all' || (filter === 'archived' ? !!task.archivedAt : !task.archivedAt && (filter === 'history' ? isTerminalTask(task) : !isTerminalTask(task))))
  const cursor = tab === 'tasks' ? taskCursor : tab === 'runs' ? runCursor : eventCursor
  const availableDialog = dialog?.kind === 'create' || dialogTask?.contentStatus === 'available'

  return <section className="h-full min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8" tabIndex={0} aria-label="Activity workspace"><div className="space-y-5">
    <PageHeader density="compact" title="Activity" description="Track tasks and review saved activity." actions={<><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />Refresh</Button><Button disabled={!!retained.mutation} onClick={openCreate}><Plus />New task</Button></>} />
    <p className="text-xs leading-5 text-muted-foreground">A task is something you want done, linked to a chat. Use Work on this task to have Conker pick it up; only you can mark it done.</p>
    {retained.notice && <p role="status" className="text-sm text-muted-foreground">{retained.notice}</p>}{(retained.error || error) && <p role="alert" className="text-sm text-destructive">{retained.error || error}</p>}{recovery}
    {(taskFilter || runFilter || sessionFilter) && <div className="flex flex-wrap items-center gap-3 text-xs"><span>Showing one source</span><details className="text-muted-foreground"><summary className="cursor-pointer">Technical details</summary><span className="break-all">{taskFilter || runFilter || sessionFilter}</span></details><Button size="sm" variant="outline" onClick={() => setParams({ tab })}>Clear source filter</Button></div>}
    {loading && <p role="status" className="text-xs text-muted-foreground">Loading {tab === 'runs' ? 'attempts' : tab}...</p>}
    {tab === 'tasks' && <><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Task lifecycle filter" className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active tasks</SelectItem><SelectItem value="history">Completed / cancelled</SelectItem><SelectItem value="archived">Archived tasks</SelectItem><SelectItem value="all">All loaded tasks</SelectItem></SelectContent></Select>{tasks.length ? <GatewayTasksTable tasks={filteredTasks} onOpen={openTask} /> : !loading && <CollectionEmpty title="No recorded tasks" description="Create an outcome and completion criteria linked to an open conversation." action={<Button disabled={!!retained.mutation} onClick={openCreate}>Create a task</Button>} />}</>}
    {tab === 'runs' && (runs.length ? <GatewayRunsTable runs={runs} onOpen={openRun} /> : !loading && <CollectionEmpty title="No saved attempts" description="Attempts appear here when the connected service supplies a saved activity record. Creating a task does not create an attempt." action={<Button asChild variant="outline"><Link to="/chats">Open conversations</Link></Button>} />)}
    {tab === 'events' && (events.length ? <GatewayEventsTable events={events} onOpen={openEvent} /> : !loading && <CollectionEmpty title="No saved activity" description="Task changes and supplied activity appear here without authored content." />)}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(true, cursor)}>Load more {tab === 'runs' ? 'attempts' : tab}</Button>}
    <p className="text-xs text-muted-foreground">Search and sorting apply to loaded records. Use Load more to include earlier records.</p>
  </div>
    <DetailPanel open={active && !!(taskId || runId || eventId) && !dialog} onOpenChange={open => { if (!open) closeDetails() }} title={safeSelectedTask?.id === taskId ? taskTitle(safeSelectedTask) : taskId ? 'Task' : runId ? 'Attempt' : 'Activity'} description="Saved details" busy={busy}>
      {selectionPending ? <OverlayBody><p role="status">Loading details…</p></OverlayBody> : selectionError ? <OverlayBody><p role="alert" className="text-sm text-destructive">{selectionError}</p><Button variant="outline" onClick={() => { if (taskId) void loadSelection(taskId, 'task'); else if (runId) void loadSelection(runId, 'run') }}>Retry read</Button></OverlayBody> : taskId && safeSelectedTask?.id === taskId ? <GatewayTaskDetails task={safeSelectedTask} workDisabled={dispatchBlocked || !!retainedTaskId && retainedTaskId !== safeSelectedTask.id} workNotice={retainedTaskId && retainedTaskId !== safeSelectedTask.id ? 'Another task request is saved. Open Conversations to review or discard it first.' : undefined} onWork={() => onWork(safeSelectedTask)} feedback={<>{retained.error && <p role="alert" className="text-sm text-destructive">{retained.error}</p>}{recovery}</>} disabled={!!retained.mutation} onEdit={() => openEdit(safeSelectedTask)} onReview={status => openReview(safeSelectedTask, status)} onArchive={() => void mutate({ key: `archive:${safeSelectedTask.id}`, taskId: safeSelectedTask.id, revision: safeSelectedTask.revision, kind: 'archive', phase: 'pending' }, signal => client.archiveTask(safeSelectedTask.id, { expectedRevision: safeSelectedTask.revision, archived: !safeSelectedTask.archivedAt }, { signal }))} /> : runId && selectedRun?.id === runId ? <GatewayRunDetails run={selectedRun} /> : selectedEvent ? <GatewayEventDetails event={selectedEvent} /> : <OverlayBody><p className="text-sm text-muted-foreground">These details are not available in the loaded page. Load more or clear the selection.</p></OverlayBody>}
    </DetailPanel>
    <Dialog open={active && !!dialog} onOpenChange={open => { if (!open && !busy) state.setState({ dialog: null }) }}><TaskDialogContent size="wide" title={dialog?.kind === 'create' ? 'New task' : dialog?.kind === 'review' ? `Review ${taskStatusLabels[dialog.status].toLocaleLowerCase()}` : 'Edit task'} description="Owner-reported tracking. Closing keeps your draft." showCloseButton={!busy} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault() }}>
      {!availableDialog ? <OverlayBody><p className="text-sm text-muted-foreground">This task is unavailable or its source was forgotten. Authored drafts are hidden.</p></OverlayBody> : <>{recovery && <div className="max-h-56 overflow-y-auto p-5">{recovery}{retained.error && <p role="alert" className="mt-3 text-sm text-destructive">{retained.error}</p>}</div>}{dialog?.kind === 'review' && dialogTask && review ? <GatewayTaskReview task={dialogTask} draft={review} onChange={value => state.setState(current => ({ reviews: { ...current.reviews, [reviewKey]: value } }))} onSave={saveReview} onClose={() => state.setState({ dialog: null })} onDiscard={discardDraft} disabled={!!retained.mutation} error={retained.error} /> : editorDraft && <GatewayTaskEditor draft={editorDraft} task={dialogTask} sessions={safeSessions} tasks={safeTasks} runs={visibleReferences.runs} referencesPending={visibleReferences.pending} referencesError={visibleReferences.error} moreRuns={!!visibleReferences.cursor} onRetryRuns={() => { if (sourceSessionId) void loadReferences(sourceSessionId) }} onMoreRuns={() => { if (sourceSessionId) void loadReferences(sourceSessionId, visibleReferences.cursor) }} onChange={value => state.setState(current => ({ drafts: { ...current.drafts, [editorKey]: value } }))} onSave={saveEditor} onClose={() => state.setState({ dialog: null })} onDiscard={discardDraft} disabled={!!retained.mutation} error={retained.error} />}</>}
    </TaskDialogContent></Dialog>
  </section>
}
