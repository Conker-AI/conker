import { useEffect, useState, type FormEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ToolInventory } from '@/lib/gateway/control'
import { GatewayJobMutationError, type GatewayJob, type GatewayJobsClient, type GatewayJobTiming } from '@/lib/gateway/jobs'
import { gatewayError } from '@/lib/gateway/transport'

type Repeat = 'hours' | 'daily' | 'weekly' | 'tool' | 'webhook'
const repeats: { value: Repeat; label: string }[] = [{ value: 'hours', label: 'Every few hours' }, { value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }, { value: 'tool', label: 'When a tool has something new' }, { value: 'webhook', label: 'When its webhook is called' }]
const looks = [5, 15, 30, 60]
const intervals = [1, 2, 3, 4, 6, 12]
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const blank = { name: '', instructions: '', repeat: 'daily' as Repeat, hours: '2', time: '09:00', day: '0', tool: '', minutes: '15', inputs: {} as Record<string, string> }

function timing(value: typeof blank): GatewayJobTiming {
  if (value.repeat === 'tool' || value.repeat === 'webhook') return { kind: 'interval', time: '00:00', day: 0, hours: 24 }
  if (value.repeat === 'hours') return { kind: 'interval', time: '00:00', day: 0, hours: Number(value.hours) }
  return { kind: value.repeat, time: value.time, day: value.repeat === 'weekly' ? Number(value.day) : 0, hours: 24 }
}

