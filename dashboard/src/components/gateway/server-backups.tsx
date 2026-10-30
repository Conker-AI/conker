import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, FolderPlus, HardDrive, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CollectionEmpty, CollectionLoading, CollectionRow, CollectionSection, InlineDetails, OverlayBody, PageHeader, WorkspaceAction, WorkspaceSection } from '@/components/design-system'
import type { GatewayHostOpsClient, HostBackupList, HostReceipt } from '@/lib/gateway/host-ops'
import { backupPlace, bytes, receiptTime, receiptTitle, snapshotTime, span, when } from '@/lib/server-actions'
import { GatewayPageFrame } from './page-frame'
import { AttemptLine, Command, HostReadError, ReceiptLine } from './server-action-parts'
import { RunStateMark } from './tool-result'
import { useServerActions, type ServerActions } from './use-server-actions'

const DAY = 24 * 3600_000
const commands = ['conker backup --destination DIR', 'conker verify-backup DIR/SNAPSHOT']
const pausing = 'Conker is paused while it copies: chats, tools and memory wait until it is done. This page may lose the connection; it reconnects by itself and reads the result.'

/**
 * Server > Backups: where the backups are and what that place does not protect against, free
 * space, the snapshots, Check per snapshot and Back up now. Both actions ask for the password and
 * show the helper's receipt; an unknown outcome is checked by reading the folder, never retried.
 */
