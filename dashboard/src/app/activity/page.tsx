import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ListChecks, Plus, RefreshCw } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { CollectionEmpty, DetailPanel, RouteSection, TaskDialogContent } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { conkerClient } from "@/lib/api"
import { useConker, useConkerStore } from "@/lib/api/store"
import { projectActivity } from "@/lib/api/activity-projection"
import type { TaskRecord, TaskStatus } from "@/lib/api/task-types"
import type { WorkspaceRecord } from "@/lib/tool-workspace"
import { EventDetails, RunDetails, TaskDetails } from "./details"
import { isTerminal, taskLabels } from "./format"
import { EventsTable, RunsTable, TasksTable } from "./tables"
import { TaskEditor, TaskStatusReview } from "./task-form"

type TaskDialog = { kind: "edit"; task: TaskRecord } | { kind: "review"; task: TaskRecord; status: TaskStatus }

export default function ActivityPage() {
  const data = useConker(snapshot => snapshot)
  const { mutate, pending, notice } = useConkerStore()
  const [params, setParams] = useSearchParams()
  const [tools, setTools] = useState<WorkspaceRecord[]>([])
  const [toolState, setToolState] = useState<"loading" | "ready" | "error">("loading")
  const [toolError, setToolError] = useState("")
  const [reload, setReload] = useState(0)
  const [dialog, setDialog] = useState<TaskDialog | null>(null)
  const [formError, setFormError] = useState("")
  const [taskFilter, setTaskFilter] = useState("active")
  const newButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const creating = params.get("new") === "1"
  const initialSessionId = data.sessions.find(session => session.id === params.get("session") && !session.archived)?.id
  const initialAgentId = data.agents.find(agent => agent.id === params.get("agent") && !agent.archivedAt)?.id
  const invalidPrefill = creating && (!!params.get("session") && !initialSessionId || !!params.get("agent") && !initialAgentId)

  useEffect(() => {
    let active = true, version = 0
    const refresh = async () => {
      const current = ++version
      try {
        const records = await conkerClient.toolWorkspace.list()
        if (active && current === version) { setTools(records); setToolState("ready"); setToolError("") }
      } catch (error) {
        if (active && current === version) { setToolState("error"); setToolError(error instanceof Error ? error.message : "Tool history could not be loaded.") }
      }
    }
    const unsubscribe = conkerClient.toolWorkspace.subscribe(() => void refresh())
    void refresh()
    return () => { active = false; unsubscribe() }
  }, [reload])

  const activity = useMemo(() => projectActivity({ sessions: data.sessions, conversations: data.conversations, jobs: data.jobs, entries: data.entries, journalProvenance: "sample", fixture: conkerClient.mode === "fixture", tools, tasks: data.tasks }), [data, tools])
  const selectedTask = data.tasks.find(task => task.id === params.get("task"))
  const selectedRun = activity.runs.find(run => run.id === params.get("run"))
  const selectedEvent = activity.events.find(event => event.id === params.get("event"))
  const selected = selectedTask ?? selectedRun ?? selectedEvent
  const agentName = (id: string) => data.agents.find(agent => agent.id === id)?.name ?? "Unavailable agent"
  const rememberFocus = () => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const target = returnFocus.current
      ;(target?.isConnected ? target : newButton.current)?.focus()
    })
  }
  const select = (kind: "task" | "run" | "event", id: string) => {
    rememberFocus(); setFormError("")
    const next = new URLSearchParams(params)
    for (const key of ["task", "run", "event", "new", "session", "agent"]) next.delete(key)
    next.set("tab", kind === "task" ? "tasks" : kind === "run" ? "runs" : "events")
    next.set(kind, id); setParams(next)
  }
  const closeDetails = () => {
    const next = new URLSearchParams(params)
    for (const key of ["task", "run", "event"]) next.delete(key)
    setParams(next, { replace: true }); setFormError("")
  }
  const create = () => {
    rememberFocus(); setFormError(""); setDialog(null)
    const next = new URLSearchParams(params)
    for (const key of ["task", "run", "event", "session", "agent"]) next.delete(key)
    next.set("tab", "tasks"); next.set("new", "1"); setParams(next)
  }
  const closeDialog = () => {
    if (pending) return
    setDialog(null); setFormError("")
    if (creating) {
      const next = new URLSearchParams(params)
      for (const key of ["new", "session", "agent"]) next.delete(key)
      setParams(next, { replace: true })
    }
  }
  const openDialog = (value: TaskDialog) => { setFormError(""); setDialog(structuredClone(value)) }
  const filteredTasks = data.tasks.filter(task => {
    if (taskFilter === "all") return true
    if (taskFilter === "archived") return !!task.archivedAt
    return !task.archivedAt && (taskFilter === "active" ? !isTerminal(task.status) : isTerminal(task.status))
  })
  const filterControl = <Select value={taskFilter} onValueChange={setTaskFilter}><SelectTrigger size="sm" aria-label="Filter tasks" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active tasks</SelectItem><SelectItem value="history">Completed / cancelled</SelectItem><SelectItem value="archived">Archived tasks</SelectItem><SelectItem value="all">All tasks</SelectItem></SelectContent></Select>
  const unknownSelection = (params.has("task") || params.has("event") || params.has("run") && toolState !== "loading") && !selected

  return <BaseLayout variant="collection" title="Activity" description="Track outcomes, inspect attempts, and follow the records they leave." status={<Badge variant="outline">Preview</Badge>} actions={<Button ref={newButton} onClick={create} disabled={pending}><Plus />New task</Button>}>
    <p className="text-xs leading-5 text-muted-foreground">Tasks are owner-reported tracking. Runs and events retain their sample or preview source. Changes reset on reload.</p>
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {unknownSelection && <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"><p>This record is unavailable in the current preview. Reloading resets local work.</p><Button size="sm" variant="outline" onClick={closeDetails}>Clear selection</Button></div>}
    <RouteSection value="tasks">
      {data.tasks.length ? <TasksTable tasks={filteredTasks} agentName={agentName} open={task => select("task", task.id)} toolbar={filterControl} /> : <CollectionEmpty icon={<ListChecks />} title="What outcome should Conker work toward?" description="Create a task with completion criteria and link its conversation. You can record progress and connect existing attempts without starting an executor." action={<Button onClick={create}><Plus />Create your first task</Button>} />}
    </RouteSection>
    <RouteSection value="runs"><div className="space-y-4">
      {toolState === "loading" && <p role="status" className="text-xs text-muted-foreground">Loading tool run history…</p>}
      {toolState === "error" && <div role="alert" className="space-y-2 rounded-md border p-3"><p className="text-sm">Tool run history is unavailable. {tools.length ? "Showing the last loaded tool records." : "Conversation and job records remain available."}</p><p className="text-xs text-muted-foreground">{toolError}</p><Button size="sm" variant="outline" onClick={() => setReload(value => value + 1)}><RefreshCw />Retry tool history</Button></div>}
      {activity.runs.length ? <RunsTable runs={activity.runs} open={run => select("run", run.id)} /> : <CollectionEmpty title="No attempts recorded" description="Conversation activity, job history and local tool tests appear here when their sources provide a record." action={<Button asChild variant="outline"><Link to="/chat">Open conversations</Link></Button>} />}
    </div></RouteSection>
    <RouteSection value="events"><div className="space-y-4">{params.get("actor") && params.get("actor") !== "all" && <div className="flex flex-wrap items-center gap-3 text-sm"><span>Actor: {params.get("actor")}</span><Button size="sm" variant="outline" onClick={() => { const next = new URLSearchParams(params); next.delete("actor"); setParams(next, { replace: true }) }}>Show all actors</Button></div>}{activity.events.length ? <EventsTable events={activity.events.filter(event => !params.get("actor") || params.get("actor") === "all" || event.actor === params.get("actor"))} open={event => select("event", event.id)} /> : <CollectionEmpty title="No events recorded" description="Journal entries, supplied receipts and your task changes appear here. Thinking displays do not create execution events." />}</div></RouteSection>
    <DetailPanel open={!!selected && !dialog && !creating} busy={pending} onOpenChange={open => { if (!open) closeDetails() }} title={selectedTask?.outcome ?? selectedRun?.label ?? selectedEvent?.label ?? "Activity details"} description={selectedTask ? "Task tracking · owner-reported preview" : selectedRun ? "Source attempt and supplied outputs" : "Event detail and original source"} onCloseAutoFocus={restoreFocus}>
      {selectedTask && <TaskDetails task={selectedTask} tasks={data.tasks} runs={activity.runs} agentName={agentName(selectedTask.agentId)} sessionTitle={data.sessions.find(session => session.id === selectedTask.sessionId)?.title ?? "Open linked conversation"} pending={pending} error={formError} edit={() => openDialog({ kind: "edit", task: selectedTask })} review={status => openDialog({ kind: "review", task: selectedTask, status })} archive={async () => {
        const saved = await mutate(() => conkerClient.tasks.archive(selectedTask.id, !selectedTask.archivedAt, selectedTask.revision), selectedTask.archivedAt ? "Preview task restored." : "Preview task archived; history retained.")
        setFormError(saved ? "" : useConkerStore.getState().error)
      }} />}
      {!selectedTask && selectedRun && <RunDetails run={selectedRun} runs={activity.runs} events={activity.events} tasks={data.tasks} />}
      {!selectedTask && !selectedRun && selectedEvent && <EventDetails event={selectedEvent} />}
    </DetailPanel>
    <Dialog open={creating || !!dialog} onOpenChange={open => { if (!open) closeDialog() }}><TaskDialogContent size="wide" title={creating ? "New task" : dialog?.kind === "edit" ? "Edit task" : dialog?.kind === "review" ? `Review status: ${taskLabels[dialog.status]}` : "Task"} description={creating ? "Describe the desired outcome. Creating a task does not start execution." : "Record your intent and review. Drafts are kept when you close this dialog."} showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }} onCloseAutoFocus={restoreFocus}>
      {(creating || dialog?.kind === "edit") && <TaskEditor key={creating ? `new:${initialSessionId ?? ""}:${initialAgentId ?? ""}` : `edit:${dialog?.task.id}`} task={!creating && dialog?.kind === "edit" ? dialog.task : undefined} initialSessionId={initialSessionId} initialAgentId={initialAgentId} agents={data.agents} sessions={data.sessions} tasks={data.tasks} runs={activity.runs} pending={pending} error={formError || (invalidPrefill ? "The supplied conversation or agent is unavailable. Choose valid references before saving." : "")} onCancel={closeDialog} onSave={async (input, revision) => {
        let savedId = ""
        const saved = await mutate(async () => { const task = creating ? await conkerClient.tasks.create(input) : await conkerClient.tasks.update(dialog!.task.id, input, revision!); savedId = task.id }, creating ? "Task created in preview. No execution started." : "Task updated in preview.")
        if (saved) { setDialog(null); setTaskFilter("active"); select("task", savedId) } else setFormError(useConkerStore.getState().error)
        return saved
      }} />}
      {!creating && dialog?.kind === "review" && <TaskStatusReview key={`${dialog.task.id}:${dialog.status}`} task={dialog.task} status={dialog.status} pending={pending} error={formError} onCancel={closeDialog} onSave={async (review, revision) => {
        const saved = await mutate(() => conkerClient.tasks.transition(dialog.task.id, dialog.status, review, revision), "Owner-reported task status saved in preview. Linked attempts are unchanged.")
        if (saved) { setDialog(null); setFormError("") } else setFormError(useConkerStore.getState().error)
        return saved
      }} />}
    </TaskDialogContent></Dialog>
  </BaseLayout>
}
