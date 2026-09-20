import { useEffect, useId, useState } from "react"
import { Link } from "react-router-dom"
import { CollectionSearch, FormActions, OverlayBody } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { Agent, Session } from "@/lib/api/models"
import type { ActivityRunRecord, TaskInput, TaskRecord, TaskReview, TaskStatus } from "@/lib/api/task-types"
import { Provenance } from "./presentation"
import { isTerminal, taskLabels } from "./format"
import { SearchableSelect } from "./searchable-select"

type EditorDraft = { outcome: string; criteria: string; sessionId: string; agentId: string; parentTaskId: string; runIds: string[]; revision?: number }
const drafts = new Map<string, EditorDraft>()
const reviews = new Map<string, { note: string; checked: string[]; revision: number }>()

export function TaskEditor({ task, initialSessionId, initialAgentId, agents, sessions, tasks, runs, pending, error, onSave, onCancel }: {
  task?: TaskRecord; agents: Agent[]; sessions: Session[]; tasks: TaskRecord[]; runs: ActivityRunRecord[];
  initialSessionId?: string; initialAgentId?: string;
  pending: boolean; error: string; onSave: (input: TaskInput, revision?: number) => Promise<boolean>; onCancel: () => void
}) {
  const id = useId()
  const draftKey = task?.id ?? "new"
  const draft = drafts.get(draftKey)
  const [outcome, setOutcome] = useState(draft?.outcome ?? task?.outcome ?? "")
  const [criteria, setCriteria] = useState(draft?.criteria ?? task?.criteria.map(item => item.text).join("\n") ?? "")
  const [sessionId, setSessionId] = useState(draft?.sessionId ?? task?.sessionId ?? initialSessionId ?? "")
  const [agentId, setAgentId] = useState(draft?.agentId ?? task?.agentId ?? initialAgentId ?? agents.find(agent => agent.kind === "companion" && !agent.archivedAt)?.id ?? "")
  const [parentTaskId, setParentTaskId] = useState(draft?.parentTaskId ?? task?.parentTaskId ?? "none")
  const [runIds, setRunIds] = useState(draft?.runIds ?? task?.runIds ?? [])
  const [revision] = useState(draft?.revision ?? task?.revision)
  const [runQuery, setRunQuery] = useState("")
  const [validation, setValidation] = useState("")
  const stale = task && revision !== task.revision
  const differentPrefill = !task && (!!initialSessionId && initialSessionId !== sessionId || !!initialAgentId && initialAgentId !== agentId)
  useEffect(() => { drafts.set(draftKey, { outcome, criteria, sessionId, agentId, parentTaskId, runIds, revision }) }, [draftKey, outcome, criteria, sessionId, agentId, parentTaskId, runIds, revision])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (outcome.trim() || criteria.trim()) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [outcome, criteria])
  const availableSessions = sessions.filter(session => !session.archived)
  const availableAgents = agents.filter(agent => !agent.archivedAt)
  const eligibleParents = tasks.filter(candidate => {
    if (candidate.id === task?.id || candidate.archivedAt || isTerminal(candidate.status)) return false
    const seen = new Set<string>()
    let ancestor: TaskRecord | undefined = candidate
    while (ancestor) {
      if (ancestor.id === task?.id || seen.has(ancestor.id)) return false
      seen.add(ancestor.id)
      ancestor = tasks.find(item => item.id === ancestor?.parentTaskId)
    }
    return true
  })
  const missingRuns = runIds.filter(runId => !runs.some(run => run.id === runId))
  return <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={async event => {
    event.preventDefault()
    const lines = criteria.split("\n").map(line => line.trim()).filter(Boolean)
    if (!outcome.trim() || !lines.length || lines.length > 20 || lines.some(line => line.length > 500) || new Set(lines.map(line => line.toLocaleLowerCase())).size !== lines.length || !sessionId || !agentId) {
      setValidation("Add an outcome, 1–20 distinct criteria (up to 500 characters each), a conversation and an assigned agent.")
      return
    }
    setValidation("")
    if (await onSave({ outcome, criteria: lines, sessionId, agentId, parentTaskId: parentTaskId === "none" ? null : parentTaskId, runIds }, revision)) drafts.delete(draftKey)
  }}>
    <OverlayBody><fieldset disabled={pending} className="min-w-0 space-y-5">
      {differentPrefill && <p role="status" className="text-xs text-muted-foreground">Your existing draft was kept. Change its links below, or discard it and reopen the conversation shortcut to use that selection.</p>}
      <div className="space-y-2"><Label htmlFor={`${id}-outcome`}>Desired outcome</Label><Textarea id={`${id}-outcome`} autoFocus required maxLength={1000} value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="What result should this task produce?" /></div>
      <div className="space-y-2"><Label htmlFor={`${id}-criteria`}>Completion criteria</Label><Textarea id={`${id}-criteria`} required value={criteria} onChange={event => setCriteria(event.target.value)} className="min-h-28" placeholder="One criterion per line" aria-describedby={`${id}-criteria-help`} /><p id={`${id}-criteria-help`} className="text-xs text-muted-foreground">One criterion per line, up to 20. You’ll review each before marking the outcome complete.</p></div>
      <div className="space-y-2"><Label htmlFor={`${id}-conversation`}>Linked conversation</Label><SearchableSelect id={`${id}-conversation`} label="Conversations" value={sessionId} onChange={setSessionId} disabled={pending} options={availableSessions.map(session => ({ value: session.id, label: session.title }))} />{!availableSessions.length && <p className="text-xs text-muted-foreground">Create a <Link className="underline underline-offset-4" to="/chat/new">conversation</Link> first, then return to link it.</p>}</div>
      <div className="space-y-2"><Label htmlFor={`${id}-agent`}>Assigned agent</Label><SearchableSelect id={`${id}-agent`} label="Agents" value={agentId} onChange={setAgentId} disabled={pending} options={availableAgents.map(agent => ({ value: agent.id, label: agent.name }))} /><p className="text-xs text-muted-foreground">Assignment records responsibility. It does not hand off the conversation or grant tool access.</p></div>
      <Collapsible defaultOpen={parentTaskId !== "none" || runIds.length > 0} className="space-y-4"><CollapsibleTrigger asChild><Button type="button" variant="outline" className="w-full">Parent task and linked attempts</Button></CollapsibleTrigger><CollapsibleContent className="space-y-5">
      <div className="space-y-2"><Label htmlFor={`${id}-parent`}>Parent task</Label><SearchableSelect id={`${id}-parent`} label="Parent tasks" value={parentTaskId} onChange={setParentTaskId} disabled={pending} options={[{ value: "none", label: "No parent" }, ...eligibleParents.map(parent => ({ value: parent.id, label: parent.outcome }))]} /></div>
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">Linked attempts</legend><p className="text-xs text-muted-foreground">Choose existing records that belong to this outcome. Linking a preview run does not prove real execution.</p>{runs.length > 0 && <CollectionSearch label="Search attempts to link" placeholder="Search attempts or source…" value={runQuery} onChange={event => setRunQuery(event.target.value)} />}{runs.length || missingRuns.length ? <div className="max-h-48 space-y-3 overflow-y-auto rounded-md border p-3">{runs.filter(run => `${run.label} ${run.source.kind} ${run.source.runId}`.toLocaleLowerCase().includes(runQuery.trim().toLocaleLowerCase())).map((run, index) => <div key={run.id} className="flex items-start gap-3"><Checkbox id={`${id}-run-${index}`} checked={runIds.includes(run.id)} onCheckedChange={checked => setRunIds(current => checked ? [...current, run.id] : current.filter(value => value !== run.id))} /><Label htmlFor={`${id}-run-${index}`} className="min-w-0 flex-1 flex-wrap leading-5">{run.label}<Provenance value={run.provenance} /><span className="text-xs text-muted-foreground">{run.source.kind} · {run.status}</span></Label></div>)}{!runs.some(run => `${run.label} ${run.source.kind} ${run.source.runId}`.toLocaleLowerCase().includes(runQuery.trim().toLocaleLowerCase())) && <p className="text-xs text-muted-foreground">No attempts match this search.</p>}{missingRuns.map(runId => <div key={runId} className="space-y-2"><p className="text-xs text-muted-foreground">Unavailable run: {runId}</p><Button type="button" size="sm" variant="outline" onClick={() => setRunIds(current => current.filter(value => value !== runId))}>Remove unavailable link</Button></div>)}</div> : <p className="text-sm text-muted-foreground">No recorded attempts yet. You can link them later.</p>}</fieldset>
      </CollapsibleContent></Collapsible>
      {stale && <p role="alert" className="text-sm text-destructive">The task changed after this draft was opened. Discard this draft and reopen Edit to use the current revision.</p>}
      {(validation || error) && <p role="alert" className="text-sm text-destructive">{validation || error}</p>}
    </fieldset></OverlayBody>
    <FormActions inset description="Draft kept in this app until saved or discarded. Resets on reload."><Button type="button" variant="ghost" disabled={pending} onClick={() => { drafts.delete(draftKey); onCancel() }}>Discard draft</Button><Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Close</Button><Button type="submit" disabled={pending || !!stale || !availableSessions.length || !availableAgents.length}>{pending ? "Saving…" : task ? "Save task" : "Create task"}</Button></FormActions>
  </form>
}

