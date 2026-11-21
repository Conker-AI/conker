import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CircleArrowUp, CircleCheck, CircleX, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichAnswer } from '@/components/rich-answer'
import { AttemptLine, Command, ReceiptLine } from '@/components/gateway/server-action-parts'
import { useServerActions } from '@/components/gateway/use-server-actions'
import type { GatewayHostOpsClient } from '@/lib/gateway/host-ops'
import { gatewayError } from '@/lib/gateway/transport'
import type { UpdateOffer, UpdateResult, UpdatesClient, UpdatesOverview } from '@/lib/gateway/updates'
import { UPDATE_EFFECT, when } from '@/lib/server-actions'
import { InboxCard } from './inbox-card'
import { useRefreshState } from '@/components/gateway/use-refresh'

const READ_AGAIN_MS = 60_000
/** The owner's guide to a held update: what to run, which backup to restore, and how to clear the hold. */
const HELD_GUIDE = 'https://github.com/Conker-AI/conker/blob/main/docs/reference/server-care.md#when-an-update-is-held'

/**
 * Conker updates in the Inbox (owner, 2026-11-12: "like a phone app"). The server checks once a day;
 * a newer release is one card with its notes and Update. Update is the host action `update.run`
 * (the password is the OK); the card then shows its receipt, and how the update ended comes back
 * from Pi as its own card. A load that fails shows nothing: the rest of the Inbox is unaffected.
 */
export function UpdateCards({ updates, hostOps, active }: { updates: UpdatesClient; hostOps: GatewayHostOpsClient; active: boolean }) {
  const [overview, setOverview] = useState<UpdatesOverview | null>(null)
  const [pending, setPending] = useState<string | null>(null), [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [starting, setStarting] = useState(false) // one click, one start: busy turns on only once the request is sent
  const load = useCallback(async () => { try { setOverview(await updates.list()) } catch { setOverview(null) } }, [updates])
  const actions = useServerActions(hostOps, () => void load())
  // A check from Refresh or from entering the app found a release: read what Pi now offers.
  const found = useRefreshState(state => state.updateFound)
  useEffect(() => {
    if (!active) return
    queueMicrotask(() => { void load() })
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, READ_AGAIN_MS)
    return () => window.clearInterval(timer)
  }, [active, load, found])
  async function settle(key: string, write: () => Promise<void>) {
    if (pending) return
    setPending(key); setFailure(null)
    try { await write(); await load() } catch (error) { setFailure({ key, message: gatewayError(error).message }) } finally { setPending(null) }
  }
  const receipt = actions.latest('update'), attempt = actions.attempts.update
  const offer = overview?.offer ?? null
  const running = receipt?.outcome === 'working' && receipt.arguments.version === offer?.version ? receipt : null
  const tried = attempt?.action.operation === 'update.run' && attempt.action.arguments.version === offer?.version ? attempt : null
  // An update for this version that was cut off (unknown) or stopped (failed) stays in view. Update
  // stays too: a new run first undoes a cut-off one (scripts/update_core.py recover_interrupted).
  const ended = !running && !tried && receipt && (receipt.outcome === 'unknown' || receipt.outcome === 'failed') && receipt.arguments.version === offer?.version ? receipt : null
  // A start that was refused (busy, unavailable, never arrived) ran nothing: Update and Skip stay.
  const refused = !running && (tried?.state === 'problem' || ended !== null)
  async function update(version: string) {
    if (starting) return
    setStarting(true)
    try { await actions.start({ operation: 'update.run', arguments: { version } }) } finally { setStarting(false) }
  }
  const results = overview?.results ?? [], held = results.filter(result => result.outcome === 'held')
  const dismissResult = (id: string) => () => void settle(id, () => updates.dismiss(id))
  return <>
    {held.map(result => <HeldCard key={result.id} result={result} error={failure?.key === result.id ? failure.message : null} onDismiss={dismissResult(result.id)} />)}
    {offer && <OfferCard offer={offer} held={held.length > 0} busy={starting || pending !== null || actions.busy !== null} error={failure?.key === offer.version ? failure.message : null}
      progress={running ? <ReceiptLine receipt={running} live working="Conker is switching to the new version. This page may lose the connection for a few minutes and reconnects by itself; the result shows here." />
        : tried ? <AttemptLine attempt={tried} onCheck={() => void actions.checkAttempt('update')} />
        : ended ? <div className="flex flex-col gap-1.5"><ReceiptLine receipt={ended} />{ended.outcome === 'unknown' && <p className="text-sm text-muted-foreground">Update again first puts back the version Conker had, if the cut-off update changed anything, then updates.</p>}</div> : null}
      settled={refused}
      onUpdate={() => void update(offer.version)}
      onSkip={() => void settle(offer.version, () => updates.skip(offer.version))} />}
    {results.map(result => result.outcome === 'held' ? null : <ResultCard key={result.id} result={result} outcome={result.outcome} error={failure?.key === result.id ? failure.message : null}
      onDismiss={dismissResult(result.id)} />)}
  </>
}

