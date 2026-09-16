import { useRef, useState } from "react"
import { Briefcase, Plus } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { CollectionEmpty, CollectionSearch, TaskDialogContent, DetailPanel, ConfirmationDialog } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog } from "@/components/ui/dialog"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import type { JobInput } from "@/lib/api/models"
import { JobsTable } from "./job-table"
import { type JobControls } from "./row-actions"
import { JobEditor } from "./job-editor"
import { JobDetails } from "./job-details"

type Panel = { mode: "create" | "view" | "edit" | "delete"; id?: string; returnToDetails?: boolean }

export default function JobsPage() {
  const jobs = useConker(data => data.jobs)
  const agents = useConker(data => data.agents)
  const { mutate, pending, error } = useConkerStore()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [panel, setPanel] = useState<Panel | null>(null)
  const [feedback, setFeedback] = useState("")
  const [runningId, setRunningId] = useState("")
  const returnFocus = useRef<HTMLElement | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const selected = jobs.find(job => job.id === panel?.id)
  const agentName = (id: string) => agents.find(agent => agent.id === id)?.name ?? "Unknown agent"
  const openPanel = (next: Panel) => {
    if (!panel) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPanel({ ...next, returnToDetails: panel?.mode === "view" })
  }
  const closeForm = () => setPanel(panel?.returnToDetails ? { mode: "view", id: panel.id } : null)
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const target = returnFocus.current
      ;(target?.isConnected ? target : newButton.current)?.focus()
    })
  }
  const clearFilters = () => { setQuery(""); setFilter("all") }
  const filtered = jobs.filter(job => {
    const matches = `${job.name} ${job.purpose} ${job.instructions} ${agentName(job.agentId)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    return matches && (filter === "all" || filter === "failed" && job.history[0]?.status === "Failed" || job.status === filter)
  })
  const controls: JobControls = {
    pending, runningId,
    open: job => openPanel({ mode: "view", id: job.id }),
    edit: job => openPanel({ mode: "edit", id: job.id }),
    remove: job => openPanel({ mode: "delete", id: job.id }),
    toggle: async job => {
      if (await mutate(() => conkerClient.updateJob(job.id, "toggle"))) setFeedback(`${job.name}: schedule ${job.status === "Paused" ? "enabled" : "paused"} in this preview.`)
    },
    run: async job => {
      if (pending) return
      setRunningId(job.id)
      setFeedback(`Simulating ${job.name}…`)
      const ok = await mutate(() => conkerClient.updateJob(job.id, "run"))
      setRunningId("")
      setFeedback(ok ? `${job.name}: preview complete. No server action was performed.` : "Preview run failed. Try again.")
    },
    duplicate: async job => {
      let id = ""
      if (await mutate(async () => { id = (await conkerClient.duplicateJob(job.id)).id })) {
        clearFilters(); openPanel({ mode: "view", id }); setFeedback("Copy created and paused. Edit it before enabling its schedule.")
      }
    },
  }
  const save = async (input: JobInput) => {
    let id = ""
    const creating = panel?.mode === "create"
    const ok = await mutate(async () => {
      const job = creating ? await conkerClient.createJob(input) : await conkerClient.saveJob(selected!.id, input)
      id = job.id
    })
    if (ok) {
      if (creating) clearFilters()
      setPanel(panel?.returnToDetails ? { mode: "view", id } : null)
      setFeedback(creating ? "Job created in this preview." : "Job changes saved in this preview.")
    }
  }
  const filters = <>
    {(query || filter !== "all") && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>}
    <Select value={filter} onValueChange={setFilter}>
      <SelectTrigger size="sm" aria-label="Filter jobs" className="w-36"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">All jobs</SelectItem><SelectItem value="Scheduled">Scheduled</SelectItem><SelectItem value="Paused">Paused</SelectItem><SelectItem value="failed">Last run failed</SelectItem></SelectContent>
    </Select>
  </>

  return <BaseLayout title="Jobs" description="Create, schedule, and manage what your agents do for you."
    actions={<Button ref={newButton} onClick={() => openPanel({ mode: "create" })} disabled={pending}><Plus />New job</Button>}>
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="font-normal">Preview</Badge><span>Changes reset on reload. Runs are simulated.</span></div>
      <CollectionSearch label="Search jobs" placeholder="Search jobs, instructions, or agents…" value={query} onChange={event => setQuery(event.target.value)} />
      {!filtered.length ? <><div className="flex flex-wrap items-center gap-2">{filters}</div><CollectionEmpty icon={<Briefcase />} title={jobs.length ? "No jobs match" : "No jobs yet"} description={jobs.length ? "Try a different search or clear your filters." : "Create a job and choose what your agent should do and when."} onClear={jobs.length ? clearFilters : undefined} />{!jobs.length && <Button className="self-center" onClick={() => openPanel({ mode: "create" })}><Plus />Create your first job</Button>}</>
        : <JobsTable controls={controls} agentName={agentName} data={filtered} toolbarAction={filters} />}
      <p role="status" className="min-h-4 text-xs text-muted-foreground">{feedback || "Open a job for instructions and run history. Schedule times use each job’s time zone."}</p>
    </div>
    <DetailPanel open={panel?.mode === "view"} onOpenChange={open => { if (!open) setPanel(null) }} busy={pending}
      title={selected?.name ?? "Job details"} description="Configuration and run history · frontend preview" onCloseAutoFocus={restoreFocus}>
      {selected && <JobDetails job={selected} agentName={agentName(selected.agentId)} controls={controls} />}
    </DetailPanel>
    <Dialog open={panel?.mode === "create" || panel?.mode === "edit"} onOpenChange={open => { if (!open && !pending) closeForm() }}>
      <TaskDialogContent size="wide" title={panel?.mode === "edit" ? "Edit job" : "New job"} description="Choose the task, agent, and schedule." showCloseButton={!pending}
        onInteractOutside={event => event.preventDefault()} onCloseAutoFocus={restoreFocus}>
        {error && <p role="alert" className="px-5 pt-4 text-sm text-destructive">{error}</p>}
        {(panel?.mode === "create" || panel?.mode === "edit" && selected) && <JobEditor key={`${panel.mode}-${panel.id ?? "new"}`} job={panel.mode === "edit" ? selected : undefined} agents={agents} pending={pending} onSave={save} onCancel={closeForm} />}
      </TaskDialogContent>
    </Dialog>
    <ConfirmationDialog open={panel?.mode === "delete"} onOpenChange={open => { if (!open) closeForm() }} title="Delete job?"
      description="Remove this job and its run history from the preview. It will return when you reload the app."
      actionLabel="Delete job" pending={pending} error={error} onCloseAutoFocus={restoreFocus} onConfirm={async () => {
        if (selected && await mutate(() => conkerClient.deleteJob(selected.id))) { setPanel(null); setFeedback("Job removed from this preview.") }
      }}><p className="text-sm font-medium break-words">{selected?.name}</p></ConfirmationDialog>
  </BaseLayout>
}
