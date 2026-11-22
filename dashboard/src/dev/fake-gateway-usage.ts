/** Development-only provider-attempt usage for one preview turn, in the shape the real usage client parses. */
type Json = Record<string, unknown>

/** `legacy` marks a turn recorded before attempt usage existed, so its totals stay partial. */
export function fakeTurnUsage(turn: Json, sessionId: string, legacy: boolean): Json {
  const attempts = [
    { id: 'usage_01', lane: 'foreground', role: 'routing', provider_id: 'ollama-local', model_id: 'router', provider: 'ollama', model: 'qwen2.5:3b', actual_provider: 'ollama', actual_model: 'qwen2.5:3b', status: 'reported', failure_kind: null, started_at: Number(turn.started_at), ended_at: Number(turn.started_at) + 0.2, elapsed_ms: 200, input_tokens: 48, output_tokens: 8, cached_tokens: null, cost_usd: null },
    { id: 'usage_02', lane: 'foreground', role: 'answer', provider_id: 'ollama-local', model_id: 'talking', provider: 'ollama', model: 'qwen2.5:3b', actual_provider: 'ollama', actual_model: 'qwen2.5:3b', status: 'reported', failure_kind: null, started_at: Number(turn.started_at) + 0.2, ended_at: Number(turn.started_at) + 2.4, elapsed_ms: 2200, input_tokens: 230, output_tokens: 80, cached_tokens: 0, cost_usd: null },
    { id: 'usage_03', lane: 'thinking', role: 'thinking', provider_id: 'ollama-local', model_id: 'thinking', provider: 'ollama', model: 'qwen2.5:7b', actual_provider: null, actual_model: null, status: 'failed', failure_kind: 'preempted', started_at: Number(turn.started_at) + 0.4, ended_at: Number(turn.started_at) + 3, elapsed_ms: 2600, input_tokens: null, output_tokens: null, cached_tokens: null, cost_usd: null },
  ]
  const lane = (name: string) => {
    const rows = attempts.filter(row => row.lane === name), fields = ['input_tokens', 'output_tokens', 'cached_tokens', 'cost_usd', 'summed_call_ms'] as const
    const entries = fields.map(field => {
      const values = rows.map(row => field === 'summed_call_ms' ? row.elapsed_ms : row[field]), missing = values.filter(value => value === null).length
      return { field, known: values.reduce<number>((sum, value) => sum + (value ?? 0), 0), missing, complete: !legacy && missing === 0 }
    })
    return { attempt_count: rows.length, pending_count: 0, reported_count: rows.filter(row => row.status === 'reported').length, failed_count: rows.filter(row => row.status === 'failed').length,
      totals: Object.fromEntries(entries.map(row => [row.field, row.complete ? row.known : null])), known_subtotal: Object.fromEntries(entries.map(row => [row.field, row.known])), complete: Object.fromEntries(entries.map(row => [row.field, row.complete])), unknown_counts: Object.fromEntries(entries.map(row => [row.field, row.missing])) }
  }
  return { schemaVersion: 1, turn_id: turn.id, session_id: sessionId, content_status: 'available', scope: 'turn_provider_attempts', coverage: legacy ? 'legacy_partial' : 'complete', foreground: lane('foreground'), thinking: lane('thinking'), attempts, attempts_truncated: false }
}
