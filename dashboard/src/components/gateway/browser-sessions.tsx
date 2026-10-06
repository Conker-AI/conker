import { useEffect, useRef, useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { Button } from '@/components/ui/button'
import { WorkspaceSection } from '@/components/design-system'

type Sessions = Awaited<ReturnType<GatewayControlClient['browserSessions']['list']>>
export function BrowserSessions({ client }: { client: GatewayControlClient }) {
  const [value, setValue] = useState<Sessions | null>(null), [error, setError] = useState('')
  const [reload, setReload] = useState(0), [pending, setPending] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    client.browserSessions.list(controller.signal).then(next => { if (!controller.signal.aborted) { setValue(next); setError('') } }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Sessions unavailable.') })
    return () => controller.abort()
  }, [client, reload])
  async function revoke(id: string | null) {
    if (pending) return
    const controller = new AbortController()
    request.current = controller
    setPending(true); setError('')
    try { await client.browserSessions.revoke(id, controller.signal); if (!controller.signal.aborted) setReload(value => value + 1) }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Revocation not confirmed. Refresh before trying again.') }
    finally { if (!controller.signal.aborted) setPending(false); request.current = null }
  }
  return <WorkspaceSection title="Browser sessions" description="Only browser access is revoked. Your background jobs keep running." action={<Button size="sm" variant="outline" disabled={pending} onClick={() => setReload(value => value + 1)}><RefreshCw />Refresh</Button>}>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!value && !error && <p role="status" className="text-sm text-muted-foreground">Loading signed-in sessions...</p>}
    {value?.length === 0 && <p className="text-sm text-muted-foreground">No signed-in browser sessions.</p>}
    {value && <div className="divide-y">{value.map((session, index) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 space-y-1"><p className="text-sm font-medium">{session.current ? 'This browser' : `Browser session ${index + 1}`}</p><p className="text-xs text-muted-foreground">Signed in {new Date(session.created * 1000).toLocaleString()} · Expires {new Date(session.expires * 1000).toLocaleString()}</p></div><Button size="sm" variant="outline" disabled={pending} onClick={() => void revoke(session.id)}><LogOut />Sign out</Button></div>)}</div>}
    <Button size="sm" variant="outline" disabled={pending || !value?.length} onClick={() => void revoke(null)}><LogOut />Sign out all browsers</Button>
    <p className="text-xs text-muted-foreground">Signing out this browser or all browsers also ends your current session.</p>
  </WorkspaceSection>
}