/** A new AI job: what Conker should do, and when. Tools still ask before changing anything. */
export function NewAgentJobDialog({ open, onOpenChange, client, loadTools, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; client: Pick<GatewayJobsClient, 'createAgentJob'>
  loadTools?: (signal?: AbortSignal) => Promise<ToolInventory>; onCreated: (job: GatewayJob) => void
}) {
  const [value, setValue] = useState(blank), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const [tools, setTools] = useState<ToolInventory['results'] | null>(null)
  const watching = value.repeat === 'tool'
  useEffect(() => {
    if (!open || !watching || tools || !loadTools) return
    const controller = new AbortController()
    loadTools(controller.signal).then(found => { if (!controller.signal.aborted) setTools(found.status === 'ok' ? found.results : []) }).catch(() => { if (!controller.signal.aborted) setTools([]) })
    return () => controller.abort()
  }, [open, watching, tools, loadTools])
  const chosen = tools?.find(tool => tool.id === value.tool)
  const close = () => { setValue(blank); setError(null); onOpenChange(false) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError(null)
    try {
      const inputs = Object.fromEntries(Object.entries(value.inputs).filter(([name, text]) => text.trim() && chosen?.inputs.some(input => input.name === name)))
      onCreated(await client.createAgentJob({ name: value.name, instructions: value.instructions, timing: timing(value), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(watching ? { watch: { toolId: value.tool, args: inputs, everyMinutes: Number(value.minutes) } } : {}), ...(value.repeat === 'webhook' ? { clock: false } : {}) }))
      setValue(blank)
    } catch (cause) { setError(cause instanceof GatewayJobMutationError ? cause.message : gatewayError(cause).message) } finally { setPending(false) }
  }
  const select = (id: string, current: string, items: { value: string; label: string }[], onChange: (next: string) => void) =>
    <Select value={current} onValueChange={next => { if (next !== null) onChange(next) }} disabled={pending} items={items}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  return <Dialog open={open} onOpenChange={next => !pending && !next && close()} disablePointerDismissal>
    <TaskDialogContent title="New AI job" description="Tell Conker what to do and when. It works with its tools on that schedule and asks before changing, sending or creating anything." showCloseButton={!pending}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><OverlayBody>
        <div className="space-y-2"><Label htmlFor="agent-job-name">Name</Label><Input id="agent-job-name" required maxLength={80} disabled={pending} value={value.name} placeholder="Weekly life review" onChange={event => setValue({ ...value, name: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="agent-job-instructions">What to do</Label><Textarea id="agent-job-instructions" required maxLength={4000} disabled={pending} value={value.instructions} placeholder="Look at my whole week: chats, calendar and memory. Suggest better ways to organize it, and tell me only if something needs me." onChange={event => setValue({ ...value, instructions: event.target.value })} className="min-h-32 resize-y" />
          <p className="text-xs leading-5 text-muted-foreground">Add conditions in your own words, like “only if a deadline is within three days”. When there’s nothing for you, it stays quiet.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={watching || value.repeat === 'webhook' ? 'space-y-2 sm:col-span-2' : 'space-y-2'}><Label htmlFor="agent-job-repeat">When</Label>{select('agent-job-repeat', value.repeat, repeats, repeat => setValue({ ...value, repeat: repeat as Repeat }))}</div>
          {watching || value.repeat === 'webhook' ? null : value.repeat === 'hours' ? <div className="space-y-2"><Label htmlFor="agent-job-hours">How often</Label>{select('agent-job-hours', value.hours, intervals.map(hours => ({ value: String(hours), label: hours === 1 ? 'Every hour' : `Every ${hours} hours` })), hours => setValue({ ...value, hours }))}</div>
            : <div className="grid grid-cols-2 gap-2">
              {value.repeat === 'weekly' && <div className="space-y-2"><Label htmlFor="agent-job-day">Day</Label>{select('agent-job-day', value.day, days.map((day, index) => ({ value: String(index), label: day })), day => setValue({ ...value, day }))}</div>}
              <div className={value.repeat === 'weekly' ? 'space-y-2' : 'col-span-2 space-y-2'}><Label htmlFor="agent-job-time">Time</Label><Input id="agent-job-time" type="time" required disabled={pending} value={value.time} onChange={event => setValue({ ...value, time: event.target.value })} /></div>
            </div>}
        </div>
        {watching && <div className="space-y-4 rounded-lg border p-3">
          <div className="space-y-2"><Label htmlFor="agent-job-tool">Tool to watch</Label>
            {tools === null ? <p role="status" className="text-sm text-muted-foreground">Loading tools…</p> : tools.length ? select('agent-job-tool', value.tool, tools.map(tool => ({ value: tool.id, label: tool.name || tool.id })), tool => setValue({ ...value, tool, inputs: {} }))
              : <p className="text-sm text-muted-foreground">No tools are available. Connect one in Tools first, like an MCP server for your messages.</p>}
          </div>
          {chosen?.inputs.map(input => <div key={input.name} className="space-y-2"><Label htmlFor={`agent-job-input-${input.name}`}>{input.name}{input.required ? '' : ' (optional)'}</Label>
            <Input id={`agent-job-input-${input.name}`} disabled={pending} required={input.required} maxLength={4000} value={value.inputs[input.name] ?? ''} placeholder={input.description} onChange={event => setValue({ ...value, inputs: { ...value.inputs, [input.name]: event.target.value } })} /></div>)}
          <div className="space-y-2"><Label htmlFor="agent-job-minutes">Look every</Label>{select('agent-job-minutes', value.minutes, looks.map(minutes => ({ value: String(minutes), label: minutes === 60 ? '1 hour' : `${minutes} minutes` })), minutes => setValue({ ...value, minutes }))}</div>
          <p className="text-xs leading-5 text-muted-foreground">Pick a tool that reads, like “new messages”. Conker looks every few minutes and starts this job only when the answer changes. A tool that asks for your OK each time can’t be watched.</p>
        </div>}
        <p className="text-xs leading-5 text-muted-foreground">{value.repeat === 'webhook' ? 'After you create it, make its webhook on the job’s page to get the address and secret.' : watching ? 'Watching pauses in your quiet hours; anything new then starts the job at the first look after.' : value.repeat === 'hours' ? 'Repeating jobs skip your quiet hours (set in Settings), so they never run at night.' : 'It runs at the time you set, in this device’s time zone.'}</p>
        {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
      </OverlayBody>
      <FormActions inset description="Creating it asks for your password.">
        <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button>
        <Button type="submit" disabled={pending || !value.name.trim() || !value.instructions.trim() || (watching ? !chosen : value.repeat !== 'hours' && value.repeat !== 'webhook' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))}><Sparkles />{pending ? 'Creating…' : 'Create AI job'}</Button>
      </FormActions></form>
    </TaskDialogContent>
  </Dialog>
}
