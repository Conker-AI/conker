import { useEffect, useState } from "react"
import { Check, ChevronRight, CirclePause, CircleAlert, Wrench, Bot, MessageSquare, Circle } from "lucide-react"
import { ConversationActivity } from "@/components/conversation-activity"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { Character } from "@/lib/api/client"
import type { CharacterMode } from "@/lib/api/character"
import type { ActivityStep, ConversationRun as Run } from "@/lib/api/conversation-types"

function duration(start: string, end: string | number) {
  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000))
  if (!Number.isFinite(seconds)) return ""
  return seconds === 0 ? "<1s" : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function Elapsed({ run }: { run: Run }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (run.status !== "running") return
    const timer = window.setInterval(() => { if (!document.hidden) setNow(Date.now()) }, 1000)
    return () => window.clearInterval(timer)
  }, [run.status])
  if (!run.startedAt) return null
  return <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{duration(run.startedAt, run.endedAt || now)}</span>
}

function Step({ step }: { step: ActivityStep }) {
  const Icon = step.status === "failed" ? CircleAlert : step.status === "stopped" || step.status === "waiting" ? CirclePause : step.kind === "tool" ? Wrench : step.kind === "agent" ? Bot : step.kind === "commentary" ? MessageSquare : step.status === "complete" ? Check : Circle
  const detail = step.detail || step.record || step.toolName
  const label = <><Icon aria-hidden="true" className={`mt-0.5 size-3.5 shrink-0 ${step.status === "failed" ? "text-destructive" : step.status === "running" ? "text-primary" : "text-muted-foreground"}`} /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{step.label}</span><span className="sr-only"> · {step.status}</span>{step.startedAt && step.endedAt && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{duration(step.startedAt, step.endedAt)}</span>}</>
  return <li className="min-w-0">
    {detail ? <details className="group/step">
      <summary className="flex min-h-8 cursor-pointer list-none items-start gap-2 rounded-md py-1.5 text-xs leading-5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{label}<ChevronRight aria-hidden="true" className="mt-1 size-3 shrink-0 transition-transform group-open/step:rotate-90 motion-reduce:transition-none" /></summary>
      <div className="ml-5 space-y-2 pb-3 pt-1 text-xs leading-5 text-muted-foreground">
        {step.toolName && <p className="break-all font-mono text-foreground">{step.toolName}</p>}
        {step.detail && <p>{step.detail}</p>}
        {step.record && <pre tabIndex={0} aria-label={`${step.toolName || step.label} input and result`} className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-foreground">{JSON.stringify(step.record, null, 2)}</pre>}
      </div>
    </details> : <div className="flex min-h-8 items-start gap-2 py-1.5 text-xs leading-5">{label}</div>}
  </li>
}

/** A run has one quiet disclosure. Transport evidence, not elapsed time, supplies its steps. */
export function ConversationRun({ run, profile, mode = "focus", motion = true }: { run: Run; profile?: Character; mode?: CharacterMode; motion?: boolean }) {
  const active = run.status === "running"
  const label = active ? run.label : run.status === "stopped" ? "Stopped after" : run.status === "failed" ? "Failed after" : run.provenance === "recorded" ? run.label : "Worked for"
  const StatusIcon = run.status === "failed" ? CircleAlert : run.status === "stopped" ? CirclePause : Check
  return <Collapsible className="conversation-run min-w-0" data-status={run.status}>
    <CollapsibleTrigger className="group/run flex min-h-9 max-w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${active ? "View current activity" : "View response activity"}: ${label}`}>
      {active ? <ConversationActivity profile={profile} mode={mode} phase={run.phase} compact motion={motion} /> : <StatusIcon aria-hidden="true" className={`size-3.5 shrink-0 ${run.status === "failed" ? "text-destructive" : ""}`} />}
      <span className={`min-w-0 [overflow-wrap:anywhere] ${active ? "font-medium text-foreground" : ""}`}>{label}</span>
      <Elapsed run={run} />
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-data-[state=open]/run:rotate-90 motion-reduce:transition-none" />
      {run.provenance !== "live" && <span className="ml-1 text-[11px] text-muted-foreground">Preview</span>}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="mb-3 ml-3.5 max-w-full border-l pl-4">
        <ol aria-label="Activity steps" className="space-y-1 py-1">{run.steps.map(step => <Step key={step.id} step={step} />)}</ol>
        {run.provenance !== "live" && <p className="pb-2 pt-1 text-xs leading-5 text-muted-foreground">{run.provenance === "recorded" ? "Recorded sample activity. Total run timing was not recorded." : "Preview activity. No model, tool or agent service is connected."}</p>}
      </div>
    </CollapsibleContent>
  </Collapsible>
}
