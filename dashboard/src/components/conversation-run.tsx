import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Check, ChevronRight, CirclePause, CircleAlert, Wrench, Bot, MessageSquare, Circle, ListChecks, FileText, ArrowRightLeft } from "lucide-react"
import { ConversationActivity } from "@/components/conversation-activity"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import type { Character } from "@/lib/api/client"
import type { CharacterMode } from "@/lib/api/character"
import type { ActivityStep, ConversationRun as Run } from "@/lib/api/conversation-types"
import { activityDuration, activityReceiptHref, activitySourceHref, formatActivityRecord, groupActivitySteps, mergeActivityRun } from "@/lib/conversation-activity"

function Elapsed({ run }: { run: Run }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (run.status !== "running") return
    const timer = window.setInterval(() => { if (!document.hidden) setNow(Date.now()) }, 1000)
    return () => window.clearInterval(timer)
  }, [run.status])
  if (!run.startedAt) return null
  return <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{activityDuration(run.startedAt, run.endedAt || now)}</span>
}

/** Same public evidence is used inline and in the existing contextual rail. */
export function RunStepDetail({ step, run }: { step: ActivityStep; run?: Run }) {
  const source = activitySourceHref(step.source?.href)
  const receipt = activityReceiptHref(step.receipt?.href)
  const parent = run?.steps.find(item => item.id === step.parentId)
  return <div className="space-y-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
    {step.agentName && <p><span className="font-medium text-foreground">{step.agentName}</span> · {step.status}</p>}
    {step.parentId && <p>Parent: {parent?.agentName || parent?.label || "Referenced parent unavailable"}</p>}
    {step.handoffTo && <p>Handoff to <span className="font-medium text-foreground">{step.handoffTo.name}</span></p>}
    {step.toolName && <p className="break-all font-mono text-foreground">{step.toolName}</p>}
    {step.startedAt && step.endedAt && <p>Recorded step duration: {activityDuration(step.startedAt, step.endedAt) || "Unavailable"}</p>}
    {step.summaryAvailability === "unavailable" ? <p>No public reasoning summary was supplied for this run.</p> : step.detail && <p className="whitespace-pre-wrap">{step.detail}</p>}
    {step.kind === "summary" && step.summaryAvailability !== "unavailable" && !step.detail && <p>No public summary was supplied.</p>}
    {step.failure && <div><p className="font-medium text-foreground">{step.failure.message}</p>{step.failure.recovery && <p>{step.failure.recovery}</p>}</div>}
    {step.plan && <><ol aria-label="Supplied plan" className="space-y-1">{step.plan.slice(0, 40).map(item => <li key={item.id} className="flex items-start gap-2"><span className="min-w-0 flex-1">{item.label}</span><span className="shrink-0">{item.status}</span></li>)}</ol>{step.plan.length > 40 && <p>{step.plan.length - 40} additional checklist items omitted from this preview.</p>}</>}
    {step.record && <pre tabIndex={0} aria-label={`${step.toolName || step.label} public input and result`} className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-foreground">{formatActivityRecord(step.record)}</pre>}
    {step.source && (source ? <a href={source} className="inline-flex min-h-8 items-center underline underline-offset-4" {...(source.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Open source: {step.source.label}{source.startsWith("http") ? " (new tab)" : ""}</a> : <p>Source unavailable: {step.source.label}</p>)}
    {step.approvalId && <Button asChild variant="outline" size="sm"><Link to={`/inbox/${encodeURIComponent(step.approvalId)}`}>Review request in Inbox</Link></Button>}
    {step.receipt && <div>
      <p className="font-medium text-foreground">{step.receipt.label}</p>
      {step.receipt.kind === "diff" && <p>{step.receipt.added !== undefined && step.receipt.removed !== undefined ? `${step.receipt.added} added · ${step.receipt.removed} removed · supplied diff` : "Diff counts unavailable"}</p>}
      {receipt ? <a href={receipt} download className="inline-flex min-h-8 items-center underline underline-offset-4">Download bundled {step.receipt.kind === "diff" ? "diff" : "file"}</a> : <p>No downloadable result was supplied.</p>}
    </div>}
    {!step.detail && !step.record && !step.failure && !step.plan && !step.receipt && !step.source && !step.summaryAvailability && <p>No additional public evidence was supplied.</p>}
  </div>
}

function Step({ step, run, onInspect }: { step: ActivityStep; run: Run; onInspect?: (runId: string, stepId: string) => void }) {
  const Icon = step.status === "failed" ? CircleAlert : step.status === "stopped" || step.status === "waiting" ? CirclePause : step.kind === "tool" ? Wrench : step.kind === "agent" ? Bot : step.kind === "handoff" ? ArrowRightLeft : step.kind === "plan" ? ListChecks : step.kind === "receipt" ? FileText : step.kind === "commentary" ? MessageSquare : step.status === "complete" ? Check : Circle
  const label = <><Icon aria-hidden="true" className={`mt-0.5 size-3.5 shrink-0 ${step.status === "failed" ? "text-destructive" : step.status === "running" ? "text-primary" : "text-muted-foreground"}`} /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{step.agentName ? `${step.agentName}: ` : ""}{step.label}</span><span className="shrink-0 text-muted-foreground">{step.status}</span>{step.startedAt && step.endedAt && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{activityDuration(step.startedAt, step.endedAt)}</span>}</>
  return <li className="min-w-0">
    <details className="group/step">
      <summary className="flex min-h-8 cursor-pointer list-none items-start gap-2 rounded-md py-1.5 text-xs leading-5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{label}<ChevronRight aria-hidden="true" className="mt-1 size-3 shrink-0 transition-transform group-open/step:rotate-90 motion-reduce:transition-none" /></summary>
      <div className="ml-5 space-y-2 pb-3 pt-1 text-xs leading-5 text-muted-foreground">
        <RunStepDetail step={step} run={run} />
        {onInspect && <Button type="button" variant="outline" size="sm" onClick={() => onInspect(run.id, step.id)}>Inspect activity</Button>}
      </div>
    </details>
  </li>
}

function StepList({ steps, run, onInspect }: { steps: ActivityStep[]; run: Run; onInspect?: (runId: string, stepId: string) => void }) {
  const [limit, setLimit] = useState(40)
  return <><ol aria-label="Activity steps" className="space-y-1 py-1">{steps.slice(0, limit).map(step => <Step key={step.id} step={step} run={run} onInspect={onInspect} />)}</ol>{steps.length > limit && <Button variant="outline" size="sm" onClick={() => setLimit(value => value + 40)}>Show next {Math.min(40, steps.length - limit)} steps ({steps.length - limit} remaining)</Button>}</>
}

/** A run has one quiet disclosure. Transport evidence, not elapsed time, supplies its steps. */
export function ConversationRun({ run: suppliedRun, profile, mode = "focus", motion = true, onInspectStep }: { run: Run; profile?: Character; mode?: CharacterMode; motion?: boolean; onInspectStep?: (runId: string, stepId: string) => void }) {
  const run = mergeActivityRun(undefined, suppliedRun)
  const groups = groupActivitySteps(run.steps)
  const [groupLimit, setGroupLimit] = useState(40)
  const active = run.status === "running"
  const label = active ? run.label : run.status === "stopped" ? run.startedAt ? "Stopped after" : "Stopped" : run.status === "failed" ? run.startedAt ? "Failed after" : "Failed" : run.provenance === "recorded" ? run.label : run.startedAt ? "Worked for" : "Completed"
  const StatusIcon = run.status === "failed" ? CircleAlert : run.status === "stopped" ? CirclePause : Check
  return <Collapsible className="conversation-run min-w-0" data-status={run.status}>
    <CollapsibleTrigger className="group/run flex min-h-9 max-w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${active ? "View current activity" : "View response activity"}: ${label}`}>
      {active || run.status === "complete" ? <ConversationActivity profile={profile} mode={mode} phase={run.phase} status={run.status} compact motion={motion} /> : <StatusIcon aria-hidden="true" className={`size-3.5 shrink-0 ${run.status === "failed" ? "text-destructive" : ""}`} />}
      <span className={`min-w-0 [overflow-wrap:anywhere] ${active ? "font-medium text-foreground" : ""}`}>{label}</span>
      <Elapsed run={run} />
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-data-[state=open]/run:rotate-90 motion-reduce:transition-none" />
      {run.provenance !== "live" && <span className="ml-1 text-[11px] text-muted-foreground">Preview</span>}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="mb-3 ml-3.5 max-w-full border-l pl-4">
        {groups.length === 0 && <p className="py-2 text-xs text-muted-foreground">No public activity steps were supplied.</p>}
        {groups.slice(0, groupLimit).map(group => group.length === 1 ? <StepList key={group[0].id} steps={group} run={run} onInspect={onInspectStep} /> : <details key={group[0].id} className="py-1 text-xs"><summary className="min-h-8 cursor-pointer rounded-md py-2 focus-visible:outline-2 focus-visible:outline-ring">{group[0].label} · {group.length} {group[0].status} steps</summary><StepList steps={group} run={run} onInspect={onInspectStep} /></details>)}
        {groups.length > groupLimit && <Button variant="outline" size="sm" onClick={() => setGroupLimit(value => value + 40)}>Show more activity ({groups.length - groupLimit} groups remaining)</Button>}
        {run.provenance !== "live" && <p className="pb-2 pt-1 text-xs leading-5 text-muted-foreground">{run.provenance === "recorded" ? "Recorded sample activity. Total run timing was not recorded." : "Preview activity. No model, tool or agent service is connected."}</p>}
      </div>
    </CollapsibleContent>
  </Collapsible>
}
