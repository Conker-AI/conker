import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, CollectionSection } from '@/components/design-system/primitives'
import type { GatewayControlClient, ProviderStatus, SystemHealth } from '@/lib/gateway/control'
import { plainStatus } from './plain-status'

const labels: Record<keyof SystemHealth['checks'], { label: string; service: string }> = {
  store: { label: 'Conversation storage', service: 'Store' },
  memory: { label: 'Memory', service: 'MemoryGate' },
  local_provider: { label: 'Local answer model', service: 'Local provider' },
  hosted_provider: { label: 'Hosted answer model', service: 'Hosted provider' },
  action_boundary: { label: 'Tool approvals', service: 'ToolGate' },
}
const needsAttention = (status: string) => !['ok', 'ready', 'busy', 'not_configured'].includes(status)

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
      setErrors([...(system.status === 'rejected' ? ['Service health could not be checked.'] : []), ...(models.status === 'rejected' ? ['Answer model health could not be checked.'] : [])])
      setPending(false)
    })
    return () => controller.abort()
  }, [client, revision])
  const attentionCount = (health ? Object.values(health.checks).filter(check => needsAttention(check.status)).length : 0) +
    (providers ? providers.filter(provider => needsAttention(provider.status)).length : 0) + errors.length
  return <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="System status" description="Health reported by the connected services and answer models." density="compact" /><Button variant="outline" size="sm" disabled={pending} onClick={() => { setPending(true); setHealth(null); setProviders(null); setErrors([]); setRevision(value => value + 1) }}>{pending ? 'Checking…' : 'Refresh status'}</Button></div>
    {!pending && (health || providers || errors.length > 0) && <p role="status" className="text-sm font-medium">{attentionCount === 0 ? 'Everything is working' : `${attentionCount} ${attentionCount === 1 ? 'thing needs' : 'things need'} attention`}</p>}
    {pending && <p role="status" className="text-sm text-muted-foreground">Checking connected services…</p>}
    {errors.map(error => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
    {health && <CollectionSection title="Services" contained><dl className="divide-y">{Object.entries(health.checks).map(([key, check]) => {
      const item = labels[key as keyof typeof labels]
      return <div key={key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><dt>{item.label}<span className="block text-xs text-muted-foreground">{item.service}</span></dt><dd><Badge variant="outline">{plainStatus(check.status)}</Badge></dd></div>
    })}</dl><p className="p-3 text-xs text-muted-foreground">Reported {new Date(health.checked_at).toLocaleString()} · checked {Math.round(health.age_seconds) === 1 ? '1 second' : `${Math.round(health.age_seconds)} seconds`} before loading. Not set up is optional and does not mean something failed. A healthy service does not guarantee every action is available.</p></CollectionSection>}
    {providers && <CollectionSection title="Answer models" contained><dl className="divide-y">{providers.map(provider => <div key={provider.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><dt>{provider.model || 'Answer model'}<span className="block text-xs text-muted-foreground">{provider.id}</span></dt><dd><Badge variant="outline">{provider.busy ? 'Busy' : plainStatus(provider.status)}</Badge></dd></div>)}</dl></CollectionSection>}
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/settings">Model settings</Link></Button><Button asChild variant="outline" size="sm"><Link to="/memory">Inspect memory</Link></Button><Button asChild variant="outline" size="sm"><Link to="/activity">View activity</Link></Button></div>
    <p className="text-xs text-muted-foreground">This view reports service health. Terminal, files, Docker management and port controls are not connected to this workspace yet.</p>
  </main>
}
