import { conkerClient } from "@/lib/api"
import { useConker } from "@/lib/api/store"
import ArtifactsPage from "./page"
import ArtifactDetailPage from "./detail-page"

export function ArtifactsRoute() {
  const data = useConker(snapshot => snapshot)
  return <ArtifactsPage client={conkerClient.artifacts} artifacts={data.artifacts} tasks={data.tasks} sessions={data.sessions} />
}
export function ArtifactDetailRoute() {
  const data = useConker(snapshot => snapshot)
  return <ArtifactDetailPage client={conkerClient.artifacts} artifacts={data.artifacts} tasks={data.tasks} sessions={data.sessions} />
}
