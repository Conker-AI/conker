import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Check, Circle, CircleDashed, Copy, MessageSquare, Minus, RefreshCw, ShieldCheck, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PageHeader, WorkspaceAction, WorkspaceSplit } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import { StatusBadge } from '@/components/status-badge'
import type { GatewayControlClient, SetupChoiceStep, SetupRehearsal, SetupStatus, SetupStep } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { cn } from '@/lib/utils'
import { useGatewaySetupStatus } from './setup-status-hook'
import { setupLabels, setupStateLabels, summarizeSetup } from './setup-presentation'
const setupPhases: { title: string; description: string; steps: SetupStep['id'][] }[] = [
  {
    title: 'First conversation',
    description: 'Secure the owner channel, shape the companion, and verify an answer model.',
    steps: ['security', 'companion', 'model'],
  },
  {
    title: 'Working boundaries',
    description: 'Choose memory and tools, then review what can run automatically.',
    steps: ['memory', 'capabilities', 'boundaries'],
  },
  {
    title: 'Recovery and proof',
    description: 'Create a recoverable snapshot and prove the assembled path end to end.',
    steps: ['protection', 'rehearsal'],
  },
]
const hostOperations = {
  protection: {
    command: 'conker setup run protection',
    description: 'Run this on the Conker host. It verifies the saved destination is separate mounted storage, pauses writers, creates and checks a snapshot, enforces retention, then records policy-bound evidence.',
  },
} as const

function StateIcon({ state }: { state: SetupStep['state'] }) {
  if (state === 'complete') return <Check aria-hidden="true" />
  if (state === 'skipped') return <Minus aria-hidden="true" />
  if (state === 'degraded' || state === 'blocked') return <AlertCircle aria-hidden="true" />
  if (state === 'in_progress') return <CircleDashed aria-hidden="true" />
  return <Circle aria-hidden="true" />
}

function SpeechSetupControl({ step }: { step: SetupStep }) {
  const [copied, setCopied] = useState(false)
  const evidence = step.evidence.find(item => item.source === 'speech')
  if (!evidence) return null
  const configured = evidence.status === 'ok'
  const command = configured ? 'conker speech status' : 'conker speech configure'
  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { setCopied(false) }
  }
  return <section aria-labelledby="setup-voice-title" className="mt-6 space-y-3 border-t pt-5">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground"><Terminal className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 id="setup-voice-title" className="text-sm font-medium">Voice conversations</h3><Badge variant={evidence.status === 'degraded' ? 'destructive' : 'outline'}>{configured ? 'Configured' : evidence.status === 'degraded' ? 'Needs attention' : 'Optional'}</Badge></div><p className="mt-1 text-sm leading-5 text-muted-foreground">{evidence.detail}</p></div>
    </div>
    <div className="flex min-w-0 items-start gap-2 rounded-md border bg-background p-3">
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-xs leading-5">{command}</code>
      <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => void copy()} aria-label="Copy speech host command" title="Copy speech host command">
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
    </div>
    <p role="status" className="min-h-5 text-xs text-muted-foreground">{copied ? 'Command copied.' : configured ? 'Run on the Conker host to inspect secret-free readiness.' : 'Run on the Conker host. The wizard keeps credentials out of this browser.'}</p>
  </section>
}

function SetupChoiceControl({ client, step, choice, label, onSaved }: { client: GatewayControlClient; step: SetupChoiceStep; choice: 'accept' | 'include' | 'skip'; label: string; onSaved: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setPending(true); setError('')
    try {
      const current = await client.setupChoice(step)
      await client.saveSetupChoice(step, { requestId: `setup-choice-${crypto.randomUUID()}`, choice, expectedRevision: current.revision })
      onSaved()
    } catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending(false) }
  }
  return <div className="space-y-1"><Button type="button" variant={choice === 'skip' ? 'ghost' : 'outline'} size="sm" disabled={pending} onClick={() => void save()}>{pending ? 'Saving…' : label}</Button>{error && <p role="alert" className="text-xs leading-5 text-destructive">{error}</p>}</div>
}