function published(offer: UpdateOffer) {
  return offer.publishedAt && !Number.isNaN(Date.parse(offer.publishedAt)) ? `published ${when(offer.publishedAt)}` : `found ${when(offer.foundAt * 1000)}`
}

function OfferCard({ offer, held, busy, error, progress, settled, onUpdate, onSkip }: {
  offer: UpdateOffer; held: boolean; busy: boolean; error: string | null; progress: ReactNode; settled: boolean; onUpdate: () => void; onSkip: () => void
}) {
  const locked = progress !== null && !settled
  // While an update is held the server starts no other one, so Update is replaced by the reason (server-care.md).
  return <InboxCard icon={<CircleArrowUp className="text-primary" />} title={offer.title} source={held ? `Waiting for the held update to be fixed · ${published(offer)}` : `New Conker release · ${published(offer)}`}
    primary={locked || held ? undefined : <Button type="button" size="sm" disabled={busy} onClick={onUpdate}>Update</Button>}
    onLater={locked ? undefined : onSkip} laterLabel="Skip this version"
    actions={<>
      {progress}
      {!locked && held && <>
        <p role="status">Update is switched off for now. The last update is held, and Conker starts no new one until you have fixed that. The card above says what to do.</p>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSkip}>Skip this version</Button></div>
      </>}
      {!locked && !held && <>
        <p className="text-muted-foreground">{UPDATE_EFFECT} If the new version doesn’t start properly, Conker goes back to the one it has now by itself.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onUpdate}>Update to {offer.version}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSkip}>Skip this version</Button>
        </div>
      </>}
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    </>}
    facts={[['Release page', <a key="page" href={offer.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{offer.url.replace('https://', '')}</a>], ['On the server', <Command key="cli">{`conker update --to ${offer.version}`}</Command>]]}>
    {offer.notes ? <div className="min-w-0 rounded-md border px-3 py-2"><RichAnswer text={offer.notes} /></div> : <p className="text-muted-foreground">This release has no notes.</p>}
  </InboxCard>
}

const outcomeWords: Record<Exclude<UpdateResult['outcome'], 'held'>, { icon: ReactNode; source: string; next: string | null }> = {
  applied: { icon: <CircleCheck className="text-success-foreground" />, source: 'Conker is running the new version', next: null },
  rolled_back: { icon: <RotateCcw className="text-warning-foreground" />, source: 'Conker went back to the version it had', next: 'Conker is back on the version it had and answers its health checks. If the new version had already changed Pi’s database, Conker put back Pi’s copy from the snapshot taken before the update. If anything else looks wrong, restore that snapshot (Server > Backups).' },
  failed: { icon: <CircleX className="text-muted-foreground" />, source: 'Nothing changed', next: 'The update stopped before switching, so Conker runs as before.' },
}

function ResultCard({ result, outcome, error, onDismiss }: { result: UpdateResult; outcome: Exclude<UpdateResult['outcome'], 'held'>; error: string | null; onDismiss: () => void }) {
  const words = outcomeWords[outcome]
  return <InboxCard icon={words.icon} title={result.title} source={`${words.source} · ${when(result.finishedAt * 1000)}`}
    onLater={onDismiss} laterLabel="Dismiss" summary={words.next ?? undefined}
    actions={error ? <p role="alert" className="text-sm text-destructive-foreground">{error}</p> : undefined}
    facts={result.reason ? [['Why', result.reason]] : []} />
}

/** An update the server could not put back to a working state: what happened, what to do, and where the full steps are. */
function HeldCard({ result, error, onDismiss }: { result: UpdateResult; error: string | null; onDismiss: () => void }) {
  return <InboxCard icon={<TriangleAlert className="text-destructive-foreground" />} title={result.title} source={`Needs you: Conker will not update again until this is fixed · ${when(result.finishedAt * 1000)}`}
    defaultExpanded onLater={onDismiss} laterLabel="Hide for now"
    summary="Conker went back to the old version after the update failed, but could not confirm that the old version works. It stopped there and changed nothing more. It starts no new update until you clear this hold."
    actions={<>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>On the server, run this to see which parts answer:<div className="mt-1"><Command>conker status</Command></div></li>
        <li>Restore the backup Conker took just before the update. A restore makes a separate copy and does not replace the running server by itself, so the last step is done by hand.</li>
        <li>When the server is the way you want it, remove the hold. The guide shows the one file to delete. Updates work again after that.</li>
      </ol>
      <p><a href={HELD_GUIDE} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Read the steps: “When an update is held”</a></p>
      <p className="text-muted-foreground">Hiding this card does not clear the hold.</p>
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    </>}
    facts={result.reason ? [['Why', result.reason]] : []} />
}
