import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, CollectionSection } from '@/components/design-system/primitives'
import type { GatewayControlClient, ProviderStatus, SystemHealth } from '@/lib/gateway/control'

const labels: Record<keyof SystemHealth['checks'], string> = {
  store: 'Conversation storage', memory: 'MemoryGate', local_provider: 'Local answer model',
  hosted_provider: 'Hosted answer provider', action_boundary: 'ToolGate',
}
const describe = (status: string) => status === 'ok' || status === 'ready' ? 'Ready' : status.replaceAll('_', ' ')

export function GatewaySystemStatus({ client }: { client: GatewayControlClient }) {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([client.health(controller.signal), client.providers(controller.signal)]).then(([system, models]) => {
      if (controller.signal.aborted) return
      setHealth(system.status === 'fulfilled' ? system.value : null)
      setProviders(models.status === 'fulfilled' ? models.value : null)
      setErrors([...(system.status === 'rejected' ? ['Runtime health could not be verified.'] : []), ...(models.status === 'rejected' ? ['Model-provider health could not be verified.'] : [])])
      setPending(false)
    })
    return () => controller.abort()
  }, [client, revision])
  return <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="System status" description="Reported health from the connected runtime and model providers." density="compact" /><Button variant="outline" size="sm" disabled={pending} onClick={() => { setPending(true); setHealth(null); setProviders(null); setErrors([]); setRevision(value => value + 1) }}>{pending ? 'Checking…' : 'Refresh status'}</Button></div>
    {pending && <p role="status" className="text-sm text-muted-foreground">Checking connected services…</p>}
    {errors.map(error => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
    {health && <CollectionSection title="Runtime services" contained><dl className="divide-y">{Object.entries(health.checks).map(([key, check]) => <div key={key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><dt>{labels[key as keyof typeof labels]}</dt><dd><Badge variant="outline">{describe(check.status)}</Badge></dd></div>)}</dl><p className="p-3 text-xs text-muted-foreground">Reported {new Date(health.checked_at).toLocaleString()} · {Math.round(health.age_seconds)} seconds old when loaded. Optional providers may be unconfigured. A healthy service does not guarantee every operation is available.</p></CollectionSection>}
    {providers && <CollectionSection title="Model providers" contained><dl className="divide-y">{providers.map(provider => <div key={provider.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><dt>{provider.id}{provider.model && <span className="block text-xs text-muted-foreground">{provider.model}</span>}</dt><dd><Badge variant="outline">{provider.busy ? 'Busy' : describe(provider.status)}</Badge></dd></div>)}</dl></CollectionSection>}
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/settings">Model settings</Link></Button><Button asChild variant="outline" size="sm"><Link to="/memory">Inspect memory</Link></Button><Button asChild variant="outline" size="sm"><Link to="/activity">View activity</Link></Button></div>
    <p className="text-xs text-muted-foreground">This view reports service health. Terminal, files, Docker management and port controls are not connected to this live workspace yet.</p>
  </main>
}
