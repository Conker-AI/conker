import type { ArtifactClient, ArtifactContent, ArtifactView } from "@/lib/api/artifact-types"
export type ArtifactScreenProps = {
  client: ArtifactClient
  artifacts: ArtifactView[]
  tasks: { id: string; outcome: string; sessionId: string; archivedAt: string | null }[]
  sessions: { id: string; title: string; archived?: boolean }[]
}
export const artifactKindLabels: Record<ArtifactContent["kind"], string> = { markdown: "Document", code: "Code", table: "Table", chart: "Chart", diagram: "Diagram", media: "Media" }
export const availabilityLabels: Record<ArtifactView["availability"], string> = {
  available: "Available", "source-archived": "Source archived", "source-unavailable": "Source unavailable", "source-redacted": "Source redacted", "source-changed": "Source changed", "privacy-unknown": "Source privacy unavailable",
}
