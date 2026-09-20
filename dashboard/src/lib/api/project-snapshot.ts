import type { Snapshot } from "./client"
import type { ProjectPreviewState } from "./project-types"

/** Reference metadata only; privacy comes from the canonical conversation, never a default. */
export function projectPreviewState(snapshot: Snapshot): ProjectPreviewState {
  return {
    projects: snapshot.projects,
    sessions: snapshot.sessions.map(session => ({
      id: session.id, title: session.title, archived: session.archived,
      privacy: snapshot.conversations[session.id]?.privacy,
      incognito: snapshot.conversations[session.id]?.incognito,
    })),
    tasks: snapshot.tasks.map(task => ({ id: task.id, outcome: task.outcome, sessionId: task.sessionId, archivedAt: task.archivedAt })),
    files: snapshot.sessions.flatMap(session => (snapshot.conversations[session.id]?.files ?? []).map(file => ({ id: file.id, name: file.name, sessionId: session.id }))),
  }
}