export function GatewayServerBackups({ client }: { client: GatewayHostOpsClient }) {
  const [list, setList] = useState<HostBackupList | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [now, setNow] = useState(Date.now)
  const [findings, setFindings] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  const read = useCallback(async () => {
    try {
      const value = await client.backups(lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return null
      setList(value); setError(null); setNow(Date.now())
      return value
    } catch (cause) { if (!lifetime.current?.signal.aborted) setError(cause); return null }
  }, [client])
  useEffect(() => { void read() }, [read])
  const actions = useServerActions(client, receipt => { if (receipt.operation === 'backup.run') void read() })

  /** Unknown backup: read the folder and say whether a new backup is there; never backs up again. */
  const check = async (receipt: HostReceipt) => {
    setChecking(receipt.id)
    const value = await read()
    setChecking(null)
    const newer = value?.snapshots.find(item => Date.parse(item.createdAt) >= Date.parse(receipt.startedAt) - 60_000)
    const finding = !value ? 'Couldn’t read the backup folder to check. Try again in a moment.'
      : newer ? `Checked ${when(Date.now())}: a backup from ${snapshotTime(newer.createdAt)} is in the folder. Check it below before you rely on it.`
        : `Checked ${when(Date.now())}: no new backup is in the folder, so it didn’t finish.${value.partialSnapshots ? ' An unfinished copy was left behind; it is never used.' : ''} Back up again when you are ready.`
    setFindings(current => ({ ...current, [receipt.id]: finding }))
  }

  const run = actions.latest('backup'), runAttempt = actions.attempts.backup
  const selected = params.get('snapshot')
  const close = () => setParams(current => { const next = new URLSearchParams(current); next.delete('snapshot'); return next })
  const hold = list?.recoveryHeld ? 'A recovery is held. Finish or abort it on the server with conker recovery-status first.'
    : list?.backupLock && run?.outcome !== 'working' ? 'A backup is running from the server, or one was cut off. Wait for it, or check the folder on the server before trying again.' : null
  const blocked = !!actions.busy || !!hold || !list?.ready || runAttempt?.state === 'lost'
  return <GatewayPageFrame><div className="flex max-w-4xl flex-col gap-6">
    <PageHeader actionsOnly title="Backups" actions={<WorkspaceAction iconOnly aria-label="Read backups again" title="Read backups again" disabled={!list && !error} onClick={() => { void read(); void actions.refresh() }}><RefreshCw /></WorkspaceAction>} />
    {error && !list ? <HostReadError error={error} onRetry={read} commands={commands} />
      : !list ? <CollectionLoading label="Reading your backup folder…" />
        : list.destination === null ? <FirstUse />
          : <>
            <WorkspaceSection divided={false} title={!list.ready ? 'Can’t see the backup folder' : list.snapshots[0] ? `Last backup ${span(now - Date.parse(list.snapshots[0].createdAt))} ago` : 'No backups yet'}
              description={list.snapshots[0] ? `${snapshotTime(list.snapshots[0].createdAt)} · ${list.snapshots.length} kept${list.retentionCopies ? ` of ${list.retentionCopies}` : ''}` : list.ready ? 'Press Back up now to make the first one.' : 'Its disk may not be mounted.'} />
            {error ? <HostReadError error={error} onRetry={read} commands={commands} /> : null}
            <Place list={list} />
            {hold && <Alert variant="warning"><TriangleAlert /><AlertTitle>Backups are waiting</AlertTitle><AlertDescription>{hold}</AlertDescription></Alert>}
            <section aria-label="Back up now" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button type="button" size="lg" className="max-sm:h-(--control-height-lg) max-sm:w-full" disabled={blocked} onClick={() => void actions.start({ operation: 'backup.run', arguments: {} })}><Archive />Back up now</Button>
                <p className="text-sm text-muted-foreground">Conker pauses for a few minutes while it copies, then checks the copy.</p>
              </div>
              {actions.busy && 'operation' in actions.busy && actions.busy.operation !== 'backup.run' && <p role="status" className="flex items-center gap-2 text-sm"><RunStateMark state="working" />{receiptTitle(actions.busy)} Backups wait until it ends.</p>}
              {runAttempt ? <AttemptLine attempt={runAttempt} onCheck={() => void actions.checkAttempt('backup')} />
                : run && (run.outcome === 'working' || run.outcome === 'unknown' || now - Date.parse(receiptTime(run)) < DAY) && <div className="rounded-lg border p-4">
                  <ReceiptLine live={run.outcome === 'working'} receipt={run} working={actions.reachable ? pausing : `${pausing} Can’t reach your server right now; checking again by itself.`} onCheck={() => void check(run)} checking={checking === run.id} finding={findings[run.id]} />
                </div>}
            </section>
            {list.snapshots.length ? <CollectionSection title="Backups in the folder"><ul>{list.snapshots.map(item => <SnapshotRow key={item.name} now={now} name={item.name} createdAt={item.createdAt} open={selected === item.name} onClose={close} actions={actions} blocked={!!actions.busy || !!hold || !list.ready} folder={list.destination!} />)}</ul></CollectionSection>
              : list.ready ? <CollectionEmpty icon={<Archive />} title="No backups in the folder yet" description="The first backup takes a few minutes. Conker pauses while it copies." /> : null}
            {list.partialSnapshots > 0 && <p className="text-sm text-muted-foreground">{list.partialSnapshots === 1 ? 'One unfinished backup is' : `${list.partialSnapshots} unfinished backups are`} in the folder. They were cut off, aren’t listed and are never used.</p>}
            {selected && !list.snapshots.some(item => item.name === selected) && <p role="status" className="text-sm text-muted-foreground">That backup isn’t in the folder any more.</p>}
          </>}
  </div></GatewayPageFrame>
}

/** No folder saved yet: the one setup step, on the server (it has to know which disk to use). */
function FirstUse() {
  return <Card className="flex flex-row items-start gap-3 p-5">
    <FolderPlus aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-base font-semibold">Choose where backups go</h2>
      <p className="text-sm leading-6 text-muted-foreground">No backup folder is saved yet. Pick a folder on a second disk if this computer has one: it survives the system disk failing. Run this once on the server, with your own folder:</p>
      <Command>conker setup configure protection --destination /mnt/backup-disk/conker --retention 7</Command>
      <p className="text-sm leading-6 text-muted-foreground"><span className="font-mono text-xs text-foreground">--retention 7</span> keeps the newest 7 backups. Then come back here and press Back up now.</p>
    </div>
  </Card>
}

/** Where the backups are, free space, and what this place does not protect against. */
function Place({ list }: { list: HostBackupList }) {
  const place = backupPlace(list)
  return <Card className="flex flex-col gap-3 p-5">
    <div className="flex items-start gap-3"><HardDrive aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-base font-semibold">{place.title}</h2>
        <p className="break-all font-mono text-xs leading-5 text-muted-foreground">{list.destination}</p>
      </div>
    </div>
    {list.ready ? <>
      <p className="flex items-start gap-2 text-sm font-medium"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />{place.risk}</p>
      {place.protects && <p className="text-sm text-muted-foreground">{place.protects} A copy on another machine is not set up yet.</p>}
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Free space</dt><dd>{list.freeBytes === null ? 'Unknown' : bytes(list.freeBytes)}</dd>
        <dt className="text-muted-foreground">Keeps</dt><dd>{list.retentionCopies ? `The newest ${list.retentionCopies}` : 'Every backup'}</dd>
      </dl>
    </> : <p role="alert" className="flex items-start gap-2 text-sm"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-foreground" />The backup folder isn’t there. Check that the backup disk is mounted, then read the backups again.</p>}
  </Card>
}

function SnapshotRow({ now, name, createdAt, open, onClose, actions, blocked, folder }: {
  now: number; name: string; createdAt: string; open: boolean; onClose: () => void; actions: ServerActions; blocked: boolean; folder: string
}) {
  const target = `snapshot:${name}`, receipt = actions.latest(target), attempt = actions.attempts[target]
  const recent = receipt && (receipt.outcome === 'working' || now - Date.parse(receiptTime(receipt)) < DAY) ? receipt : null
  const verify = () => void actions.start({ operation: 'backup.verify', arguments: { snapshot: name } })
  const trailing = attempt?.state === 'lost' ? <span className="flex items-center gap-1.5"><RunStateMark state="unknown" />Can’t tell</span>
    : recent ? <span className="flex items-center gap-1.5"><RunStateMark state={recent.outcome} /><span className="max-sm:sr-only">{recent.outcome === 'working' ? 'Checking' : recent.outcome === 'done' ? 'Passed its check' : recent.outcome === 'failed' ? 'Didn’t pass' : 'Can’t tell'}</span></span> : undefined
  const details = open && <InlineDetails title={`Backup from ${snapshotTime(createdAt)}`} description={`${span(now - Date.parse(createdAt))} old`} onClose={onClose}>
    <OverlayBody><div className="flex flex-col gap-5">
      <p className="text-sm leading-6">Check reads every file in this backup and compares it with its saved fingerprints. Conker keeps running; nothing is changed or restored.</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="button" className="max-sm:h-(--control-height-lg) max-sm:w-full" disabled={blocked || attempt?.state === 'lost'} onClick={verify}><ShieldCheck />Check this backup</Button>
        {blocked && recent?.outcome !== 'working' && <p className="text-sm text-muted-foreground">Another server action is running, or backups are waiting. Check waits until it ends.</p>}
      </div>
      {attempt ? <AttemptLine attempt={attempt} onCheck={() => void actions.checkAttempt(target)} />
        : receipt && <ReceiptLine live={receipt.outcome === 'working'} receipt={receipt} onCheck={blocked ? undefined : verify} checkLabel="Check this backup again" />}
      <details className="text-sm text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">More details</summary>
        <div className="mt-2 flex flex-col gap-1.5"><p className="break-all">Folder: <code className="font-mono text-xs">{name}</code></p><p>On the server:</p><Command>{`conker verify-backup ${folder.replace(/\/+$/, '')}/${name}`}</Command></div>
      </details>
    </div></OverlayBody>
  </InlineDetails>
  return <CollectionRow to={open ? '/system?tab=backups' : `/system?tab=backups&snapshot=${encodeURIComponent(name)}`} expanded={open} details={details}
    leading={<Archive className="size-4 text-muted-foreground" />} title={snapshotTime(createdAt)} description={`${span(now - Date.parse(createdAt))} old`} trailing={trailing} />
}
