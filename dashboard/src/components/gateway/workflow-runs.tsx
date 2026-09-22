import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import type { EditorRun, GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'
import { GatewayError } from '@/lib/gateway/transport'

export function GatewayWorkflowRuns({ id, name, client, open, onClose }: { id: string; name: string; client: GatewayEditorDrafts; open: boolean; onClose: () => void }) {
  const [versions, setVersions] = useState<Awaited<ReturnType<GatewayEditorDrafts['publications']>>>([])
  const [runs, setRuns] = useState<EditorRun[]>([]), [version, setVersion] = useState('')
  const [access, setAccess] = useState<Awaited<ReturnType<GatewayEditorDrafts['access']>> | null>(null)
  const [args, setArgs] = useState('{}'), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [uncertain, setUncertain] = useState<string | null>(null)
  const lifetime = useRef<AbortController | null>(null)
  const selected = versions.find(item => String(item.version) === version)
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  async function refresh() {
    setLoading(true); setError('')
    try {
      const [published, history] = await Promise.all([client.publications(id, lifetime.current?.signal), client.runs(id, lifetime.current?.signal)])
      if (lifetime.current?.signal.aborted) return
      setVersions(published); setRuns(history)
      setVersion(current => published.some(item => String(item.version) === current) ? current : published[0] ? String(published[0].version) : '')
      setUncertain(current => history.some(item => item.action_id === current && !['OUTCOME_UNKNOWN', 'IN_PROGRESS'].includes(item.response.code)) ? null : current)
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load workflow runs.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    Promise.all([client.publications(id, controller.signal), client.runs(id, controller.signal)]).then(([published, history]) => {
      if (controller.signal.aborted) return
      setVersions(published); setRuns(history); setError('')
      setVersion(current => published.some(item => String(item.version) === current) ? current : published[0] ? String(published[0].version) : '')
      setUncertain(history.find(item => ['OUTCOME_UNKNOWN', 'IN_PROGRESS'].includes(item.response.code))?.action_id ?? null)
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load workflow runs.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, id, client])
  useEffect(() => {
    if (!open || !selected) return
    const controller = new AbortController()
    client.access(id, selected.version, selected.digest, controller.signal).then(value => {
      if (!controller.signal.aborted) setAccess(value)
    }).catch(error => { if (!controller.signal.aborted) { setAccess(null); setError(error instanceof Error ? error.message : 'Could not read workflow access.') } })
    return () => controller.abort()
  }, [client, id, open, selected])
  async function changeAccess() {
    if (!selected || !access || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await client.setAccess(id, selected.version, selected.digest, !access.enabled, lifetime.current?.signal)
      if (!lifetime.current?.signal.aborted) { setAccess(value); setNotice(value.enabled ? 'Workflow access granted. Per-run approval still applies.' : 'Workflow root access removed.') }
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not change access.') }
    finally { setBusy(false) }
  }
  async function execute(previous?: EditorRun) {
    if (busy || (!previous && (!selected || !access?.enabled || uncertain))) return
    let input: Record<string, unknown>
    try {
      const value: unknown = previous?.args ?? JSON.parse(args)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Arguments must be a JSON object.')
      input = value as Record<string, unknown>
    } catch (error) { setError(error instanceof Error ? error.message : 'Invalid arguments.'); return }
    const action = previous?.action_id ?? `editor_${crypto.randomUUID().replaceAll('-', '')}`
    const target = previous ?? selected!
    setBusy(true); setError(''); setNotice(''); setUncertain(action)
    try {
      const result = await client.run(id, { version: target.version, digest: target.digest, action_id: action, args: input,
        ...(previous?.response.request_id ? { approval_request_id: previous.response.request_id } : {}) }, lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return
      if (!['OUTCOME_UNKNOWN', 'IN_PROGRESS'].includes(result.code)) setUncertain(null)
      setNotice(result.code === 'OK' ? 'Workflow completed.' : result.code === 'CONFIRMATION_REQUIRED' ? 'Waiting for approval in Inbox. Return here to resume the same run.' : result.message ?? result.code.replaceAll('_', ' '))
      await refresh()
    } catch (error) {
      if (!lifetime.current?.signal.aborted) {
        if (error instanceof GatewayError && ['verification-cancelled', 'validation', 'too-large'].includes(error.kind)) setUncertain(null)
        setError(error instanceof Error ? error.message : 'Could not confirm the run outcome.')
      }
    } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose() }}><TaskDialogContent title="Workflow runs" description={name}>
    <OverlayBody className="space-y-4">
      <p className="text-sm text-muted-foreground">Runs execute published versions through ToolGate. Draft edits do not affect them.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {uncertain && <p className="break-all text-xs text-muted-foreground">Outcome not confirmed for {uncertain}. Refresh history before creating another run.</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading runs…</p>}
      {!loading && !versions.length && <p className="text-sm">Publish a saved version before running this workflow.</p>}
      {!!versions.length && <>
        <div className="space-y-2"><Label htmlFor="run-version">Published version</Label><Select value={version} disabled={busy} onValueChange={value => { setAccess(null); setVersion(value) }}><SelectTrigger id="run-version"><SelectValue /></SelectTrigger><SelectContent>{versions.map(item => <SelectItem key={item.version} value={String(item.version)}>Version {item.version} · draft {item.revision}{!item.available ? ' · unavailable' : ''}</SelectItem>)}</SelectContent></Select></div>
        {access && <div className="space-y-2 rounded-lg border p-3"><p className="text-sm">{access.actor_name}: {access.enabled ? 'workflow access enabled' : 'no workflow access'}</p><p className="text-xs text-muted-foreground">Access covers this workflow’s published versions. Nested workflows require their own scopes. Existing approval rules remain in effect.</p><Button size="sm" variant="outline" disabled={busy} onClick={() => void changeAccess()}>{access.enabled ? 'Remove workflow access' : 'Allow workflow access'}</Button></div>}
        <div className="space-y-2"><Label htmlFor="run-args">Arguments · JSON</Label><Textarea id="run-args" value={args} disabled={busy} onChange={event => setArgs(event.target.value)} className="min-h-24 font-mono text-xs" spellCheck={false} /></div>
      </>}
      <section aria-label="Recent workflow runs" className="space-y-2"><h3 className="text-sm font-medium">Recent runs</h3>{!runs.length && !loading && <p className="text-xs text-muted-foreground">No recorded runs.</p>}{runs.map(run => <details key={run.action_id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">v{run.version} · {run.response.code === 'OK' ? 'Completed' : run.response.code.replaceAll('_', ' ').toLowerCase()}<span className="ml-2 text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString()}</span></summary><div className="mt-3 space-y-3">
        <p className="break-all text-xs text-muted-foreground">{run.action_id}</p>
        {run.response.message && <p className="text-sm">{run.response.message}</p>}
        {run.response.code === 'CONFIRMATION_REQUIRED' && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link to="/inbox">Review in Inbox</Link></Button><Button size="sm" disabled={busy} onClick={() => void execute(run)}>Resume after approval</Button></div>}
        {run.response.steps?.map(step => <details key={step.nodeId} className="rounded-md bg-muted p-2"><summary className="cursor-pointer text-xs">{step.label} · {step.status}</summary>{step.error && <p className="mt-2 text-xs text-destructive">{step.error}</p>}{step.output !== undefined && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(step.output, null, 2)}</pre>}</details>)}
        {run.response.result !== undefined && <details><summary className="cursor-pointer text-xs font-medium">Result</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(run.response.result, null, 2)}</pre></details>}
      </div></details>)}</section>
    </OverlayBody><FormActions inset><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button><Button variant="outline" disabled={busy || loading} onClick={() => void refresh()}>Refresh history</Button><Button disabled={busy || loading || !selected?.available || !access?.enabled || !!uncertain} onClick={() => void execute()}>{busy ? 'Working…' : 'Run version'}</Button></FormActions>
  </TaskDialogContent></Dialog>
}