export function TaskStatusReview({ task, status, pending, error, onSave, onCancel }: {
  task: TaskRecord; status: TaskStatus; pending: boolean; error: string; onSave: (review: TaskReview, revision: number) => Promise<boolean>; onCancel: () => void
}) {
  const id = useId()
  const reviewKey = `${task.id}:${status}`
  const [note, setNote] = useState(reviews.get(reviewKey)?.note ?? "")
  const [checked, setChecked] = useState<string[]>(reviews.get(reviewKey)?.checked ?? [])
  const [revision] = useState(reviews.get(reviewKey)?.revision ?? task.revision)
  useEffect(() => { reviews.set(reviewKey, { note, checked, revision }) }, [reviewKey, note, checked, revision])
  const completed = status === "completed"
  const label = status === "planned" ? "Reopen task" : status === "cancelled" ? "Cancel task tracking" : `Mark ${taskLabels[status].toLocaleLowerCase()}`
  return <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={async event => { event.preventDefault(); if (await onSave({ note, ...(completed ? { completedCriterionIds: checked } : {}) }, revision)) reviews.delete(reviewKey) }}>
    <OverlayBody><fieldset disabled={pending} className="space-y-5"><p className="text-sm font-medium">{task.outcome}</p><p className="text-sm text-muted-foreground">{completed ? "Confirm the result against each criterion. This records your review, not an execution receipt." : status === "cancelled" ? "This cancels tracking only. It does not stop a conversation, running tool or external action." : "This is your reported task status. It does not start an executor or change a linked run."}</p>
      {completed && <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Review completion criteria</legend>{task.criteria.map((criterion, index) => <div key={criterion.id} className="flex items-start gap-3"><Checkbox id={`${id}-criterion-${index}`} checked={checked.includes(criterion.id)} onCheckedChange={value => setChecked(current => value ? [...current, criterion.id] : current.filter(item => item !== criterion.id))} /><Label htmlFor={`${id}-criterion-${index}`} className="leading-5">{criterion.text}</Label></div>)}</fieldset>}
      <div className="space-y-2"><Label htmlFor={`${id}-note`}>{completed ? "Review note" : "Reason for this change"}</Label><Textarea autoFocus={!completed} id={`${id}-note`} required maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder={completed ? "What did you check, and where is the result?" : "Explain the current state or blocker."} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {revision !== task.revision && <p role="alert" className="text-sm text-destructive">The task changed after this review began. Discard the review and reopen it to inspect the current criteria.</p>}
    </fieldset></OverlayBody><FormActions inset description="Review draft kept until saved or discarded."><Button type="button" variant="ghost" disabled={pending} onClick={() => { reviews.delete(reviewKey); onCancel() }}>Discard review</Button><Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Keep current status</Button><Button type="submit" disabled={pending || revision !== task.revision || !note.trim() || completed && checked.length !== task.criteria.length}>{pending ? "Saving…" : label}</Button></FormActions>
  </form>
}
