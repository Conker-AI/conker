import { Link } from 'react-router-dom'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { Button } from '@/components/ui/button'
import { WorkspaceSection } from '@/components/design-system'

import { nativeClaudeConnectionRules } from './subscription-rules'
import { useSubscriptionActionFocus } from './subscription-focus'
import { useSubscriptionConnection } from './use-subscription-connection'
import { SubscriptionFeedback, SubscriptionRefresh } from './subscription-status'

export function NativeClaudeConnection({ client, authStore }: { client: GatewayControlClient; authStore: GatewayAuthStore }) {
  const state = useSubscriptionConnection(client.claude, authStore, nativeClaudeConnectionRules)
  const current = state.phase === 'current'
  const value = state.phase === 'uncertain' || state.phase === 'inactive' || state.phase === 'unavailable' && state.notice !== 'paused' ? null : state.value
  const focus = useSubscriptionActionFocus(state.source, authStore, state.phase)
  return <WorkspaceSection title="Claude Code" description="Sign in using the official Claude Code app and your own subscription. Claude Code keeps the credentials; Conker runs text requests through that app." action={<SubscriptionRefresh phase={state.phase} paused={state.pollingPaused} refresh={state.refresh} focusRef={focus.target} />}>
    <SubscriptionFeedback {...state} />
    {value && <p role="status" className="text-sm text-muted-foreground">{!current ? `Last checked: ${value.connected ? 'connected' : value.loginState === 'pending' ? 'sign-in pending' : 'not connected'}` : !value.available ? 'Claude Code is not available on this host.' : value.connected ? 'Connected · inference not yet verified' : value.loginState === 'pending' ? 'Waiting for you to finish sign-in in the browser' : 'Not connected'}</p>}
    {value?.available && <div className="flex flex-wrap gap-2">
      {value.loginState === 'pending' ? <><Button variant="outline" size="sm" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'cancel', loginId: value.loginId! }) } }}>Cancel sign-in</Button>{value.authorizationUrl && <Button asChild size="sm"><a href={value.authorizationUrl} target="_blank" rel="noreferrer noopener">Continue sign-in</a></Button>}</> : value.connected ? <Button variant="outline" size="sm" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'logout' }) } }}>Disconnect Claude Code</Button> : <><Button size="sm" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'login', billing: 'subscription' }) } }}>Sign in with Claude subscription</Button><Button size="sm" variant="outline" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'login', billing: 'api' }) } }}>Use Claude Console</Button></>}
    </div>}
    <p className="text-xs text-muted-foreground">Choose provider “claude-code” with model “sonnet”, “opus”, or “haiku” below. Native tool execution is separate from Conker’s text-only model roles.</p>
    <p className="text-sm"><Link className="underline underline-offset-4" to="/system?tab=terminal">Open the native Codex / Claude terminal</Link></p>
  </WorkspaceSection>
}
