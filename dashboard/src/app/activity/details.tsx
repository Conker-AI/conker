import { Link } from "react-router-dom"
import { Archive, Pencil } from "lucide-react"
import { FormActions, OverlayBody } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ActivityEventRecord, ActivityRunRecord, TaskRecord, TaskStatus } from "@/lib/api/task-types"
import { Output, Provenance, SourceLink, TaskStatusBadge } from "./presentation"
import { displayTime, isTerminal, runHref, taskHref } from "./format"
import { useConker } from "@/lib/api/store"

export function TaskDetails({ task, tasks, runs, agentName, sessionTitle, pending, error, edit, review, archive }: {
  task: TaskRecord; tasks: TaskRecord[]; runs: ActivityRunRecord[]; agentName: string; sessionTitle: string;
  pending: boolean; error: string; edit: () => void; review: (status: TaskStatus) => void; archive: () => void
}) {
  const parent = tasks.find(item => item.id === task.parentTaskId)
  const children = tasks.filter(item => item.parentTaskId === task.id)
  const artifacts = useConker(data => data.artifacts).filter(artifact => artifact.task?.taskId === task.id && (artifact.taskAvailability === "available" || artifact.taskAvailability === "archived"))
  return <><OverlayBody>
    <ReferenceSection title="Outcome"><p className="whitespace-pre-wrap">{task.outcome}</p><div className="flex flex-wrap gap-2"><TaskStatusBadge status={task.status} /><Provenance value="preview" />{task.archivedAt && <Badge variant="outline">Archived</Badge>}</div><p className="text-xs text-muted-foreground">Owner-reported status · no executor connected. Changes reset on reload.</p>{task.statusNote && <p className="whitespace-pre-wrap text-sm">{task.statusNote}</p>}</ReferenceSection>
    <ReferenceSection title="Completion criteria"><ul className="space-y-3">{task.criteria.map(criterion => <li key={criterion.id} className="space-y-1"><p className="text-sm">{criterion.text}</p><span className="text-xs text-muted-foreground">{task.completedCriterionIds.includes(criterion.id) ? "Reviewed by owner" : "Not yet reviewed"}</span></li>)}</ul></ReferenceSection>
    <ReferenceSection title="Responsibility and conversation"><p className="text-sm">Assigned to {agentName}</p><SourceLink href={`/chat/${encodeURIComponent(task.sessionId)}`}>{sessionTitle}</SourceLink><p className="text-xs text-muted-foreground">Assignment does not change the conversation’s agent or grant execution authority.</p></ReferenceSection>
    {(parent || children.length > 0) && <ReferenceSection title="Related tasks">{parent && <p><Link className="text-sm underline underline-offset-4" to={taskHref(parent.id)}>Parent: {parent.outcome}</Link></p>}{children.length > 0 && <ul className="space-y-3">{children.map(child => <li key={child.id} className="space-y-1"><Link className="text-sm underline underline-offset-4" to={taskHref(child.id)}>{child.outcome}</Link><div><TaskStatusBadge status={child.status} /></div></li>)}</ul>}</ReferenceSection>}
    <ReferenceSection title="Linked attempts">{task.runIds.length ? <ul className="space-y-3">{task.runIds.map(id => { const run = runs.find(item => item.id === id); return <li key={id}>{run ? <><Link className="text-sm underline underline-offset-4" to={runHref(run.id)}>{run.label}</Link><div className="mt-1 flex flex-wrap gap-2"><Provenance value={run.provenance} /><span className="text-xs text-muted-foreground">{run.status}</span></div></> : <p className="text-sm text-muted-foreground">Linked run unavailable. Its reference is retained.</p>}</li> })}</ul> : <p className="text-sm text-muted-foreground">No attempts linked. Edit the task to link an existing conversation, job or tool run.</p>}</ReferenceSection>
    <ReferenceSection title="Saved outputs">{artifacts.length ? <ul className="space-y-3">{artifacts.map(artifact => <li key={artifact.id}><Link className="text-sm underline underline-offset-4" to={`/artifacts/${encodeURIComponent(artifact.id)}?version=${artifact.currentVersion}`}>{artifact.title}</Link><p className="mt-1 text-xs text-muted-foreground">Version {artifact.currentVersion}{artifact.archivedAt ? " · Archived" : ""} · Preview</p></li>)}</ul> : <p className="text-sm text-muted-foreground">Save an assistant response to Artifacts and choose this task to link a versioned output.</p>}</ReferenceSection>
    <ReferenceSection title="Tracking history"><ol className="space-y-3">{task.changes.slice().reverse().map(change => <li key={change.id}><p className="text-sm whitespace-pre-wrap">{change.note}</p><p className="mt-1 text-xs text-muted-foreground">{displayTime(change.at)}</p></li>)}</ol></ReferenceSection>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </OverlayBody><FormActions inset>
    {task.archivedAt ? <Button disabled={pending} onClick={archive}>Restore task</Button> : <>
      {!isTerminal(task.status) && <Button variant="outline" disabled={pending} onClick={edit}><Pencil />Edit</Button>}
      {isTerminal(task.status) ? <><Button variant="outline" disabled={pending} onClick={archive}><Archive />Archive</Button><Button disabled={pending} onClick={() => review("planned")}>Reopen task</Button></> : <>
        <Button variant="outline" disabled={pending} onClick={() => review("cancelled")}>Cancel tracking</Button>
        {task.status !== "blocked" && <Button variant="outline" disabled={pending} onClick={() => review("blocked")}>Record blocker</Button>}
        {task.status === "in_progress" ? <Button disabled={pending} onClick={() => review("completed")}>Review completion</Button> : <Button disabled={pending} onClick={() => review("in_progress")}>Mark in progress</Button>}
      </>}
    </>}
  </FormActions></>
}