function ModelSetupControl({ client, onSaved }: { client: GatewayControlClient; onSaved: () => void }) {
  const [options, setOptions] = useState<Awaited<ReturnType<GatewayControlClient['setupModels']>> | null>(null)
  const [selected, setSelected] = useState('')
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  async function load() {
    setPending(true); setError('')
    try {
      const value = await client.setupModels()
      setOptions(value)
      const preferred = value.candidates.find(candidate => candidate.selected && candidate.status !== 'unavailable')
        ?? value.candidates.find(candidate => candidate.status !== 'unavailable')
      setSelected(preferred?.id ?? '')
    } catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending(false) }
  }
  useEffect(() => {
    const controller = new AbortController()
    client.setupModels(controller.signal).then(value => {
      setOptions(value)
      const preferred = value.candidates.find(candidate => candidate.selected && candidate.status !== 'unavailable')
        ?? value.candidates.find(candidate => candidate.status !== 'unavailable')
      setSelected(preferred?.id ?? '')
    }).catch(reason => { if (!controller.signal.aborted) setError(gatewayError(reason).message) })
      .finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [client])
  async function save() {
    if (!options || !selected) return
    setPending(true); setError('')
    try { await client.activateSetupModel(selected, options.revision, `setup-model-probe-${crypto.randomUUID()}`); onSaved() }
    catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending(false) }
  }
  return <div className="mt-5 space-y-4 border-t pt-4">
    {!options && !error && <p role="status" className="text-sm text-muted-foreground">Checking models available on this server…</p>}
    {options && options.candidates.length > 0 && <RadioGroup value={selected} onValueChange={setSelected} aria-label="Answer model" className="gap-0 divide-y rounded-md border">
      {options.candidates.map(candidate => <label key={candidate.id} className={cn('grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3', candidate.status !== 'ready' && 'cursor-not-allowed opacity-60')}>
        <RadioGroupItem value={candidate.id} disabled={candidate.status === 'unavailable' || pending} />
        <span className="min-w-0"><span className="block text-sm font-medium">{candidate.name}</span><span className="block break-words text-xs leading-5 text-muted-foreground">{candidate.providerName} · {candidate.route}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{candidate.dataNotice} {candidate.costNotice}</span></span>
        <Badge variant={candidate.status === 'ready' ? 'secondary' : 'outline'}>{candidate.status === 'ready' ? 'Available' : candidate.status === 'unverified' ? 'Test required' : 'Unavailable'}</Badge>
      </label>)}
    </RadioGroup>}
    {options?.candidates.length === 0 && <p className="text-sm leading-6 text-muted-foreground">No answer model is configured on this host yet. Download a local model or add a hosted provider, then check again.</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" disabled={!selected || pending} onClick={() => void save()}><Check />{pending && options ? 'Testing one short reply…' : 'Use and test model'}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void load()}><RefreshCw />Check again</Button>
      <Button type="button" variant="ghost" asChild><Link to="/settings">Advanced settings</Link></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

function policyLimits(value: Record<string, number | null>) {
  const labels: Record<string, string> = { max_per_minute: 'per minute', max_per_hour: 'per hour', cooldown_seconds: 'seconds cooldown', max_runtime_seconds: 'seconds max', max_steps: 'steps max' }
  return Object.entries(value).filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([key, amount]) => `${amount}${labels[key] ? ` ${labels[key]}` : ` ${key}`}`).join(' · ')
}

