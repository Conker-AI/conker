import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, RotateCcw, ServerOff, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineError } from '@/components/resilience/inline-error'
import { hostProblem, type GatewayHostOpsClient, type HostReceipt } from '@/lib/gateway/host-ops'
import { actionCommand, receiptSource, receiptTime, receiptTitle, sortReceipts, when } from '@/lib/server-actions'
import { RunStateMark } from './tool-result'
import { useServerActions, type ServerAttempt } from './use-server-actions'

/** A command to type on the server, selectable as one piece. */
export function Command({ children }: { children: string }) {
  return <code className="block w-fit max-w-full select-all break-all rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs leading-5">{children}</code>
}

/**
 * The host helper did not answer (503): nothing ran, and the command line on the server still
 * works. A message from the helper itself (for example Docker not answering) is shown as it is.
 */
export function HostUnavailable({ message, commands, onRetry }: { message: string | null; commands: string[]; onRetry?: () => unknown }) {
  const [busy, setBusy] = useState(false)
  return <Alert variant="warning" className="min-w-0">
    <ServerOff />
    <AlertTitle>{message ? 'Your server can’t do this right now' : 'The server helper isn’t running'}</AlertTitle>
    <AlertDescription className="flex flex-col gap-3">
      <p>{message ? `${message} Nothing was changed.` : 'This page reads and changes the server through a small helper on it, and the helper isn’t answering. Nothing was changed.'}</p>
      <div className="flex flex-col gap-1.5"><p>{message ? 'Look at it on the server:' : 'The command line on the server still works:'}</p>{commands.map(command => <Command key={command}>{command}</Command>)}</div>
      {!message && <div className="flex flex-col gap-1.5"><p>To start the helper again, run this on the server:</p><Command>conker providers install-ui-control</Command></div>}
      {onRetry && <Button type="button" size="sm" variant="outline" className="self-start" loading={busy} onClick={async () => { setBusy(true); try { await onRetry() } finally { setBusy(false) } }}><RotateCcw />Try again</Button>}
    </AlertDescription>
  </Alert>
}

/** A read that failed: the helper's own "not available" state, or the usual load error. */
export function HostReadError({ error, onRetry, commands }: { error: unknown; onRetry: () => unknown; commands: string[] }) {
  const problem = hostProblem(error)
  return problem.kind === 'unavailable' ? <HostUnavailable message={problem.message} commands={commands} onRetry={onRetry} /> : <InlineError error={error} onRetry={onRetry} />
}

// The helper's reasons carry their next step; these cover a reason without one.
const NO_START = 'The command could not start on the server.'
const nextStep = (receipt: HostReceipt) => receipt.reason === null || receipt.reason === NO_START ? 'Try again in a moment. If it keeps happening, look at the server with conker status.' : null

/**
 * One server action in the shared state words: Working with its step, Done only on the helper's
 * receipt, Failed with why and what next, Unknown with a Check that only reads.
 */
export function ReceiptLine({ receipt, live, working, onCheck, checking, checkLabel = 'Check', finding }: {
  receipt: HostReceipt; live?: boolean; working?: ReactNode; onCheck?: () => void; checking?: boolean; checkLabel?: string; finding?: string | null
}) {
  return <div className="flex min-w-0 flex-col gap-1.5 text-sm">
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
      <RunStateMark state={receipt.outcome} /><span role={live ? 'status' : undefined}>{receiptTitle(receipt)}</span>
      <span className="font-normal text-muted-foreground">· {receipt.outcome === 'working' ? `started ${when(receipt.startedAt)}` : when(receiptTime(receipt))}{receipt.source === 'cli' ? ` · ${receiptSource(receipt)}` : ''}</span>
    </p>
    {receipt.outcome === 'working' && <p className="text-muted-foreground">{working ?? 'You can leave this page; the result shows here when it ends.'}</p>}
    {receipt.outcome === 'failed' && <><p className="text-destructive-foreground">{receipt.reason ?? 'It didn’t finish.'}</p>{nextStep(receipt) && <p className="text-muted-foreground">{nextStep(receipt)}</p>}</>}
    {receipt.outcome === 'unknown' && <>
      <p className="text-warning-foreground">{receipt.reason ?? 'It was cut off before it finished, so it may or may not have happened.'}</p>
      <p className="text-muted-foreground">Nothing is retried by itself. Check what happened, then decide.</p>
      {finding && <p role="status" className="rounded-md border px-3 py-2">{finding}</p>}
      {onCheck && <Button type="button" size="sm" variant="outline" className="self-start" disabled={checking} onClick={onCheck}>{checking ? 'Checking…' : checkLabel}</Button>}
    </>}
  </div>
}

