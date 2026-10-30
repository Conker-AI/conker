import "./no-devtools"
import { createParser, type ParseResult } from "@openuidev/react-lang"
import { MAX_BLOCK_CHARACTERS, MAX_BLOCK_NODES } from "./fence"
import { answerLibrary } from "./library"

export type BlockProblem = "too-large" | "unknown-part" | "tools" | "cut-off" | "broken"

export const PROBLEMS: Record<BlockProblem, string> = {
  "too-large": "It is too large to show here.",
  "unknown-part": "It uses a part Conker doesn't have.",
  tools: "It tries to run tools, which answers can't do.",
  "cut-off": "It was cut off before it finished.",
  broken: "It has a mistake Conker can't draw.",
}

/** Hard limits per list, well above what the prompt asks for: past them a block is a mistake. */
const LIST_LIMITS: Record<string, number> = { "Table.rows": 200, "Table.columns": 20, "Chart.labels": 100, "Chart.series": 8, "Choices.options": 12, "Form.fields": 12, "Stats.items": 12, "Steps.items": 30 }

const parser = createParser(answerLibrary.toJSONSchema(), answerLibrary.root)

type Element = { type: "element"; typeName: string; props: Record<string, unknown> }
const isElement = (value: unknown): value is Element => !!value && typeof value === "object" && (value as Element).type === "element"

/** Counts components and checks every list against its limit; false once anything is too large. */
function withinLimits(root: unknown): boolean {
  let nodes = 0
  const visit = (value: unknown, owner?: string, prop?: string): boolean => {
    if (Array.isArray(value)) {
      const limit = owner && prop ? LIST_LIMITS[`${owner}.${prop}`] : undefined
      return (limit === undefined || value.length <= limit) && value.every(item => visit(item, owner, undefined))
    }
    if (isElement(value)) {
      if (++nodes > MAX_BLOCK_NODES) return false
      return Object.entries(value.props ?? {}).every(([key, item]) => visit(item, value.typeName, key))
    }
    return true
  }
  return visit(root)
}

/** Why a block cannot be drawn, or null when it can. A block still arriving is only checked for size. */
export function blockProblem(source: string, { complete, streaming }: { complete: boolean; streaming: boolean }): BlockProblem | null {
  if (source.length > MAX_BLOCK_CHARACTERS) return "too-large"
  if (!complete && streaming) return null
  if (!complete) return "cut-off"
  let result: ParseResult
  try { result = parser.parse(source) } catch { return "broken" }
  if (result.queryStatements.length || result.mutationStatements.length) return "tools"
  const errors = result.meta.errors.filter(error => (error as { severity?: string }).severity !== "warning")
  if (errors.some(error => error.code === "unknown-component" || error.code === "unknown-function")) return "unknown-part"
  if (errors.length || !result.root || result.meta.incomplete) return "broken"
  return withinLimits(result.root) ? null : "too-large"
}
