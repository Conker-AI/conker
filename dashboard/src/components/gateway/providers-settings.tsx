import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, LogIn, RefreshCw } from 'lucide-react'
import type { GatewayControlClient, OwnerModelSettings, ProviderStatus } from '@/lib/gateway/control'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { ChatGPTOperation, ChatGPTStatus } from '@/lib/gateway/chatgpt'
import { ModelsProviders } from '@/app/settings/models-providers'
import { Button } from '@/components/ui/button'
import { WorkspaceSection } from '@/components/design-system'
import { GatewayPageFrame } from './page-frame'
import { NativeClaudeConnection } from './native-claude-connection'
import { ProviderCredentials } from './provider-credentials'
import { useProviderReadiness } from './use-provider-readiness'
import { readRuntimeWithDeadline } from './runtime-read-deadline'

const names: Record<string, string> = { ollama: 'Local model', decisions: 'Decisions (Laya)', 'claude-code': 'Claude Code subscription', chatgpt: 'ChatGPT subscription', openai: 'OpenAI API', openrouter: 'OpenRouter', anthropic: 'Anthropic' }
const readiness = (value: ProviderStatus) => value.busy ? 'Busy' : value.status === 'ok' ? 'Ready' : value.status === 'unverified' ? 'Configured, inference not verified' : value.status === 'not_configured' ? 'Not connected' : 'Unavailable'
type SubscriptionConnection = 'checking' | 'connected' | 'disconnected' | 'unavailable'
const subscriptionConnection = (value: ChatGPTStatus): SubscriptionConnection => !value.available ? 'unavailable' : value.connected ? 'connected' : 'disconnected'
const ownerIdentity = (authStore: GatewayAuthStore) => {
  const auth = authStore.getState()
  return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? auth.session.sessionId : null
}

