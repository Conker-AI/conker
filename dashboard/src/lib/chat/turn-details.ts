import type { RuntimeTurn } from '@/lib/gateway/runtime'

/** Facts from the saved turn only: nothing is estimated or shown before Pi records it. */
export function turnDetails(turn: RuntimeTurn | undefined): { details?: string } {
  if (!turn || !turn.endedAt) return {}
  const seconds = Math.max(0, Math.round((Date.parse(turn.endedAt) - Date.parse(turn.startedAt)) / 1000))
  const cost = turn.costUsd === null ? null : turn.costUsd === 0 ? 'free' : `$${turn.costUsd < 0.01 ? turn.costUsd.toFixed(4) : turn.costUsd.toFixed(2)}`

  // Tokens: inputTokens + outputTokens (null counts as 0)
  const totalTokens = (turn.inputTokens ?? 0) + (turn.outputTokens ?? 0)
  const tokens = totalTokens === 0 ? null :
    totalTokens < 1000 ? `${totalTokens} tokens` :
    totalTokens < 10000 ? `${(totalTokens / 1000).toFixed(1).replace('.0', '')}k tokens` :
    `${Math.round(totalTokens / 1000)}k tokens`

  const details = [turn.model, Number.isFinite(seconds) ? `${seconds} s` : null, tokens, cost].filter(Boolean).join(' · ')
  return details ? { details } : {}
}
