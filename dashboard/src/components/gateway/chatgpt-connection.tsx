import { useEffect } from 'react'
import { ExternalLink, LogIn, RefreshCw } from 'lucide-react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { ChatGPTStatus } from '@/lib/gateway/chatgpt'
import { Button } from '@/components/ui/button'
import { WorkspaceSection } from '@/components/design-system'
import { chatGPTConnectionRules } from './subscription-rules'
import { useSubscriptionActionFocus } from './subscription-focus'
import { useSubscriptionConnection } from './use-subscription-connection'
import { SubscriptionFeedback, SubscriptionRefresh } from './subscription-status'

export function ChatGPTConnection({ client, authStore, onModels }: { client: GatewayControlClient; authStore: GatewayAuthStore; onModels: (models: ChatGPTStatus['models']) => void }) {
  const state = useSubscriptionConnection(client.chatgpt, authStore, chatGPTConnectionRules)
  const current = state.phase === 'current'
  const value = state.phase === 'uncertain' || state.phase === 'inactive' || state.phase === 'unavailable' && state.notice !== 'paused' ? null : state.value
  const focus = useSubscriptionActionFocus(state.source, authStore, state.phase)
  useEffect(() => { onModels(current && value?.connected ? value.models : []) }, [current, value, onModels])
  return <WorkspaceSection title="ChatGPT" description="Use your ChatGPT subscription through Codex sign-in. No OpenAI API key or separate API billing; your plan’s usage limits still apply." action={<SubscriptionRefresh phase={state.phase} paused={state.pollingPaused} refresh={state.refresh} focusRef={focus.target} />}>
    <SubscriptionFeedback {...state} />
    {value && !value.available && <p role="status" className="text-sm leading-6 text-muted-foreground">{value.problem === 'provider_operation_failed' || value.problem === 'runtime_unavailable' ? 'The subscription connection cannot be checked right now. Refresh before continuing; existing authorization has not been removed.' : 'Subscription sign-in is unavailable. This installation needs the private provider service and its pinned Codex runtime. No credentials can be sent.'}</p>}
    {value?.available && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm">{!current ? `Last checked: ${value.connected ? 'connected' : value.loginState === 'pending' ? 'sign-in pending' : 'not connected'}` : value.connected ? `Connected${value.plan && value.plan !== 'unknown' ? ` · ${value.plan}` : ''}` : value.loginState === 'pending' ? 'Waiting for OpenAI authorization' : 'Not connected'}</p>
        {value.connected ? <Button variant="outline" size="sm" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'logout', connectionId: value.connectionId! }) } }}>Disconnect</Button> : value.loginState === 'pending' && value.loginId ? <Button variant="outline" size="sm" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'cancel', loginId: value.loginId! }) } }}>Cancel sign-in</Button> : <Button variant="outline" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'login' }) } }}><LogIn />Sign in with ChatGPT</Button>}
      </div>
      {value.deviceCode && value.loginId && <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm">Enter this one-time code on OpenAI to authorize this Conker server.</p>
        <p className="break-all font-mono text-lg" aria-label="OpenAI device code">{value.deviceCode.userCode}</p>
        <Button variant="outline" asChild><a href={value.deviceCode.verificationUrl} target="_blank" rel="noreferrer noopener"><ExternalLink />Continue on OpenAI</a></Button>
        <p className="text-xs text-muted-foreground">This sign-in attempt expires 15 minutes after it starts. Keep this code private. Device-code sign-in may need to be enabled in your ChatGPT security settings.</p>
      </div>}
      {!value.deviceCode && value.loginState === 'pending' && <p className="text-sm text-muted-foreground">A sign-in attempt is already pending. Its code is not retained in the browser; cancel it to start a new attempt.</p>}
      {['failed', 'expired'].includes(value.loginState) && !value.connected && <p role="status" className="text-sm text-muted-foreground">Sign-in {value.loginState === 'expired' ? 'expired' : 'did not complete'}. Try again after checking ChatGPT device-code access.</p>}
      {value.connected && <>
        <p className="text-sm leading-6 text-muted-foreground">Credentials stay on this server. Disconnecting stops models using this connection, but does not revoke other OpenAI sessions. Conker’s tool permissions are unchanged.</p>
        <div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={event => { if (current) { focus.remember(event); void state.apply({ operation: 'models' }) } }}><RefreshCw />Read available models</Button><p className="text-xs text-muted-foreground">{value.models.length ? `${value.models.length} catalogue entries${value.catalogueComplete ? '' : ' · partial catalogue'}` : 'Model access is not yet verified.'}</p></div>
      </>}
    </>}
  </WorkspaceSection>
}
