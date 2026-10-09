import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { NativeClaudeStatus } from '@/lib/gateway/native-claude'
import { Button } from '@/components/ui/button'
import { WorkspaceSection } from '@/components/design-system'

export function NativeClaudeConnection({ client }: { client: GatewayControlClient }) {
  const [value, setValue] = useState<NativeClaudeStatus | null>(null), [error, setError] = useState(''), [pending, setPending] = useState(false), [reload, setReload] = useState(0)
  const lifetime = useRef<AbortController | null>(null)
  const mutating = useRef(false), epoch = useRef(0)
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  useEffect(() => {
    if (pending) return
    const controller = new AbortController()
    const generation = ++epoch.current
    client.claude.status(controller.signal).then(next => { if (!controller.signal.aborted && generation === epoch.current) { setValue(next); setError('') } }).catch(error => { if (!controller.signal.aborted && generation === epoch.current) setError(error.message) })
    return () => controller.abort()
  }, [client, reload, pending])
  useEffect(() => { if (value?.loginState !== 'pending' || pending) return; const timer = setInterval(() => setReload(value => value + 1), 3000); return () => clearInterval(timer) }, [value?.loginState, pending])
  async function apply(operation: 'login' | 'cancel' | 'logout', billing?: 'subscription' | 'api') {
    if (mutating.current || !lifetime.current) return
    mutating.current = true; ++epoch.current
    const signal = lifetime.current.signal
    setPending(true); setError('')
    try { const next = await client.claude.apply(operation, billing, signal); if (!signal.aborted) setValue(next) }
    catch (error) { if (!signal.aborted) setError(error instanceof Error ? error.message : 'Operation was not confirmed. Refresh status.') }
    finally { mutating.current = false; if (!signal.aborted) setPending(false) }
  }
  return <WorkspaceSection title="Claude Code" description="Sign in using the official Claude Code app and your own subscription. Claude Code keeps the credentials; Conker runs text requests through that app." action={<Button variant="ghost" size="sm" disabled={pending} onClick={() => { setError(''); setReload(value => value + 1) }}>Refresh</Button>}>
    <p role="status" className="text-sm text-muted-foreground">{!value ? 'Checking native app…' : !value.available ? 'Claude Code is not available on this host.' : value.connected ? 'Connected · inference not yet verified' : value.loginState === 'pending' ? 'Waiting for you to finish sign-in in the browser' : 'Not connected'}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {value?.available && <div className="flex flex-wrap gap-2">
      {value.loginState === 'pending' ? <><Button variant="outline" size="sm" disabled={pending} onClick={() => void apply('cancel')}>Cancel sign-in</Button>{value.authorizationUrl && <Button asChild size="sm"><a href={value.authorizationUrl} target="_blank" rel="noreferrer">Continue sign-in</a></Button>}</> : value.connected ? <Button variant="outline" size="sm" disabled={pending} onClick={() => void apply('logout')}>Disconnect Claude Code</Button> : <><Button size="sm" disabled={pending} onClick={() => void apply('login', 'subscription')}>Sign in with Claude subscription</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => void apply('login', 'api')}>Use Claude Console</Button></>}
    </div>}
    <p className="text-xs text-muted-foreground">Choose provider “claude-code” with model “sonnet”, “opus”, or “haiku” below. Native tool execution is separate from Conker’s text-only model roles.</p>
    <p className="text-sm"><Link className="underline underline-offset-4" to="/system?tab=terminal">Open the native Codex / Claude terminal</Link></p>
  </WorkspaceSection>
}
