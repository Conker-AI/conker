import { useEffect, useRef, useState } from 'react'
import { ExternalLink, LogIn, RefreshCw } from 'lucide-react'
import type { GatewayControlClient, OwnerModelSettings, ProviderStatus } from '@/lib/gateway/control'
import type { ChatGPTOperation, ChatGPTStatus } from '@/lib/gateway/chatgpt'
import { ModelsProviders } from '@/app/settings/models-providers'
import { Button } from '@/components/ui/button'
import { WorkspaceSection } from '@/components/design-system'
import { GatewayPageFrame } from './page-frame'
import { ProviderCredentials } from './provider-credentials'

const names: Record<string, string> = { ollama: 'Local model', decisions: 'Decisions (Laya)', chatgpt: 'ChatGPT subscription', openai: 'OpenAI API', openrouter: 'OpenRouter', anthropic: 'Anthropic' }
const readiness = (value: ProviderStatus) => value.busy ? 'Busy' : value.status === 'ok' ? 'Ready' : value.status === 'unverified' ? 'Configured, inference not verified' : value.status === 'not_configured' ? 'Not connected' : 'Unavailable'

function ChatGPTConnection({ client, onModels }: { client: GatewayControlClient; onModels: (models: ChatGPTStatus['models']) => void }) {
  const [value, setValue] = useState<ChatGPTStatus | null>(null)
  const [device, setDevice] = useState<NonNullable<ChatGPTStatus['deviceCode']> | null>(null)
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [reload, setReload] = useState(0)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => { controller.abort(); lifetime.current = null }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    client.chatgpt.status(controller.signal).then(result => {
      if (!controller.signal.aborted) { setValue(result); onModels(result.models); if (result.loginState !== 'pending') setDevice(null) }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [client, reload, onModels])
  useEffect(() => {
    if (!value?.loginId) return
    const interval = window.setInterval(() => setReload(number => number + 1), 3000)
    return () => window.clearInterval(interval)
  }, [value?.loginId])
  async function apply(operation: ChatGPTOperation) {
    const signal = lifetime.current?.signal
    if (pending || !signal || signal.aborted) return
    setPending(true); setError('')
    try {
      const result = await client.chatgpt.apply(operation, signal)
      if (!signal.aborted) { setValue(result); setDevice(result.deviceCode ?? null); onModels(result.models) }
    } catch (error) { if (!signal.aborted) { setError(error instanceof Error ? error.message : 'ChatGPT operation was not confirmed. Refresh status before retrying.'); setReload(number => number + 1) } }
    finally { if (!signal.aborted) setPending(false) }
  }
  return <WorkspaceSection title="ChatGPT" description="Use your ChatGPT subscription through Codex sign-in. No OpenAI API key or separate API billing; your plan’s usage limits still apply." action={<Button size="sm" variant="ghost" disabled={pending} onClick={() => { setError(''); setReload(number => number + 1) }}><RefreshCw />Refresh</Button>}>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!value && !error && <p role="status" className="text-sm text-muted-foreground">Checking subscription connection...</p>}
    {value && !value.available && <p role="status" className="text-sm leading-6 text-muted-foreground">Subscription sign-in is unavailable. This installation needs the private provider service and its pinned Codex runtime. No credentials can be sent.</p>}
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

export function GatewayProvidersSettings({ client }: { client: GatewayControlClient }) {
  const [value, setValue] = useState<OwnerModelSettings | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [models, setModels] = useState<ChatGPTStatus['models']>([])
  const [error, setError] = useState(''), [healthError, setHealthError] = useState('')
  const [pending, setPending] = useState(false), [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    client.models(controller.signal).then(result => { if (!controller.signal.aborted) setValue(result) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    client.providers(controller.signal).then(result => { if (!controller.signal.aborted) setProviders(result) }).catch(() => { if (!controller.signal.aborted) setHealthError('Provider readiness could not be checked.') })
    return () => controller.abort()
  }, [client, reload])
  return <GatewayPageFrame><div className="w-full max-w-3xl space-y-7">
    <ChatGPTConnection client={client} onModels={setModels} />
    <details><summary className="w-fit cursor-pointer rounded-md py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">API-key providers</summary><ProviderCredentials client={client} onChanged={() => setReload(number => number + 1)} /></details>
    <WorkspaceSection title="Runtime readiness" description="Connection and catalogue entries do not prove a model can answer." action={<Button variant="ghost" size="sm" onClick={() => { setHealthError(''); setReload(number => number + 1) }}><RefreshCw />Refresh</Button>}>
      {healthError && <p role="status" className="text-sm text-muted-foreground">{healthError}</p>}
      <dl className="divide-y text-sm">{providers.map(provider => <div key={provider.id} className="flex flex-wrap justify-between gap-2 py-3"><dt>{names[provider.id] ?? provider.id}{provider.model && <span className="text-muted-foreground"> · {provider.model}</span>}</dt><dd className="text-muted-foreground">{readiness(provider)}</dd></div>)}</dl>
    </WorkspaceSection>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {value ? <ModelsProviders key={value.revision} serverManaged pending={pending} subscriptionModels={models} configuration={value.configuration ? { ...value.configuration, providers: value.configuration.providers.map(provider => ({ ...provider, endpoint: '', apiKeyDraft: '' })) } : { providers: [], models: [], defaultModelId: null }} onSave={async next => {
      if (!next.roleSettings || pending) return false
      setPending(true); setError('')
      try {
        setValue(await client.saveModels({ ...next, roleSettings: next.roleSettings, models: next.models.map(model => ({ ...model, routingDescription: model.routingDescription ?? '' })) }, value.revision))
        return true
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not save model settings.'); return false }
      finally { setPending(false) }
    }} /> : error ? <Button variant="outline" onClick={() => setReload(number => number + 1)}>Retry model settings</Button> : <p role="status" className="text-sm text-muted-foreground">Loading model settings...</p>}
  </div></GatewayPageFrame>
}