export function RunDetails({ run, runs, events, tasks }: { run: ActivityRunRecord; runs: ActivityRunRecord[]; events: ActivityEventRecord[]; tasks: TaskRecord[] }) {
  const parent = runs.find(item => item.id === run.parentRunId)
  const children = runs.filter(item => item.parentRunId === run.id)
  const linkedTasks = tasks.filter(task => task.runIds.includes(run.id))
  const runEvents = events.filter(event => event.runId === run.id)
  return <><OverlayBody>
    <ReferenceSection title="Attempt"><div className="flex flex-wrap gap-2"><Badge variant="outline">{run.status}</Badge><Provenance value={run.provenance} /></div><p className="text-sm">{run.source.kind === "tool" ? `Tool version: ${run.source.version}` : `Source: ${run.source.kind}`}</p><dl className="space-y-2 text-sm"><div><dt className="text-xs text-muted-foreground">Started</dt><dd>{displayTime(run.startedAt)}</dd></div><div><dt className="text-xs text-muted-foreground">Ended</dt><dd>{displayTime(run.endedAt)}</dd></div></dl><p className="text-xs text-muted-foreground">{run.provenance === "preview" ? "Local preview results do not establish external execution." : run.provenance === "sample" ? "Illustrative source record, not evidence of an action on your server." : "Status and outputs come from the supplied source record."}</p></ReferenceSection>
    {(parent || children.length > 0) && <ReferenceSection title="Related attempts">{parent && <Link className="block text-sm underline underline-offset-4" to={runHref(parent.id)}>Parent: {parent.label}</Link>}{children.map(child => <Link key={child.id} className="block text-sm underline underline-offset-4" to={runHref(child.id)}>Child: {child.label} · {child.status}</Link>)}</ReferenceSection>}
    {linkedTasks.length > 0 && <ReferenceSection title="Linked tasks">{linkedTasks.map(task => <Link key={task.id} className="block text-sm underline underline-offset-4" to={taskHref(task.id)}>{task.outcome}</Link>)}</ReferenceSection>}
    <ReferenceSection title="Outputs">{run.outputs.length ? <div className="space-y-4">{run.outputs.map((output, index) => <Output key={`${output.id}-${index}`} output={output} />)}</div> : <p className="text-sm text-muted-foreground">No output was supplied in this record. The original source may contain more detail.</p>}</ReferenceSection>
    <ReferenceSection title="Public events">{runEvents.length ? <ol className="space-y-4">{runEvents.map(event => <li key={event.id} className="space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{event.label}</span>{event.status && <Badge variant="outline">{event.status}</Badge>}</div>{event.detail && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.detail}</p>}{event.receipt && <Output output={event.receipt} />}</li>)}</ol> : <p className="text-sm text-muted-foreground">No public action events were supplied. Thinking and planning displays are not execution evidence.</p>}</ReferenceSection>
  </OverlayBody><FormActions inset><SourceLink href={run.source.href}>Open original source</SourceLink></FormActions></>
}

export function EventDetails({ event }: { event: ActivityEventRecord }) {
  const sourceHref = event.source.kind === "task" ? taskHref(event.source.taskId) : event.source.href
  return <><OverlayBody><ReferenceSection title="Event"><div className="flex flex-wrap gap-2"><Provenance value={event.provenance} />{event.status && <Badge variant="outline">{event.status}</Badge>}</div><p className="whitespace-pre-wrap text-sm">{event.detail || "No additional detail supplied."}</p><p className="text-xs text-muted-foreground">{event.actor ?? "Actor not recorded"} · {event.displayTime ?? displayTime(event.occurredAt)}</p></ReferenceSection><ReferenceSection title="Source"><p className="text-sm">{event.source.kind === "task" ? "Owner-authored task tracking change." : `${event.source.kind} record.`}</p><p className="text-xs text-muted-foreground">{event.provenance === "sample" || event.provenance === "preview" ? "This is a sample or frontend preview record. It does not establish a live external action." : "The source supplies this event and its provenance."}</p>{event.receipt && <Output output={event.receipt} />}</ReferenceSection></OverlayBody><FormActions inset>{event.runId && <Button variant="outline" size="sm" asChild><Link to={runHref(event.runId)}>Inspect attempt</Link></Button>}<SourceLink href={sourceHref} /></FormActions></>
}
