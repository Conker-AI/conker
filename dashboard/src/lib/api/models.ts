export type Agent = {
  id: string
  name: string
  role: string
  kind: "companion" | "agent"
  model: string
  grants: number
  cost: string
  status: "active" | "idle"
  /** Authored configuration only. Tool selection never grants execution authority. */
  configuration?: AgentInput
  version?: number
  archivedAt?: string
  /** Retained solely to resolve older evidence that stored a display name. */
  historicalNames?: string[]
}

export type AgentInput = {
  name: string
  role: string
  instructions: string
  modelId: string | null
  toolIds: string[]
  memory: { scope: "none" | "conversation" | "selected"; memoryIds: string[] }
}


export type Session = {
  id: string
  title: string
  agent: string
  agentId?: string
  /** Empty conversations stay out of history until their first message. */
  isDraft?: boolean
  subtitle: string
  updated: string
  minutesAgo: number
  pinned: boolean
  archived?: boolean
  mode: "companion" | "plan" | "receipt" | "quiet" | "reading" | "project"
}

export type TicketStatus =
  | "Needs you"
  | "Approved once"
  | "Denied"
  | "Consumed"
  | "Expired"
  | "Accepted"
  | "Dismissed"

export type Ticket = {
  id: string
  effect: "External" | "Deletion" | "Proposal"
  request: string
  agent: string
  service: string
  tool: string
  version: string
  decideBy: string
  spendWindow: string
  status: TicketStatus
  asked: string
  wants: string
  source: string
  args: { label: string; value: string }[]
  delta: string
  grant: string
  record: string
}


export type JobTiming = { kind: "daily" | "weekly" | "interval"; time: string; day: number; hours: number }
export type JobInput = { name: string; instructions: string; agentId: string; timing: JobTiming; timeZone: string; enabled: boolean }
export type JobRun = { id: string; startedAt: string; status: "Completed" | "Failed"; source: "sample" | "preview"; summary: string }

export type Job = Omit<JobInput, "enabled"> & {
  id: string
  name: string
  purpose: string
  schedule: string
  lastRun: string
  nextRun: string
  status: "Scheduled" | "Paused"
  runs: number
  history: JobRun[]
}

export type JournalEntry = {
  id: string
  time: string
  actor: string
  event: string
  detail: string
  source: string
}

export type Memory = {
  id: string
  title?: string
  tags?: string[]
  origin?: "manual"
  originalText?: string
  updatedAt?: string
  text: string
  category: string
  confidence: string
  age: string
  provenance: string
  source: string
  language?: string
}

export type MemoryInput = { title: string; text: string; category: string; tags: string[] }

export type Service = {
  name: string
  purpose: string
  version: string
  status: "Live" | "Degraded"
  evidence: string
}

export type Tool = {
  id: string
  /** Current eligible preview publication, not an execution grant or version pin. */
  publishedVersion?: number
  name: string
  purpose: string
  sensitivity: "Observe" | "Prepare" | "Write" | "Act locally" | "Act outward"
  scope: string
  recentUse: string
}

export type DirectoryEntry = {
  name: string
  path: string
} & (
  | { kind: "directory"; children: DirectoryEntry[] }
  | { kind: "file" }
)

export type TerminalSnapshot = {
  prompt: string
  context: [string, string][]
}

export type FilesSnapshot = { source: "sample" | "live"; root: DirectoryEntry }