function ProtectionControl({ client, onSaved }: { client: GatewayControlClient; onSaved: () => void }) {
  const [policy, setPolicy] = useState<Awaited<ReturnType<GatewayControlClient['setupProtection']>> | null>(null)
  const [destination, setDestination] = useState('')
  const [retention, setRetention] = useState('7')
  const [confirmed, setConfirmed] = useState(false)
  const [editing, setEditing] = useState(true)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const operation = hostOperations.protection
  function apply(value: Awaited<ReturnType<GatewayControlClient['setupProtection']>>) {
    setPolicy(value)
    setDestination(value.destination ?? '')
    setRetention(String(value.retentionCopies ?? 7))
    setEditing(value.revision === 0)
  }
  async function load() {
    setPending(true); setError('')
    try { apply(await client.setupProtection()) }
    catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending(false) }
  }
  useEffect(() => {
    const controller = new AbortController()
    client.setupProtection(controller.signal).then(apply)
      .catch(reason => { if (!controller.signal.aborted) setError(gatewayError(reason).message) })
      .finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [client])
  async function save() {
    if (!policy) return
    setPending(true); setError('')
    try {
      const saved = await client.saveSetupProtection({
        requestId: `setup-protection-${crypto.randomUUID()}`,
        destination: destination.trim(), retentionCopies: Number(retention), expectedRevision: policy.revision,
      })
      apply(saved); setConfirmed(false); onSaved()
    } catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending(false) }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(operation.command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return <div className="mt-5 space-y-3 border-t pt-4">
    {policy && editing && <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="space-y-2"><Label htmlFor="setup-backup-destination">Mounted destination</Label><Input id="setup-backup-destination" value={destination} onChange={event => setDestination(event.target.value)} placeholder="/mnt/conker-backups" disabled={pending} autoComplete="off" /><p className="text-xs leading-5 text-muted-foreground">Use an encrypted drive or network mount outside this installation.</p></div>
        <div className="space-y-2"><Label htmlFor="setup-backup-retention">Copies to keep</Label><Input id="setup-backup-retention" type="number" min={2} max={64} value={retention} onChange={event => setRetention(event.target.value)} disabled={pending} /></div>
      </div>
      <div className="flex items-start gap-3"><Checkbox id="setup-backup-confirm" checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} disabled={pending} /><Label htmlFor="setup-backup-confirm" className="font-normal leading-5">This path is mounted off this machine’s installation device.</Label></div>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={pending || !confirmed || !destination.trim() || Number(retention) < 2 || Number(retention) > 64} onClick={() => void save()}><ShieldCheck />{pending ? 'Saving policy…' : 'Save backup policy'}</Button>{policy.revision > 0 && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setError('') }}>Cancel</Button>}</div>
    </div>}
    {!policy && <Button type="button" variant="outline" disabled={pending} onClick={() => void load()}><RefreshCw />{pending ? 'Loading policy…' : 'Load backup policy'}</Button>}
    {policy && policy.revision > 0 && !editing && <div className="flex flex-wrap items-start justify-between gap-3 border-y py-3"><div className="min-w-0"><p className="text-sm font-medium">Backup policy saved</p><code className="mt-1 block break-all text-xs text-muted-foreground">{policy.destination}</code><p className="mt-1 text-xs text-muted-foreground">Keep the latest {policy.retentionCopies} verified snapshots.</p></div><Button type="button" variant="outline" size="sm" onClick={() => { setEditing(true); setConfirmed(false) }}>Edit policy</Button></div>}
    {policy && policy.revision > 0 && <>
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground"><Terminal className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="text-sm font-medium">Continue on the host</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{operation.description}</p></div>
    </div>
    <div className="flex min-w-0 items-start gap-2 rounded-md border bg-background p-3">
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-xs leading-5">{operation.command}</code>
      <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => void copy()} aria-label="Copy host command" title="Copy host command">
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
    </div>
    <p role="status" className="min-h-5 text-xs text-muted-foreground">{copied ? 'Command copied.' : 'Return here and refresh after the command finishes.'}</p>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