export function ChatGPTConnection({ client, onModels, onConnection }: { client: GatewayControlClient; onModels: (models: ChatGPTStatus['models']) => void; onConnection?: (connection: SubscriptionConnection) => void }) {
  const [value, setValue] = useState<ChatGPTStatus | null>(null)
  const [device, setDevice] = useState<NonNullable<ChatGPTStatus['deviceCode']> | null>(null)
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [reload, setReload] = useState(0)
  const lifetime = useRef<AbortController | null>(null)
  const readEpoch = useRef(0), mutating = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => { controller.abort(); lifetime.current = null }
  }, [])
  useEffect(() => {
    if (mutating.current) return
    const epoch = ++readEpoch.current
    const controller = new AbortController()
    client.chatgpt.status(controller.signal).then(result => {
      if (!controller.signal.aborted && epoch === readEpoch.current) { setValue(result); onModels(result.models); onConnection?.(subscriptionConnection(result)); if (result.loginState !== 'pending') setDevice(null) }
    }).catch(error => {
      if (!controller.signal.aborted && epoch === readEpoch.current) { setValue(null); onModels([]); onConnection?.('unavailable'); setError(error.message) }
    })
    return () => controller.abort()
  }, [client, reload, onModels, onConnection, pending])
  useEffect(() => {
    if (!value?.loginId || pending) return
    const interval = window.setInterval(() => setReload(number => number + 1), 3000)
    return () => window.clearInterval(interval)
  }, [value?.loginId, pending])
  async function apply(operation: ChatGPTOperation) {
    const signal = lifetime.current?.signal
    if (mutating.current || !signal || signal.aborted) return
    mutating.current = true
    ++readEpoch.current
    setPending(true); setError('')
    try {
      const result = await client.chatgpt.apply(operation, signal)
      if (!signal.aborted) { setValue(result); setDevice(result.deviceCode ?? null); onModels(result.models); onConnection?.(subscriptionConnection(result)) }
    } catch (error) { if (!signal.aborted) { setError(error instanceof Error ? error.message : 'ChatGPT operation was not confirmed. Refresh status before retrying.'); setReload(number => number + 1) } }
    finally { mutating.current = false; if (!signal.aborted) setPending(false) }
  }
  return <WorkspaceSection title="ChatGPT" description="Use your ChatGPT subscription through Codex sign-in. No OpenAI API key or separate API billing; your plan’s usage limits still apply." action={<Button size="sm" variant="ghost" disabled={pending} onClick={() => { setError(''); setReload(number => number + 1) }}><RefreshCw />Refresh</Button>}>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!value && !error && <p role="status" className="text-sm text-muted-foreground">Checking subscription connection...</p>}
    {value && !value.available && <p role="status" className="text-sm leading-6 text-muted-foreground">{value.problem === 'provider_operation_failed' || value.problem === 'runtime_unavailable' ? 'The subscription connection cannot be checked right now. Refresh before continuing; existing authorization has not been removed.' : 'Subscription sign-in is unavailable. This installation needs the private provider service and its pinned Codex runtime. No credentials can be sent.'}</p>}
    {value?.available && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm">{value.connected ? `Connected${value.plan && value.plan !== 'unknown' ? ` · ${value.plan}` : ''}` : value.loginId ? 'Waiting for OpenAI authorization' : 'Not connected'}</p>
        {value.connected ? <Button variant="outline" size="sm" disabled={pending} onClick={() => void apply({ operation: 'logout', connectionId: value.connectionId! })}>Disconnect</Button> : value.loginId ? <Button variant="outline" size="sm" disabled={pending} onClick={() => void apply({ operation: 'cancel', loginId: value.loginId! })}>Cancel sign-in</Button> : <Button variant="outline" disabled={pending} onClick={() => void apply({ operation: 'login' })}><LogIn />Sign in with ChatGPT</Button>}
      </div>
      {device && value.loginId && <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm">Enter this one-time code on OpenAI to authorize this Conker server.</p>
        <p className="break-all font-mono text-lg" aria-label="OpenAI device code">{device.userCode}</p>
        <Button variant="outline" asChild><a href={device.verificationUrl} target="_blank" rel="noreferrer noopener"><ExternalLink />Continue on OpenAI</a></Button>
        <p className="text-xs text-muted-foreground">Expires in about 15 minutes. Keep this code private. Device-code sign-in may need to be enabled in your ChatGPT security settings.</p>
      </div>}
      {!device && value.loginId && <p className="text-sm text-muted-foreground">A sign-in attempt is already pending. Its code is not retained in the browser; cancel it to start a new attempt.</p>}
      {['failed', 'expired'].includes(value.loginState) && !value.connected && <p role="status" className="text-sm text-muted-foreground">Sign-in {value.loginState === 'expired' ? 'expired' : 'did not complete'}. Try again after checking ChatGPT device-code access.</p>}
      {value.connected && <>
        <p className="text-sm leading-6 text-muted-foreground">Credentials stay on this server. Disconnecting stops models using this connection, but does not revoke other OpenAI sessions. Conker’s tool permissions are unchanged.</p>
        <div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" disabled={pending} onClick={() => void apply({ operation: 'models' })}><RefreshCw />Read available models</Button><p className="text-xs text-muted-foreground">{value.models.length ? `${value.models.length} catalogue entries${value.catalogueComplete ? '' : ' · partial catalogue'}` : 'Model access is not yet verified.'}</p></div>
      </>}
      {pending && <p role="status" className="text-xs text-muted-foreground">Confirming operation...</p>}
    </>}
  </WorkspaceSection>
}

