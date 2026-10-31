import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { HostedProviderId } from '@/lib/gateway/provider-control'
import type { GatewayControlClient, OwnerModelSettings, ProviderStatus } from '@/lib/gateway/control'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { ChatGPTStatus } from '@/lib/gateway/chatgpt'
import { ModelsProviders } from '@/app/settings/models-providers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WorkspaceSection } from '@/components/design-system'
import { IdentityMark } from '@/components/brand/identity-mark'
import type { BrandId } from '@/components/brand/brand-icons'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetPanel } from '@/components/ui/sheet'
import { GatewayPageFrame } from './page-frame'
import { ChatGPTConnection } from './chatgpt-connection'
import { NativeClaudeConnection } from './native-claude-connection'
import { ProviderCredentials } from './provider-credentials'
import { useProviderReadiness } from './use-provider-readiness'
import { readRuntimeWithDeadline } from './runtime-read-deadline'

const names: Record<string, string> = { ollama: 'Local model', decisions: 'Decisions (Laya)', 'claude-code': 'Claude Code subscription', chatgpt: 'ChatGPT subscription', openai: 'OpenAI API', openrouter: 'OpenRouter', anthropic: 'Anthropic API', gemini: 'Google Gemini API', xai: 'xAI API (Grok)', mistral: 'Mistral API', deepseek: 'DeepSeek API', groq: 'Groq API' }
const brands: Record<string, BrandId> = { chatgpt: 'openai', 'claude-code': 'claude', openai: 'openai', anthropic: 'anthropic', openrouter: 'openrouter', ollama: 'ollama', gemini: 'gemini', xai: 'xai', mistral: 'mistral', deepseek: 'deepseek', groq: 'groq' }
/** Providers that connect with an API key, in the order the owner sees them. */
const keyed: HostedProviderId[] = ['openai', 'anthropic', 'gemini', 'xai', 'mistral', 'deepseek', 'groq', 'openrouter']
const ownerIdentity = (authStore: GatewayAuthStore) => {
  const auth = authStore.getState()
  return auth.phase === 'authenticated' && auth.session?.authenticated && !auth.pending && !auth.logoutUnconfirmed ? auth.session.sessionId : null
}

