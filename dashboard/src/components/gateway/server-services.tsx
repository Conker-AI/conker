import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, CircleMinus, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CollectionLoading, CollectionRow, CollectionSection, InlineDetails, OverlayBody, PageHeader, WorkspaceAction, WorkspaceSection } from '@/components/design-system'
import type { GatewayHostOpsClient, HostReceipt, HostService, HostServicesStatus } from '@/lib/gateway/host-ops'
import { receiptTitle, receiptTime, restartEffect, serviceFine, serviceJob, serviceLabel, serviceState, servicesSummary, when } from '@/lib/server-actions'
import { GatewayPageFrame } from './page-frame'
import { AttemptLine, Command, HostReadError, ReceiptLine } from './server-action-parts'
import { RunStateMark } from './tool-result'
import { useServerActions, type ServerActions } from './use-server-actions'

const DAY = 24 * 3600_000
const commands = ['conker status', 'conker restart SERVICE']

/**
 * Server > Services: each Compose service with its state, health, start time and restarts, read
 * through the host helper. Restart is in the service's details, asks for the password in a sheet
 * that names what it pauses, runs one at a time and shows the helper's receipt.
 */
export function GatewayServerServices({ client }: { client: GatewayHostOpsClient }) {
  const [status, setStatus] = useState<HostServicesStatus | null>(null)
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState<unknown>(null)
  const [findings, setFindings] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  const read = useCallback(async () => {
    try {
      const value = await client.status(lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return null
      setStatus(value); setError(null); setNow(Date.now())
      return value
    } catch (cause) { if (!lifetime.current?.signal.aborted) setError(cause); return null }
  }, [client])
  useEffect(() => { void read() }, [read])
  const actions = useServerActions(client, receipt => { if (receipt.operation === 'services.restart') void read() })

  /** Unknown restart: read the services again and say what that shows; never restarts again. */
  const check = async (receipt: HostReceipt) => {
    setChecking(receipt.id)
    const value = await read()
    setChecking(null)
    const name = receipt.arguments.service ?? '', label = serviceLabel(name)
    const row = value?.services.find(item => item.service === name)
    const finding = !value ? 'Couldn’t read your services to check. Try again in a moment.'
      : !row ? `${label} isn’t in this install any more.`
        : row.state !== 'running' ? `Checked ${when(Date.now())}: ${label} isn’t running (${serviceState(row).toLocaleLowerCase()}). Restart it again, or look at its logs on the server.`
          : row.startedAt && Date.parse(row.startedAt) >= Date.parse(receipt.startedAt) - 5000 ? `Checked ${when(Date.now())}: ${label} is running and started at ${when(row.startedAt)}, after the restart began, so the restart went through.`
            : `Checked ${when(Date.now())}: ${label} is running, but it started before the restart began, so it didn’t restart.`
    setFindings(current => ({ ...current, [receipt.id]: finding }))
  }

  const selected = params.get('service')
  const rows = status ? [...status.services].sort((a, b) => Number(serviceFine(a)) - Number(serviceFine(b)) || serviceLabel(a.service).localeCompare(serviceLabel(b.service))) : []
  const lasting = rows.filter(row => !row.oneShot), once = rows.filter(row => row.oneShot)
  const hold = status?.recoveryHeld ? 'A recovery is held. Finish or abort it on the server with conker recovery-status first.'
    : status?.backupLock ? 'A backup is running or was cut off, so restarts wait. Check the Backups page before trying again.' : null
  const row = (item: HostService) => <ServiceRow key={item.service} now={now} item={item} open={selected === item.service} actions={actions} hold={hold} finding={findings} checking={checking} onCheck={check}
    onClose={() => setParams(current => { const next = new URLSearchParams(current); next.delete('service'); return next })} />
  return <GatewayPageFrame><div className="flex max-w-4xl flex-col gap-6">
    <PageHeader actionsOnly title="Services" actions={<WorkspaceAction iconOnly aria-label="Read services again" title="Read services again" disabled={!status && !error} onClick={() => { void read(); void actions.refresh() }}><RefreshCw /></WorkspaceAction>} />
    {error && !status ? <HostReadError error={error} onRetry={read} commands={commands} />
      : !status ? <CollectionLoading label="Reading your services…" />
        : <>
          <WorkspaceSection divided={false} title={servicesSummary(status)} description={`Read ${when(now)}. Open a service to restart it; it asks for your password first.`} />
          {error ? <HostReadError error={error} onRetry={read} commands={commands} /> : null}
          {hold && <Alert variant="warning"><TriangleAlert /><AlertTitle>Restarts are waiting</AlertTitle><AlertDescription>{hold}</AlertDescription></Alert>}
          {actions.busy && 'operation' in actions.busy && actions.busy.operation !== 'services.restart' && <p role="status" className="flex items-center gap-2 text-sm"><RunStateMark state="working" />{receiptTitle(actions.busy)} Restarts wait until it ends.</p>}
          {lasting.length ? <CollectionSection title="Services"><ul>{lasting.map(row)}</ul></CollectionSection>
            : <p className="text-sm text-muted-foreground">No services are running in this install. Start Conker on the server with <code className="font-mono text-xs">conker start</code>.</p>}
          {once.length > 0 && <CollectionSection title="Run once when Conker starts"><ul>{once.map(row)}</ul></CollectionSection>}
          {selected && !rows.some(item => item.service === selected) && <p role="status" className="text-sm text-muted-foreground">This service isn’t in this install.</p>}
        </>}
    <p className="text-sm text-muted-foreground">Every container on this server, also ones outside Conker: <Link to="/system?tab=containers" className="font-medium text-foreground underline underline-offset-4">Containers</Link></p>
  </div></GatewayPageFrame>
}

function StateIcon({ item }: { item: HostService }) {
  if (item.oneShot) return <CircleMinus className="size-4 text-muted-foreground" />
  if (serviceFine(item)) return <CircleCheck className="size-4 text-muted-foreground" />
  return item.state === 'running' || item.state === 'restarting' ? <TriangleAlert className="size-4 text-warning-foreground" /> : <CircleAlert className="size-4 text-destructive-foreground" />
}

function ServiceRow({ now, item, open, actions, hold, finding, checking, onCheck, onClose }: {
  now: number; item: HostService; open: boolean; actions: ServerActions; hold: string | null
  finding: Record<string, string>; checking: string | null; onCheck: (receipt: HostReceipt) => void; onClose: () => void
}) {
  const target = `service:${item.service}`, label = serviceLabel(item.service)
  const receipt = actions.latest(target), attempt = actions.attempts[target]
  // A row shows what happened to it today; older receipts stay in Recent server actions.
  const recent = receipt && (receipt.outcome === 'working' || now - Date.parse(receiptTime(receipt)) < DAY) ? receipt : null
  const blocked = !!actions.busy || !!hold || item.oneShot || !!attempt && attempt.state === 'lost'
  // The last read predates the restart, so its "Running" is old news until the list is read again.
  const state = recent?.outcome === 'working' || attempt?.state === 'sending' ? 'Restarting…'
    : recent?.outcome === 'done' && now < Date.parse(receiptTime(recent)) ? 'Restarted, reading its state…'
      : serviceState(item, now)
  const trailing = attempt?.state === 'lost' ? <span className="flex items-center gap-1.5"><RunStateMark state="unknown" />Can’t tell</span>
    : recent ? <span className="flex items-center gap-1.5"><RunStateMark state={recent.outcome} /><span className="max-sm:sr-only">{recent.outcome === 'working' ? 'Restarting' : recent.outcome === 'done' ? `Restarted ${when(receiptTime(recent))}` : recent.outcome === 'failed' ? 'Didn’t restart' : 'Can’t tell'}</span></span>
      : item.restarts > 0 && !item.oneShot ? `${item.restarts} ${item.restarts === 1 ? 'restart' : 'restarts'}` : undefined
  const details = open && <InlineDetails title={label} description={serviceJob(item.service) ?? undefined} onClose={onClose}>
    <OverlayBody><div className="flex flex-col gap-5">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">State</dt><dd>{state}</dd>
        {!item.oneShot && <><dt className="text-muted-foreground">Started</dt><dd>{item.startedAt ? when(item.startedAt) : 'Not running'}</dd>
          <dt className="text-muted-foreground">Restarted by itself</dt><dd>{item.restarts === 0 ? 'Never' : `${item.restarts} ${item.restarts === 1 ? 'time' : 'times'}`}{item.restarts > 0 && <span className="text-muted-foreground"> (it stopped and Docker started it again)</span>}</dd></>}
      </dl>
      {item.oneShot ? <p className="text-sm text-muted-foreground">This step runs once each time Conker starts, so it can’t be restarted on its own.</p> : <div className="flex flex-col gap-3">
        <p className="text-sm leading-6">{restartEffect(item.service)}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button type="button" className="max-sm:h-(--control-height-lg) max-sm:w-full" disabled={blocked} onClick={() => void actions.start({ operation: 'services.restart', arguments: { service: item.service } })}><RotateCcw />Restart {label}</Button>
          {blocked && recent?.outcome !== 'working' && attempt?.state !== 'sending' && <p className="text-sm text-muted-foreground">{hold ? 'Waiting: see above.' : actions.busy ? 'Another server action is running. Restart waits until it ends.' : 'Check the last restart first.'}</p>}
        </div>
      </div>}
      {attempt ? <AttemptLine attempt={attempt} onCheck={() => void actions.checkAttempt(target)} />
        : receipt && <ReceiptLine live={receipt.outcome === 'working'} receipt={receipt} working={item.service === 'gateway' ? 'This page may lose the connection for a moment; it reconnects by itself and reads the result.' : undefined}
          onCheck={() => onCheck(receipt)} checking={checking === receipt.id} finding={finding[receipt.id]} />}
      <details className="text-sm text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">More details</summary>
        <div className="mt-2 flex flex-col gap-1.5"><p>Service name: <code className="font-mono text-xs">{item.service}</code></p><p>On the server:</p><Command>{`conker restart ${item.service}`}</Command><Command>{`conker logs ${item.service}`}</Command></div>
      </details>
    </div></OverlayBody>
  </InlineDetails>
  return <CollectionRow to={open ? '/system?tab=services' : `/system?tab=services&service=${encodeURIComponent(item.service)}`} expanded={open} details={details}
    leading={<StateIcon item={item} />} title={label} description={state} trailing={trailing} />
}