export function GatewayProvidersSettings({ client, authStore }: { client: GatewayControlClient; authStore: GatewayAuthStore }) {
  const source = useMemo(() => ({ client, authStore }), [client, authStore])
  const [catalogue, setCatalogue] = useState<{ source: typeof source; value: OwnerModelSettings } | null>(null)
  const value = catalogue?.source === source ? catalogue.value : null
  const [models, setModels] = useState<ChatGPTStatus['models']>([])
  const [error, setError] = useState('')
  const [saveSource, setSaveSource] = useState<typeof source | null>(null), [reload, setReload] = useState(0)
  const pending = saveSource === source
  const health = useProviderReadiness(client, authStore, reload)
  const catalogueRead = useRef<AbortController | null>(null), catalogueWrite = useRef<AbortController | null>(null)
  const catalogueEpoch = useRef(0), catalogueMounted = useRef(false), saving = useRef(false)
  useEffect(() => {
    catalogueMounted.current = true
    let identity = ownerIdentity(authStore)
    const invalidate = () => { ++catalogueEpoch.current; catalogueRead.current?.abort(); catalogueWrite.current?.abort(); catalogueRead.current = null; catalogueWrite.current = null; saving.current = false }
    const unsubscribe = authStore.subscribe(() => {
      const next = ownerIdentity(authStore)
      if (identity === next) return
      identity = next; invalidate(); setCatalogue(null); setError(''); setSaveSource(null)
      if (next) setReload(number => number + 1)
    })
    return () => { catalogueMounted.current = false; unsubscribe(); invalidate() }
  }, [client, authStore])
  useEffect(() => {
    const identity = ownerIdentity(authStore)
    if (!identity || saving.current) return
    const controller = new AbortController(), epoch = ++catalogueEpoch.current
    catalogueRead.current = controller
    const current = () => catalogueMounted.current && epoch === catalogueEpoch.current && identity === ownerIdentity(authStore)
    readRuntimeWithDeadline(signal => client.models(signal), controller).then(result => { if (current() && !controller.signal.aborted) { setCatalogue({ source, value: result }); setError('') } }).catch(() => { if (current()) setError('Model settings could not be read. Try again.') })
    return () => controller.abort()
  }, [client, authStore, source, reload])
  return <GatewayPageFrame><div className="w-full max-w-3xl space-y-7">
    <ChatGPTConnection client={client} onModels={setModels} />
    <NativeClaudeConnection client={client} />
    <details><summary className="w-fit cursor-pointer rounded-md py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">API-key providers</summary><ProviderCredentials client={client} onChanged={() => setReload(number => number + 1)} /></details>
    <WorkspaceSection title="Runtime readiness" description="Connection and catalogue entries do not prove a model can answer." action={<Button variant="ghost" size="sm" className="aria-disabled:opacity-50" disabled={health.phase === 'inactive'} aria-disabled={health.phase === 'checking'} aria-busy={health.phase === 'checking'} onClick={() => { if (health.phase === 'current' || health.phase === 'unavailable') void health.refresh() }}><RefreshCw />{health.phase === 'checking' ? 'Checking…' : health.phase === 'unavailable' ? 'Try again' : 'Refresh'}</Button>}>
      {health.phase === 'checking' && <p role="status" className="text-sm text-muted-foreground">Checking provider readiness…</p>}
      {health.phase === 'unavailable' && <p role="status" className="text-sm text-muted-foreground">Provider readiness could not be checked. Try again to read the current status.</p>}
      {health.phase !== 'current' && health.rows.length > 0 && <p className="text-xs text-muted-foreground">Provider and model names below are from the last successful check.</p>}
      <dl className="divide-y text-sm">{health.rows.map(provider => <div key={provider.id} className="flex flex-wrap justify-between gap-2 py-3"><dt className="min-w-0 break-words">{names[provider.id] ?? provider.id}{provider.model && <span className="text-muted-foreground"> · {health.phase !== 'current' ? 'Last checked model: ' : ''}{provider.model}</span>}</dt><dd className="text-muted-foreground">{health.phase === 'checking' ? 'Checking…' : health.phase !== 'current' ? 'Unavailable' : readiness(provider)}</dd></div>)}</dl>
    </WorkspaceSection>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {value ? <ModelsProviders key={value.revision} serverManaged pending={pending} subscriptionModels={models} configuration={value.configuration ? { ...value.configuration, providers: value.configuration.providers.map(provider => ({ ...provider, endpoint: '', apiKeyDraft: '' })) } : { providers: [], models: [], defaultModelId: null }} onSave={async next => {
      const identity = ownerIdentity(authStore)
      if (!next.roleSettings || saving.current || !identity || !catalogueMounted.current) return false
      saving.current = true; catalogueRead.current?.abort()
      const controller = new AbortController(), epoch = ++catalogueEpoch.current
      catalogueWrite.current = controller
      const current = () => !controller.signal.aborted && catalogueMounted.current && epoch === catalogueEpoch.current && identity === ownerIdentity(authStore)
      setSaveSource(source); setError('')
      try {
        const saved = await client.saveModels({ ...next, roleSettings: next.roleSettings, models: next.models.map(model => ({ ...model, routingDescription: model.routingDescription ?? '' })) }, value.revision, controller.signal)
        if (!current()) return false
        setCatalogue({ source, value: saved })
        return true
      } catch (error) { if (current()) setError(error instanceof Error ? error.message : 'Could not save model settings.'); return false }
      finally { if (catalogueWrite.current === controller) { catalogueWrite.current = null; saving.current = false; if (catalogueMounted.current) setSaveSource(null) } }
    }} /> : error ? <Button variant="outline" onClick={() => setReload(number => number + 1)}>Retry model settings</Button> : <p role="status" className="text-sm text-muted-foreground">Loading model settings...</p>}
  </div></GatewayPageFrame>
}
