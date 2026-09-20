import type { Snapshot } from "./client"
import type { ArtifactPreviewState, ArtifactRecord } from "./artifact-types"

/** Internal resolver input. Raw records are supplied explicitly, never taken from UI views. */
export function artifactPreviewState(snapshot: Pick<Snapshot, "sessions" | "conversations" | "tasks">, records: ArtifactRecord[]): ArtifactPreviewState {
  return {
    artifacts: records,
    sessions: snapshot.sessions.map(session => ({ id: session.id, archived: session.archived,
      privacy: snapshot.conversations[session.id]?.privacy, incognito: snapshot.conversations[session.id]?.incognito,
    })),
    messages: snapshot.sessions.flatMap(session => (snapshot.conversations[session.id]?.messages ?? []).map(message => ({
      sessionId: session.id, id: message.id, role: message.role, text: message.text, status: message.status, redacted: message.redacted, citations: message.citations,
    }))),
    tasks: snapshot.tasks.map(task => ({ id: task.id, sessionId: task.sessionId, archivedAt: task.archivedAt })),
  }
}
