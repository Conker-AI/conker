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

export function readToolRecord(text: string): ToolRecordView {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
    // Handle double-encoded JSON
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
  } catch {
    // Unparseable text
    return {
      tool: null,
      label: 'Tool',
      status: 'unknown',
      summary: text.slice(0, 80).trim() + (text.length > 80 ? '…' : ''),
      output: null,
      error: null,
      durationMs: null,
      raw: text
    }
  }

  const tool = (parsed as { tool?: string }).tool || null
  const label = tool ? tool.split('.').pop()!.replace(/[_-]/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase()) : 'Tool'
  
  // Determine status
  let status: ToolRecordView['status'] = 'unknown'
  const parsedObj = parsed as {
    declined?: string
    ok?: boolean
    result?: {
      timedOut?: boolean
      exitCode?: number
      stdout?: string
      stderr?: string
      durationMs?: number
    }
  }

  if (parsedObj.declined) {
    status = 'declined'
  } else if (parsedObj.result?.timedOut === true) {
    status = 'timed out'
  } else if (parsedObj.ok === false || parsedObj.result?.exitCode !== 0) {
    status = 'failed'
  } else if (parsedObj.ok === true || parsedObj.result?.exitCode === 0 || parsedObj.result !== undefined) {
    status = 'ok'
  }

  const result = parsedObj.result || (typeof parsed === 'object' && parsed !== null && 'result' in parsed ? parsed.result : {})
  const output = result.stdout || (typeof parsedObj.result === 'string' ? parsedObj.result : null)
  const error = result.stderr || null
  const durationMs = result.durationMs || null

  // Create summary
  let summary = ''
  if (output) {
    const lines = output.split('\n')
    summary = lines.find((line: string) => line.trim()) || ''
  } else if (error) {
    const lines = error.split('\n')
    summary = lines.find((line: string) => line.trim()) || ''
  } else {
    summary = status
  }
  
  const originalLength = summary.length
  summary = summary.slice(0, 80).trim()
  if (originalLength > 80) {
    summary += '…'
  }

  // Create pretty raw JSON
  const raw = JSON.stringify(parsed, null, 2)

  return {
    tool,
    label,
    status,
    summary,
    output,
    error,
    durationMs,
    raw
  }
}