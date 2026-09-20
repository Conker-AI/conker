/** A requested next-turn mode, not permission to execute a search. */
export type ResearchMode = "off" | "web" | "deep"

export function normalizeResearchMode(value: unknown): ResearchMode {
  if (value === undefined || value === "off") return "off"
  if (value === "web" || value === "deep") return value
  throw new Error("Choose Off, Web, or Deep research.")
}

export function researchLabel(mode: ResearchMode = "off") {
  return mode === "deep" ? "Deep research" : mode === "web" ? "Web" : "Research off"
}
