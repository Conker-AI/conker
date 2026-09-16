import { useId, useState } from "react"
import type { Agent, Job, JobInput } from "@/lib/api/models"
import { describeJobTiming, jobInputErrors, jobTimeZones, weekdays } from "@/lib/api/job-configuration"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { FormActions } from "@/components/design-system"

export function JobEditor({ job, agents, pending, onSave, onCancel }: {
  job?: Job; agents: Agent[]; pending: boolean; onSave: (input: JobInput) => Promise<void>; onCancel: () => void
}) {
  const id = useId()
  const [value, setValue] = useState<JobInput>(() => job ? {
    name: job.name, instructions: job.instructions, agentId: job.agentId,
    timing: { ...job.timing }, timeZone: job.timeZone, enabled: job.status === "Scheduled",
  } : { name: "", instructions: "", agentId: agents.find(agent => agent.kind === "companion")?.id ?? agents[0]?.id ?? "", timing: { kind: "daily", time: "09:00", day: 0, hours: 24 }, timeZone: "Asia/Jerusalem", enabled: true })
  const [errors, setErrors] = useState<ReturnType<typeof jobInputErrors>>({})
  const set = <K extends keyof JobInput>(key: K, next: JobInput[K]) => {
    setValue(current => ({ ...current, [key]: next }))
    setErrors(current => ({ ...current, [key]: undefined }))
  }
  const error = (key: keyof JobInput) => errors[key] && <p id={`${id}-${key}-error`} className="text-xs text-destructive">{errors[key]}</p>
  const describedBy = (key: keyof JobInput) => errors[key] ? `${id}-${key}-error` : undefined

  return <form noValidate className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={async event => {
    event.preventDefault()
    const next = jobInputErrors(value)
    setErrors(next)
    if (Object.keys(next).length) {
      const key = Object.keys(next)[0]
      document.getElementById(`${id}-${key}`)?.focus()
      return
    }
    await onSave(value)
  }}>
    <div data-slot="job-form-scroll" className="min-h-0 flex-1 overflow-y-auto p-5">
    <fieldset disabled={pending} className="min-w-0 space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input id={`${id}-name`} value={value.name} onChange={event => set("name", event.target.value)} maxLength={80} placeholder="e.g. Morning briefing" autoFocus aria-invalid={!!errors.name} aria-describedby={describedBy("name")} />
        {error("name")}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-instructions`}>Instructions</Label>
        <Textarea id={`${id}-instructions`} className="min-h-28 resize-y" value={value.instructions} onChange={event => set("instructions", event.target.value)} maxLength={4000} placeholder="What should the agent do? Include the result you want." aria-invalid={!!errors.instructions} aria-describedby={describedBy("instructions")} />
        {error("instructions")}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-agentId`}>Agent</Label>
        <Select value={value.agentId} onValueChange={next => set("agentId", next)} disabled={pending}>
          <SelectTrigger id={`${id}-agentId`} className="w-full" aria-invalid={!!errors.agentId} aria-describedby={describedBy("agentId")}><SelectValue placeholder="Choose an agent" /></SelectTrigger>
          <SelectContent>{agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
        </Select>
        {error("agentId")}
      </div>
      <div className="space-y-3 border-t pt-5">
        <Label htmlFor={`${id}-timing`}>Schedule</Label>
        <Select value={value.timing.kind} onValueChange={kind => set("timing", { ...value.timing, kind: kind as JobInput["timing"]["kind"] })} disabled={pending}>
          <SelectTrigger id={`${id}-timing`} className="w-full" aria-invalid={!!errors.timing} aria-describedby={describedBy("timing")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="daily">Every day</SelectItem><SelectItem value="weekly">Every week</SelectItem><SelectItem value="interval">Every few hours</SelectItem></SelectContent>
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          {value.timing.kind === "weekly" && <div className="space-y-2">
            <Label htmlFor={`${id}-day`}>Day</Label>
            <Select value={String(value.timing.day)} onValueChange={day => set("timing", { ...value.timing, day: Number(day) })} disabled={pending}>
              <SelectTrigger id={`${id}-day`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{weekdays.map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          {value.timing.kind === "interval" ? <div className="space-y-2">
            <Label htmlFor={`${id}-hours`}>Repeat every (hours)</Label>
            <Input id={`${id}-hours`} type="number" min={1} max={168} step={1} value={Number.isNaN(value.timing.hours) ? "" : value.timing.hours} onChange={event => set("timing", { ...value.timing, hours: event.target.valueAsNumber })} aria-invalid={!!errors.timing} aria-describedby={describedBy("timing")} />
          </div> : <div className="space-y-2">
            <Label htmlFor={`${id}-time`}>Time</Label>
            <Input id={`${id}-time`} type="time" className="dark:[color-scheme:dark]" value={value.timing.time} onChange={event => set("timing", { ...value.timing, time: event.target.value })} aria-invalid={!!errors.timing} aria-describedby={describedBy("timing")} />
          </div>}
        <div className="space-y-2">
          <Label htmlFor={`${id}-timeZone`}>Time zone</Label>
          <Select value={value.timeZone} onValueChange={zone => set("timeZone", zone)} disabled={pending}>
            <SelectTrigger id={`${id}-timeZone`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from(new Set([...jobTimeZones, value.timeZone])).map(zone => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}</SelectContent>
          </Select>
          {error("timeZone")}
        </div>
        </div>
        {error("timing")}
        {!jobInputErrors(value).timing && <p className="text-xs text-muted-foreground">{describeJobTiming(value.timing)} · {value.timeZone}</p>}
      </div>
      <div className="flex items-center justify-between gap-4 border-t pt-5">
        <div className="space-y-1"><Label htmlFor={`${id}-enabled`}>Schedule enabled</Label><p className="text-xs text-muted-foreground">Turn off to save this job paused.</p></div>
        <Switch id={`${id}-enabled`} checked={value.enabled} onCheckedChange={enabled => set("enabled", enabled)} disabled={pending} />
      </div>
    </fieldset>
    </div>
    <FormActions inset description="Preview only · resets on reload · no scheduler connected.">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : job ? "Save changes" : "Create job"}</Button>
    </FormActions>
  </form>
}
