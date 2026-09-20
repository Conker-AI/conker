import type { ConversationState } from "./conversation-types"
import type { Agent, Job, JournalEntry, Session } from "./models"
import type { JsonValue, WorkspaceRecord } from "../tool-workspace"

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
export type TaskReview = { note: string; completedCriterionIds?: string[] }
export interface TaskClient {
  readonly mode: "preview"
  list(): Promise<TaskRecord[]>
  create(input: TaskInput): Promise<TaskRecord>
  update(id: string, input: TaskInput, revision: number): Promise<TaskRecord>
  transition(id: string, status: TaskStatus, review: TaskReview, revision: number): Promise<TaskRecord>
  cancel(id: string, note: string, revision: number): Promise<TaskRecord>
  archive(id: string, archived: boolean, revision: number): Promise<TaskRecord>
}

export type ActivityProvenance = "sample" | "preview" | "recorded" | "live"
export type ActivityRunSource =
  | { kind: "conversation"; sessionId: string; messageId: string; runId: string; href: string }
  | { kind: "job"; jobId: string; runId: string; href: string }
  | { kind: "tool"; toolId: string; runId: string; version: number | "draft"; href: string }
export type ActivityEventSource = ActivityRunSource
  | { kind: "journal"; entryId: string; href?: string }
  | { kind: "task"; taskId: string; changeId: string }
export type ActivityOutput = { id: string; label: string; href?: string; kind: "file" | "diff" | "value"; value?: JsonValue }
export type ActivityRunRecord = {
  id: string
  label: string
  status: "running" | "completed" | "stopped" | "failed"
  provenance: ActivityProvenance
  source: ActivityRunSource
  parentRunId?: string
  /** Null means the source supplied no trustworthy absolute time. */
  startedAt: string | null
  endedAt: string | null
  outputs: ActivityOutput[]
}
export type ActivityEventRecord = {
  id: string
  kind: "journal" | "receipt" | "tool" | "handoff" | "task_change"
  label: string
  detail: string
  actor?: string
  provenance: ActivityProvenance
  source: ActivityEventSource
  runId?: string
  parentEventId?: string
  occurredAt: string | null
  /** Preserve relative fixture times without inventing an absolute timestamp. */
  displayTime?: string
  status?: string
  receipt?: ActivityOutput
}
export type ActivityProjectionInput = {
  /** Bundled recorded examples are samples, not live source evidence. */
  fixture?: boolean
  sessions: Pick<Session, "id" | "title">[]
  conversations: Record<string, ConversationState>
  jobs: Job[]
  tools?: WorkspaceRecord[]
  entries: JournalEntry[]
  /** Existing journal fixtures have no embedded provenance; callers must supply it. */
  journalProvenance: ActivityProvenance
  tasks?: TaskRecord[]
}
export type TaskPreviewState = {
  tasks: TaskRecord[]
  sessions: Pick<Session, "id" | "archived">[]
  agents: Pick<Agent, "id" | "archivedAt">[]
  /** The integration supplies the current projection when linking attempts. */
  runs?: Pick<ActivityRunRecord, "id">[]
}
