export type Agent = {
  id: string
  name: string
  role: string
  kind: "companion" | "agent"
  model: string
  grants: number
  cost: string
  status: "active" | "idle"
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


export type Job = {
  id: string
  name: string
  purpose: string
  schedule: string
  lastRun: string
  nextRun: string
  status: "Scheduled" | "Paused"
  runs: number
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
  text: string
  category: string
  confidence: string
  age: string
  provenance: string
  source: string
  language?: string
}

export type Service = {
  name: string
  purpose: string
  version: string
  status: "Live" | "Degraded"
  evidence: string
}

export type Tool = {
  id: string
  name: string
  purpose: string
  sensitivity: "Observe" | "Prepare" | "Act locally" | "Act outward"
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