const problemWords = {
  busy: 'Another server action is running. Wait for it to finish.',
  refused: 'Your server turned this down.',
  unavailable: 'The server helper isn’t answering.',
}
/** A start without a receipt: sending, lost (Unknown with a Check by id), or turned down (nothing ran). */
export function AttemptLine({ attempt, onCheck }: { attempt: ServerAttempt; onCheck: () => void }) {
  if (attempt.state === 'sending') return <p role="status" className="flex items-center gap-2 text-sm font-medium"><RunStateMark state="working" />Sending to your server…</p>
  if (attempt.state === 'lost') return <div className="flex flex-col gap-1.5 text-sm">
    <p className="flex items-center gap-2 font-medium"><RunStateMark state="unknown" />Can’t tell if it started</p>
    <p className="text-warning-foreground">The answer was lost on the way back, so it may or may not have started.</p>
    <p className="text-muted-foreground">Nothing is sent twice. Check reads what your server recorded for it.</p>
    <Button type="button" size="sm" variant="outline" className="self-start" disabled={attempt.checking} onClick={onCheck}>{attempt.checking ? 'Checking…' : 'Check'}</Button>
  </div>
  const problem = attempt.problem
  if (problem?.kind === 'not-found') return <p role="status" className="text-sm">It never reached your server, so nothing ran. You can start it again.</p>
  const busy = problem?.kind === 'busy'
  const message = problem?.message ?? (problem?.kind === 'busy' || problem?.kind === 'refused' || problem?.kind === 'unavailable' ? problemWords[problem.kind] : null) ?? 'It didn’t start.'
  return <p role="alert" className="flex items-start gap-2 text-sm">
    {busy ? <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />}
    <span>Didn’t start: {message} Nothing ran.</span>
  </p>
}

const placeOf = (receipt: HostReceipt) => receipt.operation === 'services.restart' ? { to: `/system?tab=services&service=${encodeURIComponent(receipt.arguments.service ?? '')}`, label: 'Open in Services' }
  : receipt.operation.startsWith('backup.') ? { to: '/system?tab=backups', label: 'Open Backups' } : null

/** The journal's latest actions (Overview): live first, then Unknown and Failed. Receipts only: what, when, how it ended. */
export function RecentServerActions({ client }: { client: GatewayHostOpsClient }) {
  const actions = useServerActions(client)
  const [all, setAll] = useState(false)
  const rows = actions.rows ? sortReceipts(actions.rows) : null
  return <section aria-labelledby="recent-server-actions" className="flex min-w-0 flex-col gap-2">
    <h2 id="recent-server-actions" className="text-base font-semibold">Recent server actions</h2>
    {actions.loadError && !rows ? <HostReadError error={actions.loadError} onRetry={actions.refresh} commands={['conker ops list']} />
      : !rows ? <div role="status" aria-label="Reading recent server actions" className="flex flex-col gap-2"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
        : !rows.length ? <p className="text-sm text-muted-foreground">None yet. Restarts and backups started here, or with <code className="font-mono text-xs">conker ops run</code> on the server, show here.</p>
          : <>
            <ul className="divide-y rounded-lg border">{(all ? rows : rows.slice(0, 5)).map(receipt => <li key={receipt.id}><details className="group" open={receipt.outcome === 'unknown' || undefined}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <RunStateMark state={receipt.outcome} /><span className="min-w-0 flex-1"><span className="block font-medium">{receiptTitle(receipt)}</span><span className="block truncate text-muted-foreground">{receiptSource(receipt).replace(/^./, letter => letter.toUpperCase())}</span></span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when(receiptTime(receipt))}</span>
              </summary>
              <div className="flex flex-col gap-3 border-t px-3 py-3 text-sm">
                {receipt.outcome === 'done' ? <p className="text-muted-foreground">Started {when(receipt.startedAt)}, ended {when(receiptTime(receipt))}.</p>
                  : receipt.outcome === 'working' ? <p className="text-muted-foreground">Started {when(receipt.startedAt)}. The result shows here when it ends.</p>
                    : <p className={receipt.outcome === 'failed' ? 'text-destructive-foreground' : 'text-warning-foreground'}>{receipt.reason}</p>}
                <div className="flex flex-wrap items-center gap-2">{placeOf(receipt) && <Button size="sm" variant="outline" render={<Link to={placeOf(receipt)!.to} />}>{placeOf(receipt)!.label}</Button>}</div>
                <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">More details</summary><div className="mt-2 flex flex-col gap-1.5"><p>Same action on the server:</p><Command>{actionCommand(receipt)}</Command><p className="break-all font-mono">{receipt.id}</p></div></details>
              </div>
            </details></li>)}</ul>
            {rows.length > 5 && !all && <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>Show all {rows.length}</Button>}
            {actions.damaged > 0 && <p className="text-xs text-muted-foreground">{actions.damaged} damaged {actions.damaged === 1 ? 'line' : 'lines'} in the server’s action journal {actions.damaged === 1 ? 'was' : 'were'} skipped.</p>}
          </>}
  </section>
}