export function GatewayProvidersSettings({ client, authStore, embedded = false }: { client: GatewayControlClient; authStore: GatewayAuthStore; embedded?: boolean }) {
  const source = useMemo(() => ({ client, authStore }), [client, authStore])
  const [catalogue, setCatalogue] = useState<{ source: typeof source; value: OwnerModelSettings } | null>(null)
  const value = catalogue?.source === source ? catalogue.value : null
  const [models, setModels] = useState<ChatGPTStatus['models']>([])
  const [error, setError] = useState('')
  const [saveSource, setSaveSource] = useState<typeof source | null>(null), [reload, setReload] = useState(0)
  // One credential panel for the API-key rows, so one status read and one spending switch.
  const [keysOpen, setKeysOpen] = useState(false), [keyProvider, setKeyProvider] = useState<HostedProviderId>('openai')
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
  // Embedded: one row on the Settings screen, without its own page frame.
  const Frame = embedded ? 'div' : GatewayPageFrame
  const chip = (value?: ProviderStatus) => health.phase === 'checking' ? 'Checking…' : health.phase !== 'current' ? 'Unavailable' : !value ? 'Not connected' : value.busy ? 'Busy' : value.status === 'ok' ? 'Ready' : value.status === 'unverified' ? 'Connected, not tested' : value.status === 'not_configured' ? 'Not connected' : 'Unavailable'
  const badgeVariant = (value?: ProviderStatus) => health.phase === 'checking' ? 'outline' : health.phase !== 'current' ? 'error' : !value ? 'outline' : value.busy ? 'info' : value.status === 'ok' ? 'success' : value.status === 'unverified' ? 'warning' : value.status === 'not_configured' ? 'outline' : 'error'
  const sheet = (title: string, label: 'Connect' | 'Manage', body: React.ReactNode) => <Sheet><SheetTrigger render={<Button variant="outline" size="sm" aria-label={label + ' ' + title} />}>{label}</SheetTrigger><SheetContent portalProps={{ keepMounted: true }} className="sm:max-w-lg"><SheetHeader className="sr-only"><SheetTitle>{title}</SheetTitle></SheetHeader><SheetPanel className="pt-12!">{body}</SheetPanel></SheetContent></Sheet>
  const providerRow = (key: string, name: string, value?: ProviderStatus, sheet?: React.ReactNode) => <div key={key} className="flex min-h-16 items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><IdentityMark brand={brands[key]} kind={key === 'decisions' ? 'server' : 'provider'} name={name} /><div className="min-w-0"><p className="text-sm font-medium break-words">{name}</p>{value?.model && <p className="text-xs text-muted-foreground break-words">{health.phase !== 'current' ? 'Last checked model: ' : ''}{value.model}</p>}</div></div><div className="flex shrink-0 items-center gap-2">{value && <Badge variant={badgeVariant(value)}>{chip(value)}</Badge>}{sheet}</div></div>
  const byId = (id: string) => health.rows.find(row => row.id === id)
  const chatgptValue = byId('chatgpt')
  const claudeValue = byId('claude-code')
  const label = (value?: ProviderStatus) => value && (value.busy || value.status === 'ok' || value.status === 'unverified') ? 'Manage' : 'Connect'
  const chatgptSheet = sheet('ChatGPT subscription', label(chatgptValue), <ChatGPTConnection client={client} authStore={authStore} onModels={setModels} />)
  const claudeSheet = sheet('Claude subscription', label(claudeValue), <NativeClaudeConnection client={client} authStore={authStore} />)
  const keyButton = (id: HostedProviderId) => <Button variant="outline" size="sm" aria-label={label(byId(id)) + ' ' + names[id]} onClick={() => { setKeyProvider(id); setKeysOpen(true) }}>{label(byId(id))}</Button>
  const otherRows = health.rows.filter(row => row.id !== 'chatgpt' && row.id !== 'claude-code' && !keyed.includes(row.id as HostedProviderId))
  const group = (title: string, rows: React.ReactNode, note?: string) => <div role="group" aria-label={title}><h3 className="text-xs font-medium text-muted-foreground">{title}</h3><div className="divide-y">{rows}</div>{note && <p className="text-xs text-muted-foreground">{note}</p>}</div>
  return <Frame><div className="w-full space-y-7">
    <WorkspaceSection title="Connections" divided={false} action={<Button variant="ghost" size="sm" className="aria-disabled:opacity-50" disabled={health.phase === 'inactive'} aria-disabled={health.phase === 'checking'} aria-busy={health.phase === 'checking'} onClick={() => { if (health.phase === 'current' || health.phase === 'unavailable') void health.refresh() }}><RefreshCw />{health.phase === 'checking' ? 'Checking…' : health.phase === 'unavailable' ? 'Try again' : 'Refresh'}</Button>}>
      {health.phase === 'checking' && <p role="status" className="text-sm text-muted-foreground">Checking provider readiness…</p>}
      {health.phase === 'unavailable' && <p role="status" className="text-sm text-muted-foreground">Provider readiness could not be checked. Try again to read the current status.</p>}
      {health.phase !== 'current' && health.rows.length > 0 && <p className="text-xs text-muted-foreground">Provider and model names below are from the last successful check.</p>}
      <div className="space-y-5">
        {group('Subscription sign-in', <>{providerRow('chatgpt', 'ChatGPT subscription', chatgptValue, chatgptSheet)}{providerRow('claude-code', 'Claude subscription', claudeValue, claudeSheet)}</>)}
        {group('API key', keyed.map(id => providerRow(id, names[id], byId(id), keyButton(id))), 'Other models: connect OpenRouter. Keys stay on your server.')}
        {otherRows.length > 0 && group('On this server', otherRows.map(row => providerRow(row.id, names[row.id] ?? row.id, row)))}
      </div>
      <Sheet open={keysOpen} onOpenChange={setKeysOpen}><SheetContent portalProps={{ keepMounted: true }} className="sm:max-w-lg"><SheetHeader className="sr-only"><SheetTitle>{names[keyProvider]}</SheetTitle></SheetHeader><SheetPanel className="pt-12!"><ProviderCredentials only={keyProvider} client={client} authStore={authStore} onChanged={() => setReload(number => number + 1)} /></SheetPanel></SheetContent></Sheet>
    </WorkspaceSection>
    <details><summary className="w-fit cursor-pointer rounded-md py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Advanced: model list</summary>
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
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
    </details>
  </div></Frame>
}
