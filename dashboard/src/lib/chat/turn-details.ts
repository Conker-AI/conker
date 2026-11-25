import type { RuntimeTurn } from '@/lib/gateway/runtime'

/** What can show under an answer (Settings > Appearance > Under each answer), in the order it is drawn. */
export type AnswerDetail = 'model' | 'time' | 'tokens' | 'cost' | 'route' | 'tools'
export type TurnFacts = Partial<Record<AnswerDetail, string>>
const ORDER: readonly AnswerDetail[] = ['model', 'time', 'tokens', 'cost', 'route', 'tools']

/** Why the model answered, from the routing receipt Pi saves in the turn's detail; nothing when Auto did not choose. */
function route(detail: string | null): string | null {
  if (!detail || detail.length > 16_000 || !detail.startsWith('{')) return null
  try {
    const attempts: unknown = (JSON.parse(detail) as { attempts?: unknown }).attempts
    if (!Array.isArray(attempts)) return null
    const rows = attempts.filter((item): item is { role?: unknown; status?: unknown; selectionReason?: unknown } => !!item && typeof item === 'object')
    if (rows.some(item => item.selectionReason === 'single_eligible_model')) return 'only model ready'
    return rows.some(item => item.role === 'routing' && (item.status === 'completed' || item.status === 'reused')) ? 'picked by Auto' : null
  } catch {
    return null
  }
}

/** Facts from the saved turn only: nothing is estimated or shown before Pi records it. `tools` counts the turn's saved tool records. */
export function turnDetails(turn: RuntimeTurn | undefined, tools = 0): { details?: TurnFacts } {
  if (!turn || !turn.endedAt) return {}
  const seconds = Math.max(0, Math.round((Date.parse(turn.endedAt) - Date.parse(turn.startedAt)) / 1000))
  const cost = turn.costUsd === null || turn.costUsd === undefined ? null : turn.costUsd === 0 ? 'free' : `$${turn.costUsd < 0.01 ? turn.costUsd.toFixed(4) : turn.costUsd.toFixed(2)}`

  // Tokens: inputTokens + outputTokens (null counts as 0)
  const totalTokens = (turn.inputTokens ?? 0) + (turn.outputTokens ?? 0)
  const tokens = totalTokens === 0 ? null : totalTokens < 1000 ? `${totalTokens} tokens` : totalTokens < 10000 ? `${(totalTokens / 1000).toFixed(1).replace('.0', '')}k tokens` : `${Math.round(totalTokens / 1000)}k tokens`

  const found: Record<AnswerDetail, string | null> = {
    model: turn.model || null,
    time: Number.isFinite(seconds) ? `${seconds} s` : null,
    tokens,
    cost,
    route: route(turn.detail ?? null),
    tools: tools > 0 ? `${tools} ${tools === 1 ? 'tool' : 'tools'}` : null,
  }
  const details = Object.fromEntries(ORDER.filter(key => found[key]).map(key => [key, found[key]!])) as TurnFacts
  return Object.keys(details).length ? { details } : {}
}

/** The facts the owner chose, in their fixed order, as one line ('' when none of them is saved). */
export function shownDetails(details: TurnFacts | undefined, shown: readonly string[]): string {
  if (!details) return ''
  return ORDER.filter(key => shown.includes(key) && details[key])
    .map(key => details[key])
    .join(' · ')
}