function RehearsalControl({ client, onRecorded }: { client: GatewayControlClient; onRecorded: () => void }) {
  const [rehearsal, setRehearsal] = useState<SetupRehearsal | null>(null)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  async function load() {
    setPending('refresh'); setError('')
    try { setRehearsal(await client.setupRehearsal()) }
    catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending('') }
  }
  useEffect(() => {
    const controller = new AbortController()
    client.setupRehearsal(controller.signal).then(setRehearsal)
      .catch(reason => { if (!controller.signal.aborted) setError(gatewayError(reason).message) })
    return () => controller.abort()
  }, [client])
  async function reviewMemory() {
    setPending('memory'); setError('')
    try {
      const choice = await client.setupChoice('memory')
      setRehearsal(await client.reviewSetupMemory(choice.revision, `setup-memory-review-${crypto.randomUUID()}`))
    } catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending('') }
  }
  async function startApproval() {
    setPending('approval'); setError('')
    const requestId = `setup-approval-${crypto.randomUUID()}`
    try {
      setRehearsal(await client.startSetupApproval(requestId))
    } catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending('') }
  }
  async function finishApproval() {
    if (!rehearsal?.approvalRequestId) return
    setPending('approval'); setError('')
    try { setRehearsal(await client.resumeSetupApproval(rehearsal.approvalRequestId)) }
    catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending('') }
  }
  async function finalize() {
    setPending('finalize'); setError('')
    try { await client.finalizeSetupRehearsal(); onRecorded() }
    catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending('') }
  }
  if (!rehearsal) return <div className="mt-5 space-y-2 border-t pt-4"><Button variant="outline" onClick={() => void load()} disabled={pending !== ''}><RefreshCw />{pending ? 'Checking…' : 'Check rehearsal'}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
  const rows = [
    { id: 'conversation', title: 'Have one real conversation', phase: rehearsal.conversation },
    { id: 'memory', title: 'Review memory behavior', phase: rehearsal.memoryReview },
    { id: 'approval', title: 'Approve one harmless local check', phase: rehearsal.approval },
  ] as const
  return <div className="mt-5 space-y-4 border-t pt-4">
    <div className="divide-y rounded-md border">{rows.map(item => <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3">
      <span className={cn('mt-0.5 flex size-7 items-center justify-center rounded-full border text-muted-foreground', item.phase.state === 'complete' && 'border-primary bg-primary text-primary-foreground', ['refused', 'outcome_unknown', 'invalid_policy'].includes(item.phase.state) && 'border-destructive/50 text-destructive')}>{item.phase.state === 'complete' ? <Check className="size-4" /> : item.phase.state === 'awaiting_owner' ? <CircleDashed className="size-4" /> : ['refused', 'outcome_unknown', 'invalid_policy'].includes(item.phase.state) ? <AlertCircle className="size-4" /> : <Circle className="size-4" />}</span>
      <div className="min-w-0"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><span className="text-xs text-muted-foreground">{item.phase.state === 'complete' ? 'Verified' : item.phase.state === 'awaiting_owner' ? 'Waiting for you' : item.phase.state === 'missing' ? 'Not yet' : 'Needs attention'}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.phase.detail}</p>
        {item.id === 'conversation' && item.phase.state === 'missing' && <Button className="mt-2" variant="outline" size="sm" asChild><Link to="/chat"><MessageSquare />Open companion</Link></Button>}
        {item.id === 'memory' && item.phase.state === 'missing' && <Button className="mt-2" variant="outline" size="sm" disabled={pending !== ''} onClick={() => void reviewMemory()}>{pending === 'memory' ? 'Recording…' : 'I reviewed memory setup'}</Button>}
        {item.id === 'approval' && item.phase.state === 'missing' && <Button className="mt-2" variant="outline" size="sm" disabled={pending !== ''} onClick={() => void startApproval()}>{pending === 'approval' ? 'Starting…' : 'Start approval check'}</Button>}
        {item.id === 'approval' && item.phase.state === 'awaiting_owner' && <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><Link to="/inbox">Review in Inbox</Link></Button><Button size="sm" disabled={!rehearsal.approvalRequestId || pending !== ''} onClick={() => void finishApproval()}>{pending === 'approval' ? 'Checking…' : 'Finish approved check'}</Button></div>}
      </div>
    </div>)}</div>
    <div className="flex flex-wrap items-center gap-2"><Button disabled={!rehearsal.canFinalize || pending !== ''} onClick={() => void finalize()}><Check />{pending === 'finalize' ? 'Verifying…' : 'Finish rehearsal'}</Button><Button variant="ghost" disabled={pending !== ''} onClick={() => void load()}><RefreshCw />Refresh</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

