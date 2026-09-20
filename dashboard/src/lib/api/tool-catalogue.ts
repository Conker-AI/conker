import type { WorkspaceRecord } from "../tool-workspace"
import type { Tool } from "./models"

/** Requested capabilities only. Publication and visibility confer no runtime authority. */
export function projectToolCatalogue(records: WorkspaceRecord[]): Tool[] {
  return records.flatMap(record => {
    const published = record.published.at(-1)
    if (!published?.definition.agentVisible) return []
    const definition = published.definition
    return [{ id: record.id, name: definition.name,
      purpose: `Published preview v${published.version}. ${definition.description}`.trim(),
      sensitivity: definition.effect === "read" ? "Observe" : definition.effect === "prepare" ? "Prepare" : "Write",
      scope: "Requested configuration only · no execution authority",
      recentUse: "No live usage recorded", publishedVersion: published.version,
    } satisfies Tool]
  })
}
