import { create } from "zustand"

type Selection = { artifactId: string; version?: number }
type ArtifactWorkspace = {
  selections: Record<string, Selection | undefined>
  open: (sessionId: string, artifactId: string, version?: number) => void
  close: (sessionId: string) => void
}

/** Conversation and call views share selection. Closing a view never deletes output. */
export const useArtifactWorkspace = create<ArtifactWorkspace>(set => ({
  selections: {},
  open: (sessionId, artifactId, version) => set(state => ({ selections: { ...state.selections, [sessionId]: { artifactId, version } } })),
  close: sessionId => set(state => ({ selections: { ...state.selections, [sessionId]: undefined } })),
}))
