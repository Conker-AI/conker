import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { EditorRun, GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'
import { gatewayError } from '@/lib/gateway/transport'
import type { JsonValue } from '@/lib/tool-workspace'
import { findRunTarget, initialValues, inputsLine, readRunInputs, runFields, runOutcome, workflowTool, RUN_STATE, type RunAnswer, type RunState, type RunTarget, type ToolInput } from '@/lib/tool-run'
import { RunDetails, RunResult, RunStateMark } from './tool-result'
import { RunInputsForm } from './tool-run-form'

/** One run: started here now, or read back from the tool's recent runs. */
type Run = { actionId: string; args: Record<string, JsonValue>; version: number; digest: string; state: RunState; answer?: RunAnswer; reason?: string | null; requestId?: string | null; at: number
  /** Unknown because the answer never came back (not because the server said so): check before running again. */
  lost?: boolean }

// The request never left the browser (or the password step stopped it): nothing ran.
const NOT_SENT = new Set(['verification-cancelled', 'verification-password', 'verification-required', 'verification-failed', 'validation', 'too-large', 'configuration', 'browser-expired'])
const REFUSED: Record<number, string> = {
  403: 'Conker’s key can’t run tools on your server right now, so it didn’t run.',
  404: 'This version isn’t published any more, so it didn’t run.',
  409: 'This tool changed since you opened it, so it didn’t run. Close it, open it again and run it.',
  422: 'Your server didn’t accept these inputs, so it didn’t run. Check them and try again.',
}
const when = (at: number) => new Date(at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fromHistory = (row: EditorRun): Run => ({ actionId: row.action_id, args: row.args as Record<string, JsonValue>, version: row.version, digest: row.digest, answer: row.response, ...runOutcome(row.response), at: Date.parse(row.created_at) })

/**
 * Run a tool by hand: its inputs as a form, Run now, what happened, and the runs started here.
 * Only tools made in Tools can run by hand (the editor run route); it runs the published version
 * Conker sees, as Conker's key, under the same approval rules; the password step comes first.
 */
export function ToolRunPanel({ tool, drafts }: { tool: { id: string; inputs: readonly ToolInput[] }; drafts: GatewayEditorDrafts }) {
  const id = useId()
  const workflow = useMemo(() => workflowTool(tool.id), [tool.id])
  const fields = useMemo(() => runFields(tool.inputs), [tool.inputs])
  const [target, setTarget] = useState<RunTarget | null | undefined>(undefined)
  const [lookup, setLookup] = useState(0), [lookupFailed, setLookupFailed] = useState(false)
  const [history, setHistory] = useState<EditorRun[] | null>(null), [historyFailed, setHistoryFailed] = useState(false)
  const [values, setValues] = useState(() => initialValues(fields)), [errors, setErrors] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState<Run | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [checking, setChecking] = useState(false), [all, setAll] = useState(false), [now, setNow] = useState(Date.now)
  const lifetime = useRef<AbortController | null>(null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  useEffect(() => {
    if (!workflow) return
    const controller = new AbortController()
    findRunTarget(drafts, workflow, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setTarget(value); setLookupFailed(false) } })
      .catch(() => { if (!controller.signal.aborted) setLookupFailed(true) })
    return () => controller.abort()
  }, [drafts, workflow, lookup])
  const loadHistory = useCallback(async () => {
    if (!target) return null
    try {
      const rows = await drafts.runs(target.draftId, lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return null
      setHistory(rows); setHistoryFailed(false)
      return rows
    } catch { if (!lifetime.current?.signal.aborted) setHistoryFailed(true); return null }
  }, [drafts, target])
  useEffect(() => {
    if (!target) return
    void loadHistory().then(rows => {
      // Back after leaving: a run still waiting for his OK, or not confirmed, is where he left it.
      const newest = rows?.[0] && fromHistory(rows[0])
      if (newest && (newest.state === 'approval' || newest.state === 'unknown')) setCurrent(value => value ?? newest)
    })
  }, [target, loadHistory])
  const working = current?.state === 'working'
  useEffect(() => {
    if (!working) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [working])

  async function run(resume?: Run) {
    if (!target || working || checking) return
    let args = resume?.args
    if (!args) {
      const read = readRunInputs(fields, values)
      if (read.errors) {
        setErrors(read.errors)
        // The first field to fix gets focus, so a missed one is never silent.
        const first = fields.find(field => read.errors[field.name])
        if (first) form.current?.querySelector<HTMLElement>(`[id="${id}-${first.name}"]`)?.focus()
        return
      }
      args = read.args
    }
    const next: Run = { actionId: resume?.actionId ?? `editor_${crypto.randomUUID().replaceAll('-', '')}`, args, version: resume?.version ?? target.version, digest: resume?.digest ?? target.digest, state: 'working', at: Date.now() }
    setErrors({}); setNotice(null); setNow(Date.now()); setCurrent(next)
    try {
      const answer = await drafts.run(target.draftId, { version: next.version, digest: next.digest, action_id: next.actionId, args, ...(resume?.requestId ? { approval_request_id: resume.requestId } : {}) }, lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return
      const outcome = runOutcome(answer)
      setCurrent({ ...next, ...outcome, answer, reason: resume && outcome.state === 'approval' ? 'Still waiting: approve it in the Inbox first.' : outcome.reason })
      void loadHistory()
    } catch (error) {
      if (lifetime.current?.signal.aborted) return
      const failure = gatewayError(error)
      if (NOT_SENT.has(failure.kind)) { setCurrent(resume ?? null); setNotice(`${failure.message} Nothing ran.`); return }
      if (failure.kind === 'http' || failure.kind === 'upstream-denied' || failure.kind === 'rate-limited') {
        setCurrent({ ...next, state: 'failed', reason: REFUSED[failure.status ?? 0] ?? 'Your server turned this run down, so it didn’t run.' }); return
      }
      // Sent, but the answer was lost: it may or may not have run, and it is never resent by itself.
      setCurrent({ ...next, state: 'unknown', lost: true })
    }
  }

  /** Reads the run back from the server instead of guessing; an unrecorded run never started. */
  async function check() {
    if (!current || checking) return
    setChecking(true); setNotice(null)
    const rows = await loadHistory()
    if (lifetime.current?.signal.aborted) return
    setChecking(false)
    if (!rows) { setNotice('Couldn’t reach your server to check. Try again in a moment.'); return }
    const row = rows.find(item => item.action_id === current.actionId)
    if (!row) { setCurrent(null); setNotice('It never reached your server, so nothing ran. You can run it again.'); return }
    setCurrent(fromHistory(row))
  }

  if (!workflow) return <NotRunnableByHand />
  if (lookupFailed) return <div role="alert" className="flex flex-col items-start gap-2 text-sm"><p>Couldn’t get this tool ready to run: your server didn’t answer.</p><Button type="button" size="sm" variant="outline" onClick={() => { setLookupFailed(false); setLookup(value => value + 1) }}>Try again</Button></div>
  if (target === undefined) return <div role="status" aria-label="Getting the tool ready to run" className="flex flex-col gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-9 w-full max-w-xl" /><Skeleton className="h-9 w-28" /></div>
  if (target === null) return <p className="text-sm leading-6 text-muted-foreground">You can’t run this tool from here: its draft isn’t among your <Link className="font-medium text-foreground underline underline-offset-4" to="/tools?view=drafts">tool drafts</Link>. Conker can still use it in a chat.</p>
  const draftLink = <Link className="font-medium text-foreground underline underline-offset-4" to={`/tools?draft=${encodeURIComponent(target.draftId)}`}>its draft</Link>
  const blocked = !target.available || working || checking || (current?.state === 'unknown' && current.lost)
  const others = (history ?? []).filter(row => row.action_id !== current?.actionId)
  return <div className="flex flex-col gap-5">
    <form ref={form} noValidate aria-labelledby={`${id}-run`} className="flex max-w-xl flex-col gap-4" onSubmit={event => { event.preventDefault(); void run() }}>
      <h4 id={`${id}-run`} className="text-xs font-medium text-muted-foreground">Run it yourself</h4>
      {fields.length ? <RunInputsForm id={id} fields={fields} values={values} errors={errors} disabled={working} onChange={(name, value) => { setValues(previous => ({ ...previous, [name]: value })); setErrors(previous => { const left = { ...previous }; delete left[name]; delete left['']; return left }) }} />
        : <p className="text-sm text-muted-foreground">It takes no inputs.</p>}
      {errors[''] && <p role="alert" className="text-sm text-destructive-foreground">{errors['']}</p>}
      {Object.keys(errors).length > 0 && !errors[''] && <p role="alert" className="text-sm text-destructive-foreground">Fix the {Object.keys(errors).length === 1 ? 'field' : `${Object.keys(errors).length} fields`} above, then run it.</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" size="lg" className="max-sm:h-(--control-height-lg) max-sm:w-full" disabled={blocked}><Play aria-hidden="true" />{working ? 'Running…' : 'Run now'}</Button>
        <p className="text-sm text-muted-foreground">{!target.available ? <>This version can’t run right now. Publish {draftLink} again.</> : target.authorization === 'owner_confirmation' ? 'It asks for your OK in the Inbox before it runs.' : 'It runs without asking in the Inbox first.'}</p>
      </div>
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>
    {current && <section aria-label="This run" className="flex max-w-3xl flex-col gap-3 rounded-lg border p-4">
      <RunOutcome live run={current} now={now} draftLink={draftLink} busy={working || checking} onContinue={() => void run(current)} onCheck={() => void check()} checking={checking} />
    </section>}
    <section aria-labelledby={`${id}-history`} className="flex flex-col gap-2">
      <h4 id={`${id}-history`} className="text-xs font-medium text-muted-foreground">Your recent runs</h4>
      {history === null && !historyFailed ? <Skeleton className="h-10 w-full" />
        : historyFailed && history === null ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><p>Your recent runs didn’t load.</p><Button type="button" size="sm" variant="outline" onClick={() => void loadHistory()}>Try again</Button></div>
          : !others.length ? <p className="text-sm text-muted-foreground">{current ? 'No other runs yet.' : 'None yet.'} Runs Conker makes show in its chats.</p>
            : <>
              <ul className="divide-y rounded-lg border">{(all ? others : others.slice(0, 5)).map(row => <HistoryRow key={row.action_id} run={fromHistory(row)} draftLink={draftLink} busy={working || checking} onContinue={value => void run(value)} />)}</ul>
              {others.length > 5 && !all && <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>Show all {others.length}</Button>}
              <p className="text-sm text-muted-foreground">Runs Conker makes show in its chats.</p>
            </>}
    </section>
  </div>
}

/** One run's state in words, what it gave back, and the one next step it needs. */
function RunOutcome({ run, now, draftLink, busy, checking, live, onContinue, onCheck }: { run: Run; now: number; draftLink: ReactNode; busy: boolean; checking?: boolean; live?: boolean; onContinue: () => void; onCheck?: () => void }) {
  const seconds = Math.max(0, Math.round((now - run.at) / 1000))
  return <>
    <p className="flex items-center gap-2 text-sm font-medium"><RunStateMark state={run.state} /><span role={live ? 'status' : undefined}>{RUN_STATE[run.state]}</span><span className="font-normal text-muted-foreground" aria-hidden={run.state === 'working' || undefined}>· {run.state === 'working' ? `${seconds} s` : when(run.at)}</span></p>
    {run.state === 'working' && <p className="text-sm text-muted-foreground">You can leave this page. The result shows in Your recent runs.</p>}
    {run.state === 'done' && run.answer && <RunResult answer={run.answer} />}
    {run.state === 'failed' && <div className="flex flex-col gap-1 text-sm"><p className="text-destructive-foreground">{run.reason}</p>
      <p className="text-muted-foreground">{run.answer?.code === 'WORKFLOW_FAILED' ? <>Steps before it may have run. Change the inputs and run it again, or fix {draftLink}.</> : 'Change what’s needed and run it again.'}</p></div>}
    {run.state === 'approval' && <div className="flex flex-col gap-2 text-sm">
      <p>{run.reason ?? 'Approve it in the Inbox, then come back and press Continue. Nothing runs until you approve.'}</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy || !run.requestId} onClick={onContinue}>Continue</Button><Button type="button" size="sm" variant="outline" render={<Link to="/inbox" />}>Open Inbox</Button></div>
    </div>}
    {run.state === 'unknown' && <div className="flex flex-col gap-2 text-sm">
      <p className="text-warning-foreground">{run.lost ? 'The answer was lost, so it may or may not have run.' : 'Not confirmed: your server hasn’t recorded how it ended. It may still be running.'}</p>
      <p className="text-muted-foreground">{run.lost ? 'Nothing is sent twice. Check before running it again.' : 'Check again in a moment, and look at what this tool changes before you run it again.'}</p>
      {onCheck && <Button type="button" size="sm" variant="outline" className="self-start" disabled={busy} onClick={onCheck}>{checking ? 'Checking…' : 'Check again'}</Button>}
    </div>}
    {run.state !== 'working' && <RunDetails answer={run.answer} version={run.version} actionId={run.actionId} />}
  </>
}

function HistoryRow({ run, draftLink, busy, onContinue }: { run: Run; draftLink: ReactNode; busy: boolean; onContinue: (run: Run) => void }) {
  return <li><details className="group">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm hover:bg-accent [&::-webkit-details-marker]:hidden">
      <RunStateMark state={run.state} /><span className="min-w-0 flex-1"><span className="block font-medium">{RUN_STATE[run.state]}</span><span className="block truncate text-muted-foreground">{inputsLine(run.args)}</span></span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when(run.at)}</span>
    </summary>
    <div className="flex flex-col gap-3 border-t px-3 py-3"><RunOutcome run={run} now={run.at} draftLink={draftLink} busy={busy} onContinue={() => onContinue(run)} /></div>
  </details></li>
}

/** Tools that are not made in Tools have no route to run them by hand yet. */
export function NotRunnableByHand() {
  return <p className="text-sm leading-6 text-muted-foreground">You can’t run this tool by hand yet; only tools made in Tools can. Conker can use it in a chat.</p>
}
