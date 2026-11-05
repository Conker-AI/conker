import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PasswordAlerts } from '@/lib/gateway/password-alerts'
import { InboxCard, type InboxFact } from './inbox-card'

function relative(seconds: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - seconds * 1000) / 60000))
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : `${Math.floor(minutes / 1440)} days ago`
}
/** Where a wrong password came from, in plain words. */
const passwordAlertOrigin: Record<PasswordAlerts['results'][number]['origin'], string> = {
  new_device: 'A new browser',
  known_device: 'A browser you signed in on before',
  signed_in: 'This signed-in session',
}

/**
 * Someone typed a wrong password against this gateway. One card, only while attempts are unseen:
 * "That was me" marks them seen; "Sign out everywhere" revokes every browser session (it asks the
 * password itself) and then marks them seen.
 */
export function PasswordAlertCard({ alerts, now, busy, error, onSeen, onRevokeAll }: {
  alerts: PasswordAlerts; now: number; busy: boolean; error: string | null; onSeen: () => void; onRevokeAll: () => void
}) {
  const unseen = alerts.results.filter(alert => !alert.seen)
  const last = unseen[0]?.at ?? alerts.results[0]?.at ?? 0
  const source = `${alerts.unseen} ${alerts.unseen === 1 ? 'time' : 'times'} · last ${relative(last, now)}`
  return <InboxCard icon={<ShieldAlert className="text-warning-foreground" />} title="Someone typed a wrong password" source={source}
    primary={<Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSeen}>That was me</Button>}
    actions={<>
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
      <div className="flex flex-col gap-1">
        {unseen.map((alert, index) => <p key={`${alert.at}-${index}`} className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-foreground">{relative(alert.at, now)} · {new Date(alert.at * 1000).toLocaleString()}</span>
          <span className="text-muted-foreground">{passwordAlertOrigin[alert.origin]}</span>
        </p>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSeen}>That was me</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRevokeAll}>Sign out everywhere</Button>
      </div>
    </>}
    facts={[['Attempts not seen', String(alerts.unseen)]] as InboxFact[]} />
}
