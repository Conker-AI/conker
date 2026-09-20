import { useMemo } from "react"
import { conkerClient } from "@/lib/api"
import { projectPreviewState } from "@/lib/api/project-snapshot"
import { useConker } from "@/lib/api/store"
import ProjectsPage from "./page"
import ProjectEditorPage from "./edit-page"

function useProjectSnapshot() {
  const snapshot = useConker(data => data)
  return useMemo(() => projectPreviewState(snapshot), [snapshot])
}

export function ProjectsRoute() {
  const snapshot = useProjectSnapshot()
  return <ProjectsPage client={conkerClient.projects} snapshot={snapshot} />
}

export function ProjectEditorRoute() {
  const snapshot = useProjectSnapshot()
  return <ProjectEditorPage client={conkerClient.projects} snapshot={snapshot} />
}
