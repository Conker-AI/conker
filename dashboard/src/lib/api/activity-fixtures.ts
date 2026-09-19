import type { ActivityStep, ConversationRun } from "./conversation-types"
import { mergeActivityRun } from "../conversation-activity"

export const activityScenarios = [
  { id: "search-read", label: "Search, read and deliver" },
  { id: "tool-failure", label: "Tool failure" },
  { id: "approval-wait", label: "Wait for Inbox decision" },
  { id: "delegation", label: "Named agents and handoff" },
  { id: "stopped-children", label: "Stop parent and children" },
  { id: "unavailable-summary", label: "Unavailable public summary" },
  { id: "large-receipt", label: "Grouped steps and large receipt" },
] as const
export type ActivityScenarioName = typeof activityScenarios[number]["id"]
export function isActivityScenarioName(value: string): value is ActivityScenarioName { return activityScenarios.some(item => item.id === value) }

/** Explicit test scenarios only. Nothing here invokes a tool, agent, search or external service. */
export function createActivityScenario(name: ActivityScenarioName): ConversationRun[] {
  const time = (seconds: number) => new Date(Date.UTC(2026, 8, 19, 9, 0, seconds)).toISOString()
  const snapshots: ConversationRun[] = []
  let current: ConversationRun = { id: `preview-${name}`, sequence: 0, status: "running", phase: "thinking", label: "Preparing fixture", provenance: "preview", startedAt: time(0), steps: [] }
  const emit = (seconds: number, phase: ConversationRun["phase"], label: string, updates: ActivityStep[], status: ConversationRun["status"] = "running") => {
    current = mergeActivityRun(current, { ...current, sequence: snapshots.length + 1, status, phase, label, endedAt: status !== "running" ? time(seconds) : undefined, steps: updates.map(step => ({ ...step, sequence: snapshots.length + 1 })) })
    snapshots.push(structuredClone(current))
  }
  const step = (id: string, kind: ActivityStep["kind"], label: string, status: ActivityStep["status"], seconds: number, extra: Partial<ActivityStep> = {}): ActivityStep => ({ id, kind, label, status, startedAt: time(seconds), ...extra })
  if (name === "search-read") {
    emit(0, "searching", "Searching supplied fixture", [step("search", "tool", "Search fixture notes", "running", 0, { toolName: "fixture.search", record: { input: { query: "reading plan", collection: "bundled fixture" } } })])
    emit(2, "reading", "Reading supplied result", [step("search", "tool", "Search fixture notes", "complete", 0, { endedAt: time(2), record: { input: { query: "reading plan" }, result: { matches: ["notes.txt"] } } }), step("read", "tool", "Read fixture notes", "running", 2, { toolName: "fixture.read", source: { id: "fixture-notes", label: "Bundled notes", href: "/fixtures/activity/notes.txt" } })])
    emit(4, "thinking", "Reviewing the supplied checklist", [step("read", "tool", "Read fixture notes", "complete", 2, { endedAt: time(4), detail: "Read the bundled local example, not the user's files." }), step("comment", "commentary", "Public progress update", "complete", 4, { detail: "The example has one reading block; preparing its checklist receipt.", endedAt: time(4) }), step("plan", "plan", "Reading checklist", "running", 4, { plan: [{ id: "review", label: "Review supplied notes", status: "complete" }, { id: "receipt", label: "Prepare the supplied receipt", status: "running" }] })])
    emit(6, "streaming", "Fixture complete", [step("plan", "plan", "Reading checklist", "complete", 4, { endedAt: time(6), plan: [{ id: "review", label: "Review supplied notes", status: "complete" }, { id: "receipt", label: "Prepare the supplied receipt", status: "complete" }] }), step("summary", "summary", "Public reasoning summary", "complete", 6, { summaryAvailability: "available", detail: "The supplied note requests a short reading block. The checklist keeps that single request and adds no other tasks.", endedAt: time(6) }), step("receipt", "receipt", "Supplied changed-file receipt", "complete", 6, { receipt: { id: "notes-diff", label: "notes.diff", kind: "diff", href: "/fixtures/activity/notes.diff", added: 1, removed: 1 }, endedAt: time(6) })], "complete")
  } else if (name === "tool-failure") {
    emit(0, "tool", "Running fixture tool", [step("tool", "tool", "Read unavailable fixture", "running", 0, { toolName: "fixture.read", record: { input: { path: "missing-example.txt" } } })])
    emit(2, "tool", "Fixture tool failed", [step("tool", "tool", "Read unavailable fixture", "failed", 0, { endedAt: time(2), failure: { message: "The supplied fixture file does not exist.", recovery: "Choose Search, read and deliver to inspect the available bundled notes. No real read was attempted." }, record: { result: { code: "FIXTURE_NOT_FOUND" } } })], "failed")
  } else if (name === "approval-wait") {
    emit(0, "waiting", "Waiting for Inbox decision", [step("approval", "tool", "Review the recorded request", "waiting", 0, { approvalId: "coach", detail: "This example links to the existing coach request in Inbox. No message has been sent, and this fixture does not resume automatically." })])
  } else if (name === "delegation" || name === "stopped-children") {
    emit(0, "agent", "Researcher is reviewing the fixture", [step("researcher", "agent", "Review the supplied note", "running", 0, { agentId: "fixture-researcher", agentName: "Researcher", detail: "Preview subagent assigned to the bundled note only." }), step("child-read", "tool", "Read fixture notes", "running", 0, { parentId: "researcher", toolName: "fixture.read" })])
    if (name === "stopped-children") emit(2, "agent", "Preview stopped", [], "stopped")
    else {
      emit(2, "agent", "Editor is checking the receipt", [step("researcher", "agent", "Review the supplied note", "complete", 0, { agentId: "fixture-researcher", agentName: "Researcher", endedAt: time(2) }), step("child-read", "tool", "Read fixture notes", "complete", 0, { parentId: "researcher", endedAt: time(2), source: { id: "fixture-notes", label: "Bundled notes", href: "/fixtures/activity/notes.txt" } }), step("handoff", "handoff", "Handed the supplied result to Editor", "complete", 2, { parentId: "researcher", agentId: "fixture-researcher", agentName: "Researcher", handoffTo: { id: "fixture-editor", name: "Editor" }, endedAt: time(2) }), step("editor", "agent", "Check the supplied receipt", "running", 2, { agentId: "fixture-editor", agentName: "Editor", parentId: "handoff" })])
      emit(4, "streaming", "Fixture review complete", [step("editor", "agent", "Check the supplied receipt", "complete", 2, { agentId: "fixture-editor", agentName: "Editor", endedAt: time(4) }), step("deliverable", "receipt", "Bundled reading note", "complete", 4, { endedAt: time(4), receipt: { id: "notes", kind: "file", label: "notes.txt", href: "/fixtures/activity/notes.txt" } })], "complete")
    }
  } else if (name === "unavailable-summary") {
    emit(0, "thinking", "Preparing fixture", [step("prepare", "phase", "Prepare sample answer", "running", 0)])
    emit(2, "streaming", "Fixture complete", [step("prepare", "phase", "Prepare sample answer", "complete", 0, { endedAt: time(2) }), step("summary", "summary", "Public reasoning summary", "complete", 2, { summaryAvailability: "unavailable", endedAt: time(2) })], "complete")
  } else {
    emit(0, "reading", "Reading supplied batch", [step("batch", "phase", "Review fixture batch", "running", 0)])
    emit(5, "streaming", "Fixture batch complete", [step("batch", "phase", "Review fixture batch", "complete", 0, { endedAt: time(5) }), ...Array.from({ length: 100 }, (_, index) => step(`read-${index}`, "tool", "Read fixture record", "complete", 1, { endedAt: time(4), toolName: "fixture.read", record: { row: index + 1, text: "Sample data only. ".repeat(300) } })), step("missing", "receipt", "Result not supplied", "complete", 5, { receipt: { id: "absent", kind: "file", label: "Unavailable result" }, endedAt: time(5) })], "complete")
  }
  return snapshots
}
