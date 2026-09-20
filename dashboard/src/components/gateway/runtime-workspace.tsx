import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { ArrowLeft, LogOut, MessageSquare, Plus, RefreshCw, Send } from 'lucide-react'
import { CompanionPortrait } from '@/components/companion-portrait'
import { CollectionEmpty, CollectionSearch, RecordItem } from '@/components/design-system/primitives'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { ModeToggle } from '@/components/mode-toggle'
import { RichAnswer } from '@/components/rich-answer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { RuntimeMutationError, type GatewayRuntimeClient, type RuntimeMessage, type RuntimeSession, type RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { gatewayError } from '@/lib/gateway/transport'
import { cn } from '@/lib/utils'
import { canSubmitRuntime, checkedAttempt, createGatewayRuntimeWorkspaceState, hasActiveRuntimeTurn, resolveAttempt, type GatewayRuntimeWorkspaceState } from './runtime-state'

export type { GatewayRuntimeWorkspaceState } from './runtime-state'
export type GatewayRuntimeWorkspaceProps = { client: GatewayRuntimeClient; authStore: GatewayAuthStore; state?: GatewayRuntimeWorkspaceState }

export function RuntimeMessageRecord({ message }: { message: RuntimeMessage }) {
  const body = message.content.kind === 'unavailable'
    ? <p className="text-sm italic text-muted-foreground">{message.content.reason === 'forgotten' ? 'This message was forgotten. Its content is unavailable.' : 'This record cannot be displayed as text.'}</p>
    : message.role === 'assistant' ? <RichAnswer text={message.content.text} />
      : <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content.text}</p>
  if (message.role === 'system' || message.role === 'tool') return <details className="rounded-lg border p-3"><summary className="cursor-pointer rounded-sm text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring">{message.role === 'tool' ? 'Tool' : 'System'} record · {message.sequence}</summary><div className="mt-3 min-w-0">{body}</div></details>
  return <article className="min-w-0 space-y-2" aria-label={`${message.role} message ${message.sequence}`}><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{message.role === 'user' ? 'You' : 'Conker'}</span><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></div>{body}</article>
}

