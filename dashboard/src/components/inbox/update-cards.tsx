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

const READ_AGAIN_MS = 60_000

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
  useEffect(() => {
    if (!active) return
    queueMicrotask(() => { void load() })
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, READ_AGAIN_MS)
    return () => window.clearInterval(timer)
  }, [active, load])
  async function settle(key: string, write: () => Promise<void>) {
    if (pending) return
    setPending(key); setFailure(null)
    try { await write(); await load() } catch (error) { setFailure({ key, message: gatewayError(error).message }) } finally { setPending(null) }
  }
  const receipt = actions.latest('update'), attempt = actions.attempts.update
  const offer = overview?.offer ?? null
  const running = receipt?.outcome === 'working' && receipt.arguments.version === offer?.version ? receipt : null
  const tried = attempt?.action.operation === 'update.run' && attempt.action.arguments.version === offer?.version ? attempt : null
  // A start that was refused (busy, unavailable, never arrived) ran nothing: Update and Skip stay.
  const refused = !running && tried?.state === 'problem'
  async function update(version: string) {
    if (starting) return
    setStarting(true)
    try { await actions.start({ operation: 'update.run', arguments: { version } }) } finally { setStarting(false) }
  }
  return <>
    {offer && <OfferCard offer={offer} busy={starting || pending !== null || actions.busy !== null} error={failure?.key === offer.version ? failure.message : null}
      progress={running ? <ReceiptLine receipt={running} live working="Conker is switching to the new version. This page may lose the connection for a few minutes and reconnects by itself; the result shows here." />
        : tried ? <AttemptLine attempt={tried} onCheck={() => void actions.checkAttempt('update')} /> : null}
      settled={refused}
      onUpdate={() => void update(offer.version)}
      onSkip={() => void settle(offer.version, () => updates.skip(offer.version))} />}
    {(overview?.results ?? []).map(result => <ResultCard key={result.id} result={result} error={failure?.key === result.id ? failure.message : null}
      onDismiss={() => void settle(result.id, () => updates.dismiss(result.id))} />)}
  </>
}

function published(offer: UpdateOffer) {
  return offer.publishedAt && !Number.isNaN(Date.parse(offer.publishedAt)) ? `published ${when(offer.publishedAt)}` : `found ${when(offer.foundAt * 1000)}`
}

function OfferCard({ offer, busy, error, progress, settled, onUpdate, onSkip }: {
  offer: UpdateOffer; busy: boolean; error: string | null; progress: ReactNode; settled: boolean; onUpdate: () => void; onSkip: () => void
}) {
  const locked = progress !== null && !settled
  return <InboxCard icon={<CircleArrowUp className="text-primary" />} title={offer.title} source={`New Conker release · ${published(offer)}`}
    primary={locked ? undefined : <Button type="button" size="sm" disabled={busy} onClick={onUpdate}>Update</Button>}
    onLater={locked ? undefined : onSkip} laterLabel="Skip this version"
    actions={<>
      {progress}
      {!locked && <>
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

const outcomeWords: Record<UpdateResult['outcome'], { icon: ReactNode; source: string; next: string | null }> = {
  applied: { icon: <CircleCheck className="text-success-foreground" />, source: 'Conker is running the new version', next: null },
  rolled_back: { icon: <RotateCcw className="text-warning-foreground" />, source: 'Conker went back to the version it had', next: 'Conker is back on the version it had and answers its health checks. The new version may already have changed saved data before it failed: if anything looks wrong, restore the snapshot taken before the update (Server > Backups).' },
  held: { icon: <TriangleAlert className="text-destructive-foreground" />, source: 'Needs you: restore the snapshot', next: 'Conker could not prove the old version works again, so it stopped and changes nothing more. Restore the snapshot taken before the update (Server > Backups, or conker recovery-status on the server).' },
  failed: { icon: <CircleX className="text-muted-foreground" />, source: 'Nothing changed', next: 'The update stopped before switching, so Conker runs as before.' },
}

function ResultCard({ result, error, onDismiss }: { result: UpdateResult; error: string | null; onDismiss: () => void }) {
  const words = outcomeWords[result.outcome]
  return <InboxCard icon={words.icon} title={result.title} source={`${words.source} · ${when(result.finishedAt * 1000)}`}
    onLater={onDismiss} laterLabel="Dismiss" summary={words.next ?? undefined}
    actions={error ? <p role="alert" className="text-sm text-destructive-foreground">{error}</p> : undefined}
    facts={result.reason ? [['Why', result.reason]] : []} />
}