function BoundaryReview({ client, expectedRevision, onRecorded }: { client: GatewayControlClient; expectedRevision: number; onRecorded: () => void }) {
  const [policy, setPolicy] = useState<Awaited<ReturnType<GatewayControlClient['setupBoundaryPolicy']>> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function load() {
    setPending(true); setError('')
    try { setPolicy(await client.setupBoundaryPolicy()) }
    catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending(false) }
  }
  async function confirm() {
    if (!policy) return
    setPending(true); setError('')
    const completed = new Date(), expires = new Date(completed.getTime() + 30 * 86400_000)
    try {
      await client.recordSetupReceipt('boundaries', {
        receiptId: `setup-boundaries-${crypto.randomUUID()}`, source: 'conker.dashboard', subject: 'toolgate.policy',
        evidenceDigest: policy.digest, completedAt: completed.toISOString(), expiresAt: expires.toISOString(), expectedRevision,
      })
      onRecorded()
    } catch (reason) { setError(gatewayError(reason).message) }
    finally { setPending(false) }
  }
  if (!policy) return <div className="space-y-2"><Button onClick={() => void load()} disabled={pending}><ShieldCheck />{pending ? 'Loading policy…' : 'Review policy'}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
  return <div className="w-full space-y-4 border-t pt-4">
    <div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant={policy.lockdown ? 'secondary' : 'outline'}>{policy.lockdown ? 'Lockdown on' : 'Lockdown off'}</Badge><span className="text-muted-foreground">{policy.tools.length} scoped {policy.tools.length === 1 ? 'capability' : 'capabilities'}</span></div>
    <div className="divide-y rounded-md border sm:max-h-72 sm:overflow-y-auto">{policy.tools.map(tool => <div key={tool.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm"><div className="min-w-0"><p className="font-medium">{tool.name}</p><p className="truncate text-xs text-muted-foreground">{tool.id} · {tool.executionType}</p>{policyLimits(tool.usageLimits) && <p className="mt-1 text-xs text-muted-foreground">{policyLimits(tool.usageLimits)}</p>}</div><Badge variant="outline">{tool.authorization === 'owner_confirmation' ? 'Asks first' : 'Automatic'}</Badge></div>)}</div>
    <div className="flex flex-wrap items-center gap-3"><Button onClick={() => void confirm()} disabled={pending}><Check />{pending ? 'Recording…' : 'Confirm reviewed policy'}</Button><Button variant="ghost" onClick={() => setPolicy(null)} disabled={pending}>Cancel</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

function SetupChecklist({ status, client, refresh }: { status: SetupStatus; client: GatewayControlClient; refresh: () => void }) {
  return <div className="min-w-0 space-y-5">
    <div><h2 className="text-sm font-semibold">All setup steps</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Three phases take Conker from a secured install to a proven daily workspace.</p></div>
    <div className="divide-y border-y">{setupPhases.map((phase, phaseIndex) => <section key={phase.title} className="py-4" aria-labelledby={`setup-phase-${phaseIndex}`}>
      <div className="mb-2"><h3 id={`setup-phase-${phaseIndex}`} className="text-sm font-semibold">{phase.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{phase.description}</p></div>
      <ol>{phase.steps.map(id => {
        const step = status.steps.find(candidate => candidate.id === id)
        if (!step) return null
        const active = step.id === status.currentStep
        return <li key={step.id} className={cn('grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 rounded-md py-2', active && '-mx-2 bg-muted px-2')} aria-current={active ? 'step' : undefined}>
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-muted-foreground [&>svg]:size-4', step.state === 'complete' && 'bg-muted text-success', (step.state === 'blocked' || step.state === 'degraded') && 'border-warning-border text-warning')}><StateIcon state={step.state} /></span>
          <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2"><span className="text-sm font-medium">{setupLabels[step.id].title}</span><span className={cn('text-xs text-muted-foreground', (step.state === 'blocked' || step.state === 'degraded') && 'text-warning')}>{setupStateLabels[step.state]}{!step.required ? ' · Optional' : ''}</span></div>{active && <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.evidence[0]?.detail ?? setupLabels[step.id].description}</p>}{step.state === 'skipped' && (step.id === 'memory' || step.id === 'capabilities') && <div className="mt-1"><SetupChoiceControl client={client} step={step.id} choice="include" label="Set up now" onSaved={refresh} /></div>}</div>
        </li>
      })}</ol>
    </section>)}</div>
  </div>
}

export function GatewaySetupProgress({ client }: { client: GatewayControlClient }) {
  const { status, error, refresh } = useGatewaySetupStatus(client)
  if (!status && !error) return <GatewayPageFrame><p role="status" className="text-sm text-muted-foreground">Checking setup…</p></GatewayPageFrame>
  if (!status) return <GatewayPageFrame className="space-y-4"><PageHeader title="Setup" actionsOnly /><p role="alert" className="text-sm text-destructive">Setup status is unavailable. No progress was changed.</p><Button variant="outline" onClick={refresh}><RefreshCw />Try again</Button></GatewayPageFrame>

  const { resolved, remainingRequired, attention, current, operation } = summarizeSetup(status)
  return <GatewayPageFrame>
    <div className="space-y-6">
      <PageHeader title="Setup" actionsOnly actions={<WorkspaceAction iconOnly aria-label="Refresh setup" title="Refresh setup" onClick={refresh}><RefreshCw /></WorkspaceAction>} />
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 px-4 py-3 text-sm"><span>Conker could not refresh setup. This is the last verified result.</span><Button variant="outline" size="sm" onClick={refresh}><RefreshCw />Try again</Button></div>}
      <section aria-labelledby="setup-progress-title" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 id="setup-progress-title" className="text-base leading-6 font-semibold">Setup progress</h2><span className="text-muted-foreground">{remainingRequired === 0 ? 'Required checks complete' : `${remainingRequired} required ${remainingRequired === 1 ? 'check' : 'checks'} remaining`}{attention > 0 ? ` · ${attention} ${attention === 1 ? 'item needs' : 'items need'} attention` : ''}</span></div>
          <span className="tabular-nums text-muted-foreground">{resolved} of {status.steps.length} resolved</span>
        </div>
        <Progress className="h-1" value={(resolved / status.steps.length) * 100} aria-label={`${resolved} of ${status.steps.length} setup steps resolved`} />
      </section>
      <WorkspaceSplit asideLabel="Setup checklist" aside={<SetupChecklist status={status} client={client} refresh={refresh} />}>
        <section aria-labelledby="next-step-title" className="min-w-0 space-y-5">
          {current ? <>
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0 max-w-2xl"><div className="flex flex-wrap items-center gap-2"><h2 id="next-step-title" className="text-base leading-6 font-semibold">{setupLabels[current.id].title}</h2><StatusBadge tone={current.state === 'blocked' || current.state === 'degraded' ? 'warning' : current.state === 'complete' ? 'live' : 'neutral'}>{setupStateLabels[current.state]}</StatusBadge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{current.evidence[0]?.detail ?? setupLabels[current.id].description}</p></div>
              <div className="flex flex-wrap items-center gap-2">{operation && current.id !== 'model' && current.id !== 'memory' && current.id !== 'capabilities' && current.id !== 'boundaries' && current.id !== 'protection' && current.id !== 'rehearsal' && <Button asChild><Link to={operation.to}>{operation.label}<ArrowRight /></Link></Button>}{current.id === 'companion' && <SetupChoiceControl client={client} step="companion" choice="accept" label="Keep supplied default" onSaved={refresh} />}{current.id === 'memory' && <><SetupChoiceControl client={client} step="memory" choice="include" label="Use memory" onSaved={refresh} /><SetupChoiceControl client={client} step="memory" choice="skip" label="Keep off for now" onSaved={refresh} /></>}{current.id === 'capabilities' && <><SetupChoiceControl client={client} step="capabilities" choice="include" label="Connect available tools" onSaved={refresh} /><SetupChoiceControl client={client} step="capabilities" choice="skip" label="Keep off for now" onSaved={refresh} /></>}</div>
            </div>
            {current.id === 'model' && <ModelSetupControl client={client} onSaved={refresh} />}
            {current.id === 'capabilities' && <SpeechSetupControl step={current} />}
            {current.id === 'boundaries' && <BoundaryReview client={client} expectedRevision={current.evidence[0]?.revision ?? 0} onRecorded={refresh} />}
            {current.id === 'protection' && <ProtectionControl client={client} onSaved={refresh} />}
            {current.id === 'rehearsal' && <RehearsalControl client={client} onRecorded={refresh} />}
          </> : <div className="flex flex-wrap items-center justify-between gap-4"><div className="max-w-2xl"><h2 id="next-step-title" className="text-base leading-6 font-semibold">Setup is complete</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Required checks have current evidence, and your optional choices are saved.</p></div><Button asChild><Link to="/chat"><MessageSquare />Open companion<ArrowRight /></Link></Button></div>}
        </section>
      </WorkspaceSplit>
      <p className="text-xs leading-5 text-muted-foreground">Checked {new Date(status.generatedAt).toLocaleString()}. Secret values are never included in this status.</p>
    </div>
  </GatewayPageFrame>
}
