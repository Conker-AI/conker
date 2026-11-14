export type TaskStatus = "planned" | "in_progress" | "blocked" | "completed" | "cancelled"
export type TaskCriterion = { id: string; text: string }
export type TaskInput = {
  outcome: string
  criteria: string[]
  sessionId: string
  /** Assigned specialist may differ from the session owner; this never hands off the chat. */
  agentId: string
  parentTaskId?: string | null
  /** Explicitly linked attempts only; sharing a conversation does not imply ownership. */
  runIds?: string[]
}
export type TaskChange = {
  id: string
  at: string
  kind: "created" | "updated" | "status" | "archived" | "restored"
  note: string
  from?: TaskStatus
  to?: TaskStatus
}
export type TaskRecord = Omit<TaskInput, "criteria" | "parentTaskId" | "runIds"> & {
  id: string
  criteria: TaskCriterion[]
  parentTaskId: string | null
  runIds: string[]
  status: TaskStatus
  /** Status is an owner's report, never proof that an executor ran. */
  statusSource: "owner"
  provenance: "preview"
  revision: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  statusNote: string
  completedCriterionIds: string[]
  changes: TaskChange[]
}

