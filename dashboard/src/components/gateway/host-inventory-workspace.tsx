import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, CircleAlert, Clock3, Cpu, Network, RefreshCw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import { gatewayError } from '@/lib/gateway/transport'
import { createHostInventoryRequestId, type GatewayConfiguredTargets, type GatewayHostInventory, type GatewayHostInventoryClient } from '@/lib/gateway/host-inventory'

const storageKey = 'conker:last-host-inventory-request'
const labels = { processes: 'Processes', ports: 'Ports', containers: 'Containers' } as const
const icons = { processes: Cpu, ports: Network, containers: Box } as const

function age(seconds: number | null) {
  if (seconds === null) return 'Age unavailable'
  if (seconds < 60) return `${Math.round(seconds)}s old`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`
  return `${Math.round(seconds / 3600)}h old`
}
function memory(bytes: number | null) {
  if (bytes === null) return 'Memory unavailable'
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`
}
function shortId(value: string | null) { return value ? `${value.slice(0, value.indexOf('_') + 9)}…` : 'Not linked' }

export function GatewayHostInventoryWorkspace({ client, section }: { client: GatewayHostInventoryClient; section: 'processes' | 'ports' | 'containers' }) {
  const initialRequest = useMemo(() => {
    const id = sessionStorage.getItem(storageKey)
    return id && /^[A-Za-z0-9_-]{16,100}$/.test(id) ? id : null
  }, [])
  const [sample, setSample] = useState<GatewayHostInventory | null>(null)
  const [configured, setConfigured] = useState<GatewayConfiguredTargets | null>(null)
  const [pending, setPending] = useState(Boolean(initialRequest)), [error, setError] = useState<string | null>(null)
  const Icon = icons[section]
  const inspect = useCallback(async (id: string) => {
    setPending(true); setError(null)
    try { setSample(await client.inspect(id)) } catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }, [client])
  useEffect(() => {
    if (!initialRequest) return
    const controller = new AbortController()
    client.inspect(initialRequest, controller.signal).then(value => {
      if (!controller.signal.aborted) { setSample(value); setPending(false) }
    }).catch(cause => {
      if (!controller.signal.aborted) { setError(gatewayError(cause).message); setPending(false) }
    })
    return () => controller.abort()
  }, [client, initialRequest])
  useEffect(() => {
    if (section !== 'containers') return
    const controller = new AbortController()
    client.configured('containers', controller.signal).then(setConfigured).catch(() => setConfigured(null))
    return () => controller.abort()
  }, [client, section])
  const start = async () => {
    const id = createHostInventoryRequestId()
    sessionStorage.setItem(storageKey, id); setPending(true); setError(null)
    try { setSample(await client.request(id)) } catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }
  const resume = async () => {
    if (!sample) return
    setPending(true); setError(null)
    try { setSample(await client.resume(sample.requestId)) } catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }
  const rows = useMemo(() => sample?.observation?.[section].results ?? [], [sample, section])
  const observed = sample?.observation?.[section]
  return <GatewayPageFrame><div className="max-w-5xl space-y-6">
    <PageHeader actionsOnly title={labels[section]} description="A redacted, read-only host observation. Sampling never starts, stops, or changes anything." density="compact" actions={<Button size="sm" disabled={pending} onClick={() => void start()}><RefreshCw />{pending ? 'Checking…' : 'New sample'}</Button>} />
    <div className="flex flex-wrap items-center gap-2 border-y py-3 text-xs text-muted-foreground"><ShieldCheck className="size-4" /><span>No host authority</span><span aria-hidden="true">·</span><span>No command lines, users, raw IDs, images, addresses, terminal, or files</span></div>
    {error && <div className="flex items-start gap-3 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><p>{error}</p>{sample && <Button className="mt-3" variant="outline" size="sm" onClick={() => void inspect(sample.requestId)}>Check saved request</Button>}</div></div>}
    {!sample && !error && <div className="flex min-h-48 flex-col items-center justify-center gap-3 border-y text-center"><span className="flex size-10 items-center justify-center rounded-full border"><Icon className="size-5 text-muted-foreground" /></span><div><p className="text-sm font-medium">No host sample loaded</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Create one explicit observation. Conker will remember its opaque request ID for this browser session.</p></div></div>}
    {sample && <>
      <section className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={sample.state === 'complete' ? 'secondary' : sample.state === 'failed' ? 'destructive' : 'outline'}>{sample.state.replaceAll('_', ' ')}</Badge>{observed && <Badge variant="outline">{observed.status}</Badge>}{observed?.truncated && <Badge variant="outline">Limited to {sample.limit}</Badge>}</div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{age(sample.currentAgeSeconds)}</div></section>
      {sample.approvalRequired && <div className="flex flex-wrap items-center justify-between gap-3 border p-4"><div><p className="text-sm font-medium">Owner approval is required</p><p className="mt-1 text-sm text-muted-foreground">Continue this saved request after reviewing it. A second observation will not be created.</p></div><Button variant="outline" disabled={pending} onClick={() => void resume()}>Continue request</Button></div>}
      {sample.state === 'unknown' && <div className="flex flex-wrap items-center justify-between gap-3 border p-4"><div><p className="text-sm font-medium">The observation outcome is unknown</p><p className="mt-1 text-sm text-muted-foreground">Inspect the saved request without dispatching another sample.</p></div><Button variant="outline" disabled={pending} onClick={() => void inspect(sample.requestId)}>Check request</Button></div>}
      {sample.state === 'failed' && <p className="text-sm text-destructive">The saved observation failed validation. No host data is shown.</p>}
      {sample.observation && <>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span>Sampled {new Date(sample.observation.sampledAt).toLocaleString()}</span><span>Collection {sample.observation.collectionSeconds.toFixed(2)}s</span><span>{sample.observation.unavailableFieldCount} unavailable fields</span></div>
        {observed?.errors.length ? <p className="text-sm text-muted-foreground">Partial observation: {observed.errors.map(value => value.replaceAll('_', ' ')).join(', ')}.</p> : null}
        {rows.length === 0 ? <div className="border-y py-12 text-center"><p className="text-sm font-medium">No {labels[section].toLocaleLowerCase()} were returned</p><p className="mt-1 text-sm text-muted-foreground">Source scope: {sample.observation.sourceScopes[section === 'processes' ? 'process' : section === 'ports' ? 'network' : 'containers'].replaceAll('-', ' ')}</p></div> : <div className="divide-y border-y">
          {section === 'processes' && sample.observation.processes.results.map(item => <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name || 'Unnamed process'}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{shortId(item.id)}</p></div><Badge variant="outline">{item.status}</Badge><p className="text-xs text-muted-foreground">{memory(item.memoryBytes)}</p></div>)}
          {section === 'ports' && sample.observation.ports.results.map(item => <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><p className="text-sm font-medium">{item.protocol.toUpperCase()} {item.hostPort}{item.targetPort ? ` → ${item.targetPort}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{item.addressScope.replaceAll('-', ' ')} · {item.kind.replaceAll('-', ' ')}</p></div><Badge variant="outline">{item.state.replaceAll('-', ' ')}</Badge><p className="font-mono text-xs text-muted-foreground">{shortId(item.processId ?? item.containerId)}</p></div>)}
          {section === 'containers' && sample.observation.containers.results.map(item => <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name || 'Unnamed container'}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{shortId(item.id)}</p></div><Badge variant="outline">{item.status}</Badge><p className="text-xs text-muted-foreground">{item.imageConfigured ? 'Image configured' : 'No image reported'}</p></div>)}
        </div>}
      </>}
    </>}
    {section === 'containers' && configured && <section className="space-y-3 border-t pt-5"><div><h2 className="text-sm font-semibold">Configured container targets</h2><p className="mt-1 text-xs text-muted-foreground">Configuration only; reading this list did not observe or execute a container.</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{configured.status.replaceAll('_', ' ')}</Badge><span className="text-xs text-muted-foreground">{configured.results.length} opaque {configured.results.length === 1 ? 'target' : 'targets'} · approval required for any separate action</span></div></section>}
  </div></GatewayPageFrame>
}
