import type { ToolRun } from "../tool-workspace"
import { activityReceiptHref } from "../conversation-activity"
import type { ActivityEventRecord, ActivityOutput, ActivityProjectionInput, ActivityRunRecord, ActivityRunSource } from "./task-types"

const key = (...parts: string[]) => parts.map(encodeURIComponent).join(":")
/** Includes descendants so retaining a linked nested attempt also retains its root receipt. */
export function toolActivityRunIds(run: ToolRun, parentRunId?: string): string[] {
  const id = parentRunId ? key(parentRunId, "tool", run.toolId, run.id) : key("tool", run.toolId, run.id)
  return [id, ...run.steps.flatMap(step => step.child ? toolActivityRunIds(step.child, id) : [])]
}
const absoluteTime = (value?: string): string | null => value && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null
/** Source links never acquire authority or become executable URLs. */
export function safeActivityHref(value?: string): string | undefined {
  if (!value || value.includes("\\") || Array.from(value).some(char => char.charCodeAt(0) <= 32)) return undefined
  if (value.startsWith("/") && !value.startsWith("//")) return value
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

/** Read-only projection of supplied public records; never generates reasoning or execution. */
export function projectActivity(input: ActivityProjectionInput): { runs: ActivityRunRecord[]; events: ActivityEventRecord[] } {
  const runs: ActivityRunRecord[] = [], events: ActivityEventRecord[] = []
  const seenRuns = new Set<string>(), seenEvents = new Set<string>()
  const addEvent = (event: ActivityEventRecord) => { if (!seenEvents.has(event.id)) { seenEvents.add(event.id); events.push(event) } }
  for (const session of input.sessions) {
    for (const message of input.conversations[session.id]?.messages ?? []) {
      const run = message.activity
      if (!run || message.redacted) continue
      const id = key("conversation", session.id, run.id)
      if (seenRuns.has(id)) continue
      seenRuns.add(id)
      const source: ActivityRunSource = { kind: "conversation", sessionId: session.id, messageId: message.id, runId: run.id, href: `/chat/${encodeURIComponent(session.id)}#${encodeURIComponent(message.id)}` }
      const outputs: ActivityOutput[] = []
      const provenance = input.fixture && run.provenance === "recorded" ? "sample" : run.provenance
      // Phase, plan, commentary and summary are presentation, not action evidence.
      const publicSteps = run.steps.filter(step => ["tool", "receipt", "handoff"].includes(step.kind))
      const stepIds = new Set(publicSteps.map(step => step.id))
      for (const step of publicSteps) {
        const receipt: ActivityOutput | undefined = step.receipt ? { id: step.receipt.id, label: step.receipt.label, kind: step.receipt.kind, href: run.provenance === "preview" ? activityReceiptHref(step.receipt.href) : safeActivityHref(step.receipt.href) } : undefined
        if (receipt) outputs.push(receipt)
        addEvent({
          id: key(id, step.id), kind: step.kind as "tool" | "receipt" | "handoff", label: step.label,
          detail: step.detail ?? step.failure?.message ?? "", actor: step.agentName,
          provenance, source, runId: id, status: step.status,
          occurredAt: absoluteTime(step.endedAt ?? step.startedAt), receipt,
          ...(step.parentId && stepIds.has(step.parentId) ? { parentEventId: key(id, step.parentId) } : {}),
        })
      }
      runs.push({ id, label: run.label || session.title, status: run.status === "complete" ? "completed" : run.status, provenance, source, startedAt: absoluteTime(run.startedAt), endedAt: absoluteTime(run.endedAt), outputs })
    }
  }
  for (const job of input.jobs) for (const run of job.history) {
    const id = key("job", job.id, run.id)
    if (seenRuns.has(id)) continue
    seenRuns.add(id)
    const source: ActivityRunSource = { kind: "job", jobId: job.id, runId: run.id, href: `/jobs?job=${encodeURIComponent(job.id)}&run=${encodeURIComponent(run.id)}` }
    runs.push({ id, label: job.name, status: run.status === "Completed" ? "completed" : "failed", provenance: run.source, source, startedAt: absoluteTime(run.startedAt), endedAt: null, outputs: [] })
    addEvent({ id: key(id, "receipt"), kind: "receipt", label: `${job.name}: ${run.status}`, detail: run.summary, provenance: run.source, source, runId: id, occurredAt: null, status: run.status })
  }
  function toolRun(run: ToolRun, label: string, parentRunId?: string) {
    const id = parentRunId ? key(parentRunId, "tool", run.toolId, run.id) : key("tool", run.toolId, run.id)
    if (seenRuns.has(id)) return
    seenRuns.add(id)
    const source: ActivityRunSource = { kind: "tool", toolId: run.toolId, runId: run.id, version: run.version, href: `/tools?tool=${encodeURIComponent(run.toolId)}` }
    const outputs: ActivityOutput[] = run.output !== undefined ? [{ id: key(id, "output"), label: "Preview output", kind: "value", value: structuredClone(run.output) }] : []
    runs.push({ id, label, status: run.status, provenance: "preview", source, parentRunId, startedAt: absoluteTime(run.startedAt), endedAt: absoluteTime(run.finishedAt), outputs })
    for (const step of run.steps) {
      if (step.status === "skipped") continue
      addEvent({ id: key(id, step.nodeId), kind: "receipt", label: step.label, detail: step.error ?? "Local preview step; no external execution.", provenance: "preview", source, runId: id, occurredAt: null, status: step.status,
        receipt: step.output !== undefined ? { id: key(id, step.nodeId, "output"), label: step.label, kind: "value", value: structuredClone(step.output) } : undefined })
      if (step.child) toolRun(step.child, step.label, id)
    }
  }
  for (const tool of input.tools ?? []) for (const run of tool.runs) toolRun(run, tool.draft.name)
  for (const entry of input.entries) addEvent({
    id: key("journal", entry.id), kind: "journal", label: entry.event, detail: entry.detail, actor: entry.actor,
    provenance: input.journalProvenance, source: { kind: "journal", entryId: entry.id, href: safeActivityHref(entry.source) },
    occurredAt: absoluteTime(entry.time), displayTime: entry.time,
  })
  for (const task of input.tasks ?? []) for (const change of task.changes) addEvent({
    id: key("task", task.id, change.id), kind: "task_change", label: `Task ${change.kind}`, detail: change.note, actor: "Owner",
    provenance: "preview", source: { kind: "task", taskId: task.id, changeId: change.id }, occurredAt: absoluteTime(change.at), status: change.to,
  })
  // Known absolute timestamps sort first. Unknown source order remains stable.
  const byTime = (a: string | null, b: string | null) => a && b ? Date.parse(b) - Date.parse(a) : a ? -1 : b ? 1 : 0
  runs.sort((a, b) => byTime(a.startedAt, b.startedAt))
  events.sort((a, b) => byTime(a.occurredAt, b.occurredAt))
  return structuredClone({ runs, events })
}
