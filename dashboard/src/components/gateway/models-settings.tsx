import { useEffect, useState } from 'react'
import { ModelsProviders } from '@/app/settings/models-providers'
import type { ModelsConfiguration } from '@/lib/api/model-catalogue'
import type { GatewayControlClient, OwnerModelSettings, ProviderStatus } from '@/lib/gateway/control'
import { Button } from '@/components/ui/button'

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
  return <div className="space-y-3 p-4 sm:p-6">
    <section aria-label="Provider status" className="rounded-lg border bg-card p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">Running providers</h2><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setProviderError(''); setReload(value => value + 1) }}>Refresh status</Button></div>{providerError && <p role="status" className="text-muted-foreground">{providerError}</p>}<dl className="mt-2 space-y-2">{providers.map(provider => <div key={provider.id} className="flex flex-wrap justify-between gap-2"><dt>{provider.id} · {provider.capabilities.join(', ')}</dt><dd className="text-muted-foreground">{provider.busy ? 'Busy' : provider.status === 'ok' ? 'Ready' : provider.status}{provider.model && ` · ${provider.model}`}</dd></div>)}</dl></section>
    {error && <p role="alert" className="text-sm text-destructive">{error} Reload to resolve a revision conflict; your draft is not overwritten.</p>}
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
}
