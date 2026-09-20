import type { ArtifactContent } from "@/lib/api/artifact-types"
import { normalizeArtifactContent } from "@/lib/api/artifact-preview"

export function artifactSource(content: ArtifactContent) {
  return content.kind === "markdown" || content.kind === "code" ? content.text : JSON.stringify(content, null, 2)
}

/** Parse data only, then apply the same limits as persisted versions. */
export function parseArtifactSource(kind: ArtifactContent["kind"], source: string, language = ""): ArtifactContent {
  if (source.length > 250_000) throw new Error("Source must fit within 250,000 characters.")
  if (kind === "markdown" || kind === "code") return normalizeArtifactContent({ kind, text: source, ...(kind === "code" ? { language } : {}) })
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new Error("Use valid JSON for the structured artifact data.") }
  const content = normalizeArtifactContent(value)
  if (content.kind !== kind) throw new Error(`Keep this artifact's ${kind} format.`)
  return content
}

/** Fences cannot be closed by the supplied code; RichAnswer renders it as inert text. */
export function fencedArtifactCode(text: string, language: string) {
  const runs = text.match(/`+/g) ?? []
  const length = runs.reduce((longest, run) => Math.max(longest, run.length + 1), 3)
  const fence = "`".repeat(length)
  return `${fence}${language}\n${text}\n${fence}`
}

/** Only generated keys and fixed semantic colors reach chart CSS/configuration. */
export function artifactChartModel(content: Extract<ArtifactContent, { kind: "chart" }>) {
  const checked = normalizeArtifactContent(content) as Extract<ArtifactContent, { kind: "chart" }>
  const series = checked.series.map((series, index) => ({ key: `series${index}`, label: series.label, color: `var(--chart-${index % 5 + 1})` }))
  return {
    series,
    config: Object.fromEntries(series.map(series => [series.key, { label: series.label, color: series.color }])),
    rows: checked.rows.map(row => Object.fromEntries([["category", row.label], ...row.values.map((value, index) => [`series${index}`, value])])),
  }
}

export function emptyArtifactContent(kind: ArtifactContent["kind"]): ArtifactContent {
  if (kind === "media") return { kind, mediaType: "image", url: "", description: "" }
  if (kind === "diagram") return { kind, nodes: [], edges: [] }
  if (kind === "markdown") return { kind, text: "" }
  if (kind === "code") return { kind, text: "", language: "text" }
  if (kind === "table") return { kind, columns: ["Column 1", "Column 2"], rows: [] }
  return { kind, chartType: "bar", xLabel: "", series: [{ label: "Series 1" }], rows: [] }
}
