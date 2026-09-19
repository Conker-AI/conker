import type { ActivityPhase, ActivityStep, ConversationRun } from "./api/conversation-types"

const terminal = (status: string) => status === "complete" || status === "stopped" || status === "failed"

/** Snapshot boundary: ids are stable, revisions are monotonic, terminal evidence is immutable. */
export function mergeActivityRun(previous: ConversationRun | undefined, incoming: ConversationRun): ConversationRun {
  if (previous?.id === incoming.id && (terminal(previous.status) || (previous.sequence !== undefined && (incoming.sequence === undefined || incoming.sequence <= previous.sequence)))) return structuredClone(previous)
  const current = previous?.id === incoming.id ? previous : undefined
  const steps = new Map<string, ActivityStep>()
  for (const step of current?.steps || []) steps.set(step.id, structuredClone(step))
  for (const update of incoming.steps) {
    const old = steps.get(update.id)
    if (old && (terminal(old.status) || (old.sequence !== undefined && (update.sequence === undefined || update.sequence <= old.sequence)))) continue
    steps.set(update.id, structuredClone({ ...old, ...update }))
  }
  const result = structuredClone({ ...current, ...incoming, steps: [...steps.values()] })
  // A parent ending does not establish that unfinished child work succeeded.
  for (const step of result.steps) {
    let parent = step.parentId ? steps.get(step.parentId) : undefined
    const visited = new Set([step.id])
    while (parent && !terminal(parent.status) && parent.parentId && !visited.has(parent.id)) {
      visited.add(parent.id)
      parent = steps.get(parent.parentId)
    }
    // Handoff is an event, not the lifecycle owner of the receiving agent.
    if (parent?.kind === "handoff") parent = undefined
    if (!terminal(step.status) && (terminal(result.status) || (parent && terminal(parent.status)))) {
      step.status = "stopped"
      step.endedAt = step.endedAt || parent?.endedAt || result.endedAt
    }
    if (step.plan) step.plan = step.plan.map(item => terminal(step.status) && (item.status === "running" || item.status === "pending") ? { ...item, status: "stopped" as const } : item)
  }
  return result
}

export function activityDuration(start?: string, end?: string | number) {
  if (!start || end === undefined) return ""
  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000))
  if (!Number.isFinite(seconds)) return ""
  return seconds === 0 ? "<1s" : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function activityPresentation(phase: ActivityPhase, status: ConversationRun["status"] = "running") {
  const state = status === "complete" ? "complete" : status !== "running" ? "idle" : phase === "waiting" ? "waiting" : "working"
  const label = status === "complete" ? "Complete" : status === "stopped" ? "Stopped" : status === "failed" ? "Failed" : { thinking: "Thinking", streaming: "Writing", searching: "Searching", reading: "Reading", tool: "Running tool", agent: "Agent working", waiting: "Waiting for you" }[phase]
  return { state, label, activity: state === "working" ? "thinking" as const : "idle" as const, animate: state === "working" }
}

/** Defense in depth for public receipts, not a substitute for transport sanitization. */
export function formatActivityRecord(record: Record<string, unknown>, limit = 12000): string {
  const seen = new WeakSet<object>()
  let remaining = 240
  const clean = (value: unknown, depth: number): unknown => {
    if (--remaining < 0) return "[Further entries omitted]"
    if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}… [truncated]` : value
    if (value === null || typeof value !== "object") return typeof value === "bigint" ? String(value) : value
    if (seen.has(value)) return "[Circular reference]"
    if (depth > 5) return "[Nested data omitted]"
    seen.add(value)
    if (Array.isArray(value)) return [...value.slice(0, 40).map(item => clean(item, depth + 1)), ...(value.length > 40 ? [`[${value.length - 40} more items omitted]`] : [])]
    const entries = Object.entries(value)
    const output = Object.fromEntries(entries.slice(0, 40).map(([key, item]) => [key, /token|secret|password|authorization|cookie|api.?key|credential/i.test(key) ? "[Redacted]" : clean(item, depth + 1)]))
    if (entries.length > 40) output["…"] = `${entries.length - 40} more fields omitted`
    return output
  }
  const output = JSON.stringify(clean(record, 0), null, 2)
  return output.length > limit ? `${output.slice(0, limit)}\n[Receipt truncated for display]` : output
}

export function activitySourceHref(href?: string) {
  if (!href || href.includes("\\") || Array.from(href).some(char => char.charCodeAt(0) <= 32)) return undefined
  if (href.startsWith("/") && !href.startsWith("//")) return href
  try { const url = new URL(href); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? href : undefined } catch { return undefined }
}

/** Only bundled, reviewed fixture downloads can be offered by this preview. */
export function activityReceiptHref(href?: string) {
  return href === "/fixtures/activity/notes.txt" || href === "/fixtures/activity/notes.diff" ? href : undefined
}

export function groupActivitySteps(steps: ActivityStep[]) {
  const groups: ActivityStep[][] = []
  for (const step of steps) {
    const last = groups.at(-1)
    const first = last?.[0]
    if (first && terminal(step.status) && step.status === first.status && step.kind === first.kind && step.label === first.label && step.parentId === first.parentId) last!.push(step)
    else groups.push([step])
  }
  return groups
}
