import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Copy, RefreshCw, Square, TerminalSquare } from 'lucide-react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { nativeAttachCommand, type NativeSession, type NativeSessionsClient } from '@/lib/gateway/native-sessions'
import { CollectionLoading, CollectionPanel, CollectionSection, ConfirmationDialog, DetailPanel, OverlayBody, PageHeader, RecordItem, WorkspaceAction } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { ReferenceSection } from '@/components/reference-section'
import { GatewayPageFrame } from './page-frame'
import { useNativeSessions } from './use-native-sessions'

const states = { working: 'Working', blocked: 'Needs attention', done: 'Done', failed: 'Failed', stopped: 'Stopped', unknown: 'State unknown' }
const waiting = { permission_prompt: 'Native permission prompt', input_needed: 'Native input needed', sandbox_request: 'Native sandbox request', worker_request: 'Native worker request', dialog_open: 'Native dialog open' }
export function GatewayNativeSessionsWorkspace({ client, authStore, providerControl }: { client: NativeSessionsClient; authStore: GatewayAuthStore; providerControl?: ReactNode }) {
  const state = useNativeSessions(client, authStore), { controller, selected } = state
  const [search, setSearch] = useState({ controller, scope: state.scope, text: '' }), [copied, setCopied] = useState<NativeSession | null>(null)
  const [review, setReview] = useState<{ controller: typeof controller; scope: number; target: NativeSession } | null>(null)
  const [focusReview, setFocusReview] = useState<typeof review>(null), focusOrigin = useRef<typeof review>(null)
  const stopButton = useRef<HTMLButtonElement>(null), current = useRef({ controller, scope: state.scope, selected, review })
  useLayoutEffect(() => { current.current = { controller, scope: state.scope, selected, review } })
  const query = search.controller === controller && search.scope === state.scope ? search.text : ''
  const setQuery = (text: string) => setSearch({ controller, scope: state.scope, text })
  const operationPending = state.pending === 'verification' || state.pending === 'stop'
  const activeReview = review?.controller === controller && review.scope === state.scope && review.target === selected ? review : null
  const notice = state.stopNotice?.id === selected?.id && state.stopNotice?.identity === selected?.identity ? state.stopNotice : null
  const canStop = !!selected?.canStop && state.detailCurrent && !state.pending && (!notice || notice.checked)
  const visible = (state.rows?.results ?? []).filter(row => `${row.name ?? ''} ${row.id} ${row.cwd}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  async function copy(row: NativeSession) {
    if (controller.store.getState().selected !== row || !controller.store.getState().active) return
    try { await navigator.clipboard.writeText(nativeAttachCommand(row.id)); if (current.current.controller === controller && current.current.selected === row) setCopied(row) } catch { /* The selectable command stays available. */ }
  }
  async function stop() {
    if (!activeReview) return
    const captured = activeReview
    if (controller.store.getState().pending || controller.store.getState().selected !== captured.target) return
    await controller.stop(captured.target)
    setReview(value => value === captured ? null : value)
  }
  function restoreStopFocus() {
    const captured = focusReview
    if (!captured || focusOrigin.current !== captured) return false
    focusOrigin.current = null; setFocusReview(null)
    requestAnimationFrame(() => {
      const latest = current.current, auth = authStore.getState(), target = stopButton.current
      if (latest.review || captured.controller !== latest.controller || captured.scope !== latest.scope || latest.selected?.id !== captured.target.id || latest.selected.identity !== captured.target.identity || auth.phase !== 'authenticated' || auth.pending || auth.logoutUnconfirmed || !target?.isConnected) return
      const panel = target.closest('[role="dialog"]')
      if ([...document.querySelectorAll('[role="dialog"][data-open]')].some(dialog => dialog !== panel)) return
      if (document.activeElement === document.body || document.activeElement === panel || !(document.activeElement instanceof HTMLElement) || !document.activeElement.isConnected) target.focus()
    })
    return false
  }
  return <GatewayPageFrame><div className="space-y-6">
    <PageHeader actionsOnly title="Native sessions" description="Claude Code background sessions owned by Conker. These are separate from your chats and text-only model roles." density="compact" actions={<>{providerControl}<WorkspaceAction render={<Link to="/system?tab=terminal" />}><TerminalSquare />Terminal</WorkspaceAction><WorkspaceAction aria-disabled={!!state.pending || !state.active} className="aria-disabled:opacity-50" onClick={() => { if (!state.pending && state.active) void controller.list() }}><RefreshCw />{state.pending === 'list' ? 'Checking…' : 'Refresh sessions'}</WorkspaceAction></>} />
    <p className="text-sm leading-6 text-muted-foreground">Conker-owned Claude Code background sessions. These are separate from your chats and text-only model roles.</p>
    {!state.active && <p role="status" className="text-sm text-muted-foreground">Sign in to inspect native sessions.</p>}
    {state.listError && <p role="status" className="text-sm text-muted-foreground">Native sessions could not be checked. Refresh sessions to try again. Any retained rows are from the last successful check.</p>}
    {state.rows && <p className="text-xs leading-5 text-muted-foreground">Last checked native state. Refresh to observe changes.{state.rows.truncated ? ' The list is limited to 100 background sessions.' : ''}{state.rows.omittedCount > 0 ? ` ${state.rows.omittedCount} native ${state.rows.omittedCount === 1 ? 'entry is' : 'entries are'} omitted; this list does not cover all native work.` : ''}</p>}
    <CollectionPanel query={query} onQueryChange={setQuery} label="Search native Claude sessions" placeholder="Search native sessions…" count={visible.length} unit="sessions" emptyTitle={query ? 'No matching background sessions' : 'No Claude background sessions found'} emptyDescription={query ? 'Try a session name, identity or working directory.' : 'Only Conker-owned, isolated Claude background sessions appear here. Use the native terminal for interactive work.'} icon={<TerminalSquare />} emptyContent={!state.rows ? state.pending === 'list' ? <CollectionLoading label="Checking native sessions…" /> : <p className="py-8 text-sm text-muted-foreground">{state.active ? 'No session list is available. Refresh sessions to check the host.' : 'Native session details are hidden while signed out.'}</p> : undefined}>
      <CollectionSection title="Claude background sessions"><ul>{visible.map(row => <li key={row.id}><RecordItem title={row.name || row.id} description={<span className="wrap-anywhere font-mono">{row.cwd}</span>} onOpen={() => { controller.select(row) }} selected={selected?.id === row.id} leading={<TerminalSquare className="size-4" />} meta={<><StatusBadge tone={row.state === 'blocked' || row.state === 'unknown' ? 'warning' : 'neutral'}>{states[row.state]}</StatusBadge><span className="wrap-anywhere">{row.id}</span><span>{new Date(row.startedAt).toLocaleString()}</span></>} /></li>)}</ul></CollectionSection>
    </CollectionPanel>
    <DetailPanel open={!!selected} onOpenChange={open => { if (!open) controller.close(selected) }} title={selected?.name || selected?.id || 'Native Claude session'} description="Native state and recovery. Output is loaded only when you request it." busy={operationPending}>
      <OverlayBody>{selected && <>
        <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge tone={selected.state === 'blocked' || selected.state === 'unknown' ? 'warning' : 'neutral'}>Last checked: {states[selected.state]}</StatusBadge><Button size="sm" variant="outline" aria-disabled={!!state.pending} className="aria-disabled:opacity-50" onClick={() => { if (!state.pending) void controller.get(selected) }}><RefreshCw />{state.pending === 'detail' ? 'Checking…' : 'Check status'}</Button></div>
        {state.detailError && <p role="status" className="text-sm text-muted-foreground">This session could not be checked. It may have ended, changed identity or become unavailable. Output is cleared; check status before another action.</p>}
        {!state.detailCurrent && !state.detailError && !notice && <p role="status" className="text-sm text-muted-foreground">{state.pending === 'detail' ? 'Checking this native session…' : 'Check status before acting on this session.'}</p>}
        {state.notStarted && <p role="status" className="text-sm text-muted-foreground">Stop could not be started. Check status before continuing.</p>}
        {state.stopNotice?.id === selected.id && state.stopNotice.identity !== selected.identity && <p role="status" className="text-sm text-muted-foreground">This ID now identifies a different native session. The earlier Stop receipt belongs to the previous identity; it does not describe this session.</p>}
        {notice && <p role="status" className="text-sm leading-6 text-muted-foreground">{notice.kind === 'requested' ? notice.checked ? 'Stop was requested. The latest checked native state is shown above.' : 'Stop requested. A fresh status check is needed to see whether native work has stopped.' : notice.checked ? 'Status was checked. The earlier Stop outcome remains unconfirmed; the request was not repeated.' : 'The Stop outcome was not confirmed. Native work may have stopped or may still be running. Check status; the request was not repeated.'}</p>}
        <ReferenceSection title="Session"><dl className="space-y-2 text-xs"><div><dt className="text-muted-foreground">Background session ID</dt><dd className="font-mono">{selected.id}</dd></div><div><dt className="text-muted-foreground">Native conversation ID</dt><dd className="font-mono">{selected.sessionId ?? 'Not reported'}</dd></div><div><dt className="text-muted-foreground">Working directory</dt><dd className="font-mono">{selected.cwd}</dd></div><div><dt className="text-muted-foreground">Started</dt><dd>{new Date(selected.startedAt).toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Observed identity</dt><dd className="font-mono">{selected.identity}</dd></div></dl>{selected.waitingFor && <p>{waiting[selected.waitingFor]}. Continue in Claude to inspect and answer it.</p>}{selected.state === 'blocked' && !selected.waitingFor && <p>Claude needs attention. This can be sign-in, input or permission; inspect it in the native app.</p>}</ReferenceSection>
        <ReferenceSection title="Continue in Claude"><p className="text-xs">From the Conker repository on this host, run this exact command. Attaching can resume native work; review Claude’s own permissions and approvals there.</p><code className="block select-all whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs">{nativeAttachCommand(selected.id)}</code><Button size="sm" variant="outline" onClick={() => void copy(selected)}><Copy />{copied === selected ? 'Copied command' : 'Copy attach command'}</Button></ReferenceSection>
        <ReferenceSection title="Recent output"><p className="text-xs">An explicit, bounded plain-text snapshot. This view does not save output; Claude may retain its own session data.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-disabled={!state.detailCurrent || !!state.pending} className="aria-disabled:opacity-50" onClick={() => { if (state.detailCurrent && !state.pending) void controller.output(selected) }}>{state.pending === 'output' ? 'Loading output…' : 'Read recent output'}</Button>{state.output && <Button size="sm" variant="ghost" onClick={() => controller.clearOutput()}>Clear output</Button>}</div>{state.outputError && <p role="status" className="text-xs text-muted-foreground">Output could not be safely read for this identity. Check status before requesting it again.</p>}{state.output && <><p className="text-xs text-muted-foreground">{state.output.truncated ? 'Earlier output was omitted. Showing the bounded recent snapshot.' : 'Recent output snapshot.'}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted p-3 font-mono text-xs">{state.output.text || 'No output returned.'}</pre></>}</ReferenceSection>
        <ReferenceSection title="Stop native work"><p className="text-xs">Stop applies to this exact background session. It does not undo completed changes or change native permissions.</p><Button ref={stopButton} size="sm" variant="outline" aria-disabled={!canStop} className="aria-disabled:opacity-50" onClick={() => { if (canStop) { const next = { controller, scope: state.scope, target: selected }; focusOrigin.current = next; setFocusReview(next); setReview(next) } }}><Square />Stop session</Button></ReferenceSection>
      </>}</OverlayBody>
    </DetailPanel>
    <ConfirmationDialog open={!!activeReview} onOpenChange={open => { if (!open) setReview(null) }} title="Stop this native Claude session?" description="Completed changes are not undone. Conker will ask for owner verification before requesting Stop." actionLabel="Request stop" pending={operationPending} onConfirm={stop} finalFocus={restoreStopFocus}>{activeReview && <p className="break-all text-sm">Session: {activeReview.target.id}<br />Working directory: {activeReview.target.cwd}</p>}</ConfirmationDialog>
  </div></GatewayPageFrame>
}
