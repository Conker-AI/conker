import { z } from "zod"
import type { TaskClient, TaskInput, TaskPreviewState, TaskRecord, TaskReview, TaskStatus } from "./task-types"

const text = (max: number) => z.string().trim().min(1).max(max)
const inputSchema = z.object({
  outcome: text(1000), criteria: z.array(text(500)).min(1).max(20),
  sessionId: text(200), agentId: text(200), parentTaskId: text(200).nullable().optional(),
  runIds: z.array(text(500)).max(100).optional(),
}).strict()
const reviewSchema = z.object({ note: text(2000), completedCriterionIds: z.array(text(200)).max(20).optional() }).strict()
const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  planned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["planned", "in_progress", "cancelled"],
  completed: ["planned"],
  cancelled: ["planned"],
}
const terminal = (task: TaskRecord) => task.status === "completed" || task.status === "cancelled"

/** Owner-authored, memory-only tracking. This service never dispatches or stops work. */
export function createTaskPreviewClient(options: {
  getSnapshot: () => TaskPreviewState
  /** Synchronous commit: update the fixture snapshot and notify its subscribers here. */
  setTasks: (tasks: TaskRecord[]) => void
  now?: () => string
  newId?: () => string
}): TaskClient {
  const now = options.now ?? (() => new Date().toISOString())
  const newId = options.newId ?? (() => crypto.randomUUID())
  const snapshot = () => structuredClone(options.getSnapshot())
  function normalize(input: TaskInput, state: TaskPreviewState, id?: string) {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) throw new Error("Provide an outcome, 1–20 completion criteria, and valid conversation/agent links. Fields exceed their limits or are unsupported.")
    const value = parsed.data
    if (new Set(value.criteria.map(item => item.toLocaleLowerCase())).size !== value.criteria.length) throw new Error("Completion criteria must be distinct.")
    if (!state.sessions.some(session => session.id === value.sessionId && !session.archived)) throw new Error("Choose an existing, unarchived conversation.")
    if (!state.agents.some(agent => agent.id === value.agentId && !agent.archivedAt)) throw new Error("Choose an existing, unarchived agent.")
    const runIds = value.runIds ?? []
    if (new Set(runIds).size !== runIds.length || runIds.some(runId => !state.runs?.some(run => run.id === runId))) throw new Error("Link distinct existing runs; creating a task does not start one.")
    const parentTaskId = value.parentTaskId ?? null
    let ancestor = parentTaskId
    const visited = new Set(id ? [id] : [])
    while (ancestor) {
      if (visited.has(ancestor)) throw new Error("A task cannot be its own ancestor.")
      visited.add(ancestor)
      const parent = state.tasks.find(task => task.id === ancestor)
      if (!parent || parent.archivedAt || terminal(parent)) throw new Error("Choose an existing, active parent task.")
      ancestor = parent.parentTaskId
    }
    return { ...value, parentTaskId, runIds }
  }
  function find(state: TaskPreviewState, id: string, revision: number) {
    const task = state.tasks.find(item => item.id === id)
    if (!task) throw new Error("Task not found.")
    if (!Number.isInteger(revision) || task.revision !== revision) throw new Error("This task changed. Reload it before saving.")
    return task
  }
  function editable(task: TaskRecord) {
    if (task.archivedAt) throw new Error("Restore the task before changing it.")
  }
  function save(state: TaskPreviewState, task: TaskRecord, kind: TaskRecord["changes"][number]["kind"], note: string, from?: TaskStatus) {
    const at = now()
    task.updatedAt = at
    task.revision++
    task.changes.push({ id: newId(), at, kind, note, ...(from ? { from, to: task.status } : {}) })
    options.setTasks(structuredClone(state.tasks))
    return structuredClone(task)
  }
  function noActiveChildren(state: TaskPreviewState, id: string) {
    if (state.tasks.some(task => task.parentTaskId === id && !terminal(task))) throw new Error("Resolve active child tasks first.")
  }
  const client: TaskClient = {
    mode: "preview",
    async list() { return snapshot().tasks },
    async create(input) {
      const state = snapshot(), value = normalize(input, state), at = now()
      const id = `task_${newId()}`
      if (state.tasks.some(task => task.id === id)) throw new Error("Task identity collision. Retry creation.")
      const task: TaskRecord = {
        ...value, id, criteria: value.criteria.map(label => ({ id: newId(), text: label })),
        status: "planned", statusSource: "owner", provenance: "preview", revision: 1,
        createdAt: at, updatedAt: at, archivedAt: null, statusNote: "", completedCriterionIds: [],
        changes: [{ id: newId(), at, kind: "created", note: "Owner created a preview task. No execution was started." }],
      }
      state.tasks.push(task)
      options.setTasks(structuredClone(state.tasks))
      return structuredClone(task)
    },
    async update(id, input, revision) {
      const state = snapshot(), task = find(state, id, revision)
      editable(task)
      if (terminal(task)) throw new Error("Reopen the task before revising its outcome or criteria.")
      const value = normalize(input, state, id)
      const criteria = value.criteria.map(label => task.criteria.find(item => item.text === label) ?? { id: newId(), text: label })
      Object.assign(task, value, { criteria, completedCriterionIds: [] })
      return save(state, task, "updated", "Owner updated the preview task; linked runs remain source records.")
    },
    async transition(id, status, review: TaskReview, revision) {
      const state = snapshot(), task = find(state, id, revision)
      editable(task)
      if (!transitions[task.status].includes(status)) throw new Error(`Cannot change ${task.status} to ${status}. Reopen terminal tasks to Planned first.`)
      const checked = reviewSchema.safeParse(review)
      if (!checked.success) throw new Error("Explain this status change in 1–2,000 characters.")
      const criteria = checked.data.completedCriterionIds ?? []
      if (status === "completed") {
        if (new Set(criteria).size !== task.criteria.length || criteria.length !== task.criteria.length || task.criteria.some(item => !criteria.includes(item.id))) throw new Error("Review every current completion criterion before marking the task complete.")
      } else if (criteria.length) throw new Error("Criterion review belongs to an explicit completion decision.")
      if (status === "completed" || status === "cancelled") noActiveChildren(state, id)
      if (!terminal({ ...task, status }) && task.parentTaskId) {
        const parent = state.tasks.find(item => item.id === task.parentTaskId)
        if (!parent || parent.archivedAt || terminal(parent)) throw new Error("Reopen the parent task first.")
      }
      const from = task.status
      task.status = status
      task.statusNote = checked.data.note
      task.completedCriterionIds = criteria
      return save(state, task, "status", checked.data.note, from)
    },
    async cancel(id, note, revision) { return client.transition(id, "cancelled", { note }, revision) },
    async archive(id, archived, revision) {
      const state = snapshot(), task = find(state, id, revision)
      if (typeof archived !== "boolean") throw new Error("Specify whether to archive or restore the task.")
      if (Boolean(task.archivedAt) === archived) return structuredClone(task)
      if (archived) {
        if (!terminal(task)) throw new Error("Complete or cancel the task before archiving it.")
        noActiveChildren(state, id)
      }
      task.archivedAt = archived ? now() : null
      return save(state, task, archived ? "archived" : "restored", `Owner ${archived ? "archived" : "restored"} the preview task. History is retained.`)
    },
  }
  return client
}
