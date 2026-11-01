export type ToolRecordView = {
  tool: string | null          // 'sandbox.run'
  label: string                // human name: last dotted part, '_' and '-' to spaces, first letter up: 'Run'; null tool -> 'Tool'
  status: 'ok' | 'failed' | 'timed out' | 'declined' | 'unknown'
  summary: string              // one line for the folded row, at most 80 chars, ends with '…' if cut
  output: string | null        // stdout, else a string result, else null
  error: string | null         // stderr when non-empty
  durationMs: number | null
  raw: string                  // pretty JSON (2 spaces) of the parsed object, or the text as given
}

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null
const firstLine = (value: string) => value.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
const cut = (value: string) => value.length > 80 ? `${value.slice(0, 79).trimEnd()}…` : value

function parse(value: string): unknown {
  try {
    const once: unknown = JSON.parse(value)
    return typeof once === 'string' ? JSON.parse(once) : once
  } catch {
    return undefined
  }
}

function statusOf(record: Fields, result: Fields | null): ToolRecordView['status'] {
  if ('declined' in record) return 'declined'
  if (result?.timedOut === true) return 'timed out'
  const exitCode = typeof result?.exitCode === 'number' ? result.exitCode : null
  if (record.ok === false || (exitCode !== null && exitCode !== 0)) return 'failed'
  if (record.ok === true || exitCode === 0 || 'result' in record) return 'ok'
  return 'unknown'
}

export function readToolRecord(value: string): ToolRecordView {
  const record = parse(value)
  if (!isFields(record)) {
    return { tool: null, label: 'Tool', status: 'unknown', summary: cut(firstLine(value)), output: null, error: null, durationMs: null, raw: value }
  }
  const tool = text(record.tool)
  const label = tool ? (tool.split('.').pop() ?? tool).replace(/[_-]+/g, ' ').trim().replace(/^./, (first) => first.toUpperCase()) : 'Tool'
  const result = isFields(record.result) ? record.result : null
  const status = statusOf(record, result)
  const output = text(result?.stdout) ?? text(record.result)
  const error = text(result?.stderr)
  const durationMs = typeof result?.durationMs === 'number' && Number.isFinite(result.durationMs) ? result.durationMs : null
  const summary = cut(firstLine(output ?? error ?? '') || status)
  return { tool, label, status, summary, output, error, durationMs, raw: JSON.stringify(record, null, 2) }
}
