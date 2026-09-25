import { useEffect, useState } from 'react'
import { ModelsProviders } from '@/app/settings/models-providers'
import type { ModelsConfiguration } from '@/lib/api/model-catalogue'
import type { GatewayControlClient, OwnerModelSettings, ProviderStatus } from '@/lib/gateway/control'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { withAnswerModel } from '@/lib/api/model-roles'

const providerNames: Record<string, string> = { ollama: 'Local model', openrouter: 'OpenRouter', anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' }
const providerName = (id: string) => providerNames[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
const providerState = (provider: ProviderStatus) => provider.busy ? 'Busy' : provider.status === 'ok' ? 'Ready' : provider.status === 'not_configured' ? 'Not set up' : 'Unavailable'
const RUNNING_DOCS = 'https://github.com/Conker-AI/conker/blob/main/docs/4-running.md'

export function GatewayModelsSettings({ client }: { client: GatewayControlClient }) {
  const [value, setValue] = useState<OwnerModelSettings | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [reload, setReload] = useState(0)
  const [retry, setRetry] = useState(0)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [providerError, setProviderError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    client.models(controller.signal).then(value => { if (!controller.signal.aborted) setValue(value) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [client, retry])
  useEffect(() => {
    const controller = new AbortController()
    client.providers(controller.signal).then(value => { if (!controller.signal.aborted) setProviders(value) }).catch(() => { if (!controller.signal.aborted) setProviderError('Provider health could not be verified.') })
    return () => controller.abort()
  }, [client, reload])
  if (!value) return <div className="p-4">{error ? <><p role="alert">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button></> : <p role="status">Loading model settings…</p>}</div>
  const configuration: ModelsConfiguration = value.configuration ? {
    ...value.configuration, providers: value.configuration.providers.map(provider => ({ ...provider, endpoint: '', apiKeyDraft: '' })),
  } : { providers: [], models: [], defaultModelId: null }
  const saved = value.configuration
  const enabled = saved ? saved.models.filter(model => model.enabled && saved.providers.some(provider => provider.id === model.providerId && provider.enabled)) : []
  // Pi answers with the Answer role's model; in router mode a helper chooses per message.
  const answering = saved?.roleSettings.answerMode === 'manual' && saved.roleSettings.roles.answer.enabled ? saved.roleSettings.roles.answer.modelId : null
  const onlyLocal = providers.length > 0 && !providers.slice(1).some(provider => provider.status === 'ok')
  async function chooseAnswerModel(modelId: string) {
    if (!saved || !value || pending || modelId === answering) return
    setPending(true); setError('')
    try { setValue(await client.saveModels(withAnswerModel(saved, modelId), value.revision)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save settings.') }
    finally { setPending(false) }
  }
  return <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <section aria-labelledby="answers-heading" className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="space-y-1"><h2 id="answers-heading" className="text-base font-medium">Answers</h2><p className="text-sm text-muted-foreground">The model that replies to you in every chat, unless you pick another one in a chat.</p></div>
      <div className="space-y-2">
        <Label htmlFor="answer-model">Answers come from</Label>
        <Select value={answering ?? ''} disabled={pending || !enabled.length} onValueChange={value => void chooseAnswerModel(value)}>
          <SelectTrigger id="answer-model" className="w-full min-w-0"><SelectValue placeholder={saved?.roleSettings.answerMode === 'router' ? 'Chosen automatically for each message' : enabled.length ? 'Choose a model' : 'No models set up yet'} /></SelectTrigger>
          <SelectContent>{enabled.map(model => <SelectItem key={model.id} value={model.id}>{model.name} · {saved?.providers.find(provider => provider.id === model.providerId)?.name}</SelectItem>)}</SelectContent>
        </Select>
        {pending && <p role="status" className="text-xs text-muted-foreground">Saving…</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error} Reload the page if settings changed elsewhere.</p>}
      {onlyLocal && <p className="rounded-lg bg-muted p-3 text-sm leading-6">Conker is using a small model on your server. For answers closer to ChatGPT or Claude, add a hosted model on the server. <a className="underline underline-offset-4" href={RUNNING_DOCS} target="_blank" rel="noreferrer">How to add one</a></p>}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">Connected</h3><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setProviderError(''); setReload(value => value + 1) }}>Refresh</Button></div>
        {providerError && <p role="status" className="text-sm text-muted-foreground">{providerError}</p>}
        <dl className="space-y-2 text-sm">{providers.map(provider => <div key={provider.id} className="flex flex-wrap justify-between gap-2"><dt>{providerName(provider.id)}{provider.model && <span className="text-muted-foreground"> · {provider.model}</span>}</dt><dd className="text-muted-foreground">{providerState(provider)}</dd></div>)}</dl>
      </div>
    </section>
    <details className="group rounded-xl border bg-card">
      <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:px-5">Advanced model settings</summary>
      <div className="border-t p-2 sm:p-3">
    <ModelsProviders key={value.revision} configuration={configuration} pending={pending} serverManaged onSave={async next => {
      if (!next.roleSettings || pending) return false
      setPending(true); setError('')
      try {
        const saved = await client.saveModels({ ...next, roleSettings: next.roleSettings, models: next.models.map(model => ({ ...model, routingDescription: model.routingDescription ?? '' })) }, value.revision)
        setValue(saved); return true
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not save settings.'); return false }
      finally { setPending(false) }
    }} />
      </div>
    </details>
  </div>
}