/** Live Pi records only. All drafts and mutation locks belong to this mounted workspace. */
export function GatewayRuntimeWorkspace({ client, authStore, state }: GatewayRuntimeWorkspaceProps) {
  const auth = useStore(authStore)
  const [localState] = useState(createGatewayRuntimeWorkspaceState)
  const workspace = state ?? localState
  const { selected, drafts, uncertain, title, createUnknown, operation } = useStore(workspace)
  const setSelected = (value: string | null) => workspace.setState({ selected: value })
  const setTitle = (value: string) => workspace.setState({ title: value })
  const setCreateUnknown = (value: 'unchecked' | 'checked' | null) => workspace.setState({ createUnknown: value })
  const [sessions, setSessions] = useState<RuntimeSession[]>([])
  const [detail, setDetail] = useState<RuntimeSessionDetail | null>(null)
  const [query, setQuery] = useState('')
  const [listPending, setListPending] = useState(false)
  const [detailPending, setDetailPending] = useState(false)
  const sendPending = operation === 'send'
  const [listError, setListError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const createPending = operation === 'create'
  const [createError, setCreateError] = useState<string | null>(null)
  const mounted = useRef(false)
  const controllers = useRef(new Set<AbortController>())
  const detailGeneration = useRef(0)
  const listGeneration = useRef(0)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const active = auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed
  const activeRef = useRef(active)
  activeRef.current = active
  const current = detail?.id === selected ? detail : null
  const draft = selected ? drafts[selected] ?? '' : ''
  const attempt = selected ? uncertain[selected] : undefined
  const pending = sendPending || detailPending || !active

  const request = useCallback(async <T,>(action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    try { return await action(controller.signal) }
    finally { controllers.current.delete(controller) }
  }, [])
  const refreshList = useCallback(async () => {
    const generation = ++listGeneration.current
    setListPending(true); setListError(null)
    try {
      const rows = await request(signal => client.listSessions({ signal }))
      if (!mounted.current || !activeRef.current || generation !== listGeneration.current) return false
      setSessions(rows)
      if (workspace.getState().createUnknown) workspace.setState({ createUnknown: 'checked' })
      return true
    } catch (error) {
      if (mounted.current && activeRef.current && generation === listGeneration.current) setListError(gatewayError(error).message)
      return false
    } finally { if (mounted.current && generation === listGeneration.current) setListPending(false) }
  }, [client, request, workspace])
  const refreshDetail = useCallback(async (id: string) => {
    const generation = ++detailGeneration.current
    setDetailPending(true); setDetailError(null)
    try {
      const next = await request(signal => client.getSession(id, { signal }))
      if (!mounted.current || !activeRef.current || generation !== detailGeneration.current || selectedRef.current !== id) return false
      setDetail(next)
      const accepted = workspace.getState().uncertain[id]
      if (accepted?.accepted && next.turns.some(turn => turn.id === accepted.turnId)) workspace.setState(values => {
        if (values.uncertain[id] !== accepted) return {}
        const updated = { ...values.uncertain }; delete updated[id]
        return { uncertain: updated }
      })
      return true
    } catch (error) {
      if (mounted.current && activeRef.current && generation === detailGeneration.current) setDetailError(gatewayError(error).message)
      return false
    } finally { if (mounted.current && generation === detailGeneration.current) setDetailPending(false) }
  }, [client, request, workspace])

  useEffect(() => {
    mounted.current = true
    const pendingControllers = controllers.current
    return () => { mounted.current = false; for (const controller of pendingControllers) controller.abort(); pendingControllers.clear() }
  }, [])
  useEffect(() => { if (active) void refreshList(); else { for (const controller of controllers.current) controller.abort(); controllers.current.clear() } }, [active, refreshList])
  useEffect(() => { if (selected && active) void refreshDetail(selected) }, [selected, active, refreshDetail])
  useEffect(() => {
    if (!Object.values(drafts).some(value => value.length) && !Object.keys(uncertain).length && !title && !createUnknown && !sendPending && !createPending) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [drafts, uncertain, title, createUnknown, sendPending, createPending])

  function openSession(id: string) { selectedRef.current = id; setSelected(id); setDetail(null); setDetailError(null); setNotice(null); setReviewed(false) }
  async function createSession() {
    if (workspace.getState().operation || createUnknown || !activeRef.current) return
    const epoch = workspace.getState().epoch
    workspace.setState({ operation: 'create' }); setCreateError(null)
    try {
      const result = await request(signal => client.createSession(title, { signal }))
      if (workspace.getState().epoch !== epoch) return
      if (!mounted.current || !activeRef.current) { workspace.setState({ selected: result.sessionId, title: '' }); return }
      setTitle(''); setCreateOpen(false); openSession(result.sessionId)
      setNotice('Conversation created.'); void refreshList()
    } catch (error) {
      if (workspace.getState().epoch !== epoch) return
      const rejected = error instanceof RuntimeMutationError && error.outcome === 'rejected'
      if (mounted.current) setCreateError(rejected ? error.message : 'Creation outcome unknown. Check the conversation list before creating another conversation.')
      if (!rejected) setCreateUnknown('unchecked')
    } finally { if (workspace.getState().epoch === epoch) workspace.setState({ operation: null }) }
  }
  async function submit() {
    if (workspace.getState().operation || !selected || !canSubmitRuntime(draft, pending, attempt, current)) return
    const id = selected, text = draft
    const epoch = workspace.getState().epoch
    workspace.setState({ operation: 'send' }); setDetailError(null); setNotice(null)
    try {
      const receipt = await request(signal => client.submitTurn(id, text, { signal }))
      if (workspace.getState().epoch !== epoch) return
      const destination = receipt.sessionId ?? id
      workspace.setState(values => ({ drafts: { ...values.drafts, [id]: values.drafts[id] === text ? '' : values.drafts[id] } }))
      if (!mounted.current || !activeRef.current) {
        workspace.setState(values => ({ selected: destination, uncertain: { ...values.uncertain, [destination]: { text, turnId: receipt.turnId, checked: false, accepted: true } } }))
        return
      }
      workspace.setState(values => ({ uncertain: { ...values.uncertain, [destination]: { text, turnId: receipt.turnId, checked: false, accepted: true } } }))
      if (selectedRef.current !== destination) openSession(destination)
      setNotice(`${destination !== id ? 'The server continued in a fork. ' : ''}Turn ${receipt.turnId} was accepted${receipt.status ? ` (${receipt.status.replaceAll('_', ' ')})` : ''}.`)
      // A receipt is not a completed transcript; fetch actual persisted detail, never invent a reply.
      selectedRef.current = destination
      await refreshDetail(destination)
      void refreshList()
    } catch (error) {
      if (workspace.getState().epoch !== epoch) return
      if (error instanceof RuntimeMutationError && error.outcome === 'rejected') { if (mounted.current) setDetailError(error.message) }
      else {
        workspace.setState(values => ({ uncertain: { ...values.uncertain, [id]: { text, turnId: error instanceof RuntimeMutationError ? error.turnId : undefined, checked: false } } }))
        if (mounted.current) { setReviewed(false); setDetailError('Send outcome unknown. The server may have accepted this text. Sending again could duplicate work.') }
      }
    } finally { if (workspace.getState().epoch === epoch) workspace.setState({ operation: null }) }
  }
  async function checkHistory() {
    if (!selected || detailPending || sendPending) return
    setReviewed(false)
    const id = selected
    workspace.setState(values => values.uncertain[id] ? { uncertain: { ...values.uncertain, [id]: { ...values.uncertain[id], checked: false } } } : {})
    const detailChecked = await refreshDetail(id)
    const listChecked = await refreshList()
    if (detailChecked && listChecked && mounted.current && selectedRef.current === id) workspace.setState(values => values.uncertain[id] ? { uncertain: { ...values.uncertain, [id]: checkedAttempt(values.uncertain[id]) } } : {})
  }
  function resolve(decision: 'found' | 'allow-new') {
    if (!selected || !attempt?.checked || !reviewed || !current || hasActiveRuntimeTurn(current)) return
    const result = resolveAttempt(attempt, draft, decision)
    workspace.setState(values => { const next = { ...values.uncertain }; delete next[selected]; return { drafts: { ...values.drafts, [selected]: result.draft }, uncertain: next } })
    setReviewed(false); setDetailError(null)
    setNotice(decision === 'found' ? 'Marked as found in server history. No text was sent.' : 'Sending is enabled after your review. No text was sent; the earlier operation may still finish.')
  }
  async function logout() {
    if (await authStore.getState().logout()) window.location.reload()
  }
  const matches = sessions.filter(session => `${session.title} ${session.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  if (!active) return null
  return <div className="flex h-svh min-h-0 flex-col bg-background text-foreground">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6"><CompanionPortrait portrait="/conker.png" name="Conker" tone="graphite" /><span className="font-semibold">Conker</span><Badge variant="outline">Live gateway</Badge><div className="ml-auto flex items-center gap-2"><ModeToggle /><Button size="sm" variant="ghost" disabled={auth.pending} onClick={() => void logout()}><LogOut />Sign out</Button></div></header>
    <main className="flex min-h-0 flex-1">
      <aside aria-label="Conversations" className={cn('min-h-0 w-full shrink-0 flex-col border-r sm:flex sm:w-72 lg:w-80', selected ? 'hidden' : 'flex')}>
        <div className="space-y-3 border-b p-4"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Conversations</h2><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Refresh conversations" disabled={listPending} onClick={() => void refreshList()}><RefreshCw className={cn(listPending && 'animate-spin motion-reduce:animate-none')} /></Button><Button size="sm" onClick={() => setCreateOpen(true)}><Plus />New</Button></div></div><CollectionSearch label="Search conversations" placeholder="Search conversations…" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="min-h-0 flex-1 overflow-y-auto" tabIndex={0} aria-label="Conversation list">
          {listError && <p role="alert" className="p-4 text-sm text-destructive">{listError}</p>}
          <p className="px-4 pt-3 text-xs text-muted-foreground" role="status">{listPending ? 'Loading conversations…' : `${matches.length} conversations · latest 200`}</p>
          {matches.length ? <div className="divide-y">{matches.map(session => <div key={session.id} className={cn(session.id === selected && 'bg-accent')}><RecordItem title={session.status === 'forgotten' ? 'Forgotten conversation' : session.title || 'Untitled conversation'} description={<span className="break-all">{session.status} · {session.id}</span>} onOpen={() => openSession(session.id)} /></div>)}</div> : !listPending && <CollectionEmpty title={query ? 'No matching conversations' : 'No conversations yet'} description={query ? 'Try another title or session ID.' : 'Create a conversation to send your first message.'} icon={<MessageSquare />} onClear={query ? () => setQuery('') : undefined} />}
        </div>
      </aside>
      <section aria-label="Selected conversation" className={cn('min-h-0 min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden sm:flex')}>
        {!selected ? <CollectionEmpty title="Open a conversation" description="Choose saved history or create a conversation. Responses come from the connected runtime." icon={<MessageSquare />} action={<Button onClick={() => setCreateOpen(true)}><Plus />New conversation</Button>} /> : <>
          <header className="flex shrink-0 items-center gap-2 border-b p-4"><Button className="sm:hidden" size="icon" variant="ghost" aria-label="Back to conversations" onClick={() => { setSelected(null); selectedRef.current = null }}><ArrowLeft /></Button><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{current?.status === 'forgotten' ? 'Forgotten conversation' : current?.title || sessions.find(item => item.id === selected)?.title || 'Conversation'}</h2><p className="truncate text-xs text-muted-foreground">{selected}{current ? ` · ${current.status}` : ''}</p></div><Button size="sm" variant="outline" disabled={detailPending || sendPending} onClick={() => void checkHistory()}><RefreshCw />Check history</Button></header>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6" tabIndex={0} aria-label="Saved conversation history">
            {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
            {detailError && <p role="alert" className="text-sm text-destructive">{detailError}</p>}
            {detailPending && <p role="status" className="text-sm text-muted-foreground">Loading saved history…</p>}
            {attempt && <div className="space-y-3 rounded-lg border p-3"><p className="text-sm font-medium">{attempt.accepted ? 'Accepted turn awaiting history' : 'Send outcome unknown'}</p><p className="text-xs leading-5 text-muted-foreground">{attempt.accepted ? 'The server accepted this turn. Further sends are blocked until its saved record is verified.' : 'Your draft is retained. Further sends are blocked because the previous request may still run.'}{attempt.turnId ? ` Known turn: ${attempt.turnId}.` : ''} Refresh history and review the conversation list for a possible fork.</p><Button size="sm" variant="outline" disabled={detailPending || sendPending} onClick={() => void checkHistory()}>Check server history</Button>{attempt.checked && <><Label className="flex items-center gap-2 text-xs"><Checkbox checked={reviewed} onCheckedChange={value => setReviewed(value === true)} />I reviewed server history and understand duplicate work is possible.</Label><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal text-left" disabled={!reviewed || !current || hasActiveRuntimeTurn(current)} onClick={() => resolve('found')}>Sent text is already in history</Button><Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal text-left" disabled={!reviewed || !current || hasActiveRuntimeTurn(current)} onClick={() => resolve('allow-new')}>Acknowledge unknown outcome; enable sending</Button></div></>}</div>}
            {current?.status === 'forgotten' && <p className="text-sm text-muted-foreground">This conversation was forgotten. Sending is disabled.</p>}{current && hasActiveRuntimeTurn(current) && <p role="status" className="text-sm text-muted-foreground">The server has an unfinished turn. Check history for its status before sending again.</p>}{current?.messages.map(message => <RuntimeMessageRecord key={message.id} message={message} />)}
            {current && !current.messages.length && <p className="text-sm text-muted-foreground">No saved messages in this conversation.</p>}
            {current && current.turns.length > 0 && <details className="border-t pt-4"><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Turn records ({current.turns.length}) · latest {current.turns.at(-1)?.status.replaceAll('_', ' ')}</summary><ul className="mt-3 space-y-3">{current.turns.map(turn => <li key={turn.id} className="space-y-1 text-xs text-muted-foreground"><p className="break-all"><span className="font-medium text-foreground">{turn.status.replaceAll('_', ' ')}</span> · {turn.id}</p>{(turn.provider || turn.model) && <p className="break-words">{[turn.provider, turn.model].filter(Boolean).join(' / ')}</p>}{turn.action && <p>Action: {turn.action.state.replaceAll('_', ' ')}</p>}</li>)}</ul></details>}
          </div>
          <div className="shrink-0 space-y-3 border-t p-4 sm:px-6">
            <form className="space-y-2" onSubmit={event => { event.preventDefault(); void submit() }}><Label htmlFor="gateway-composer" className="sr-only">Message Conker</Label><Textarea id="gateway-composer" rows={3} value={draft} placeholder="Message Conker…" disabled={sendPending || current?.status === 'forgotten'} onChange={event => workspace.setState(values => ({ drafts: { ...values.drafts, [selected]: event.target.value } }))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() } }} /><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line. Drafts stay in this open workspace.</p><Button type="submit" disabled={!canSubmitRuntime(draft, pending, attempt, current)}><Send />{sendPending ? 'Sending…' : 'Send'}</Button></div>{[...draft].length > 16_000 && <p role="alert" className="text-xs text-destructive">Use 16,000 characters or fewer.</p>}</form>
          </div>
        </>}
      </section>
    </main>
    <Dialog open={createOpen} onOpenChange={next => { if (!createPending) setCreateOpen(next) }}><TaskDialogContent title="New conversation" description="Create a conversation in the connected runtime. The title is optional." onInteractOutside={event => event.preventDefault()} showCloseButton={!createPending}>
      <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void createSession() }}><OverlayBody><div className="space-y-2"><Label htmlFor="gateway-title">Title</Label><Input id="gateway-title" value={title} maxLength={1024} disabled={createPending} onChange={event => setTitle(event.target.value)} autoFocus /></div>{createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}{createUnknown && <div className="space-y-3"><p className="text-xs leading-5 text-muted-foreground">The server may already have created a conversation. Close this dialog to inspect the list. Your title stays here until creation succeeds.</p><Button type="button" variant="outline" disabled={listPending} onClick={() => void refreshList()}>Check server conversation list</Button>{createUnknown === 'checked' && <Button type="button" variant="outline" onClick={() => { setCreateUnknown(null); setCreateError('Creation enabled after your review. Creating again may duplicate the previous conversation.') }}>I reviewed the list; allow another creation</Button>}</div>}</OverlayBody><FormActions inset><Button type="button" variant="outline" disabled={createPending} onClick={() => setCreateOpen(false)}>Close</Button><Button type="submit" disabled={createPending || Boolean(createUnknown)}>{createPending ? 'Creating…' : 'Create conversation'}</Button></FormActions></form>
    </TaskDialogContent></Dialog>
  </div>
}
