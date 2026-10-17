import type { RuntimeTurn } from '@/lib/gateway/runtime'

/** Facts from the saved turn only: nothing is estimated or shown before Pi records it. */
export function turnDetails(turn: RuntimeTurn | undefined): { details?: string } {
  if (!turn || !turn.endedAt) return {}
  const seconds = Math.max(0, Math.round((Date.parse(turn.endedAt) - Date.parse(turn.startedAt)) / 1000))
  const cost = turn.costUsd === null ? null : turn.costUsd === 0 ? 'free' : `$${turn.costUsd < 0.01 ? turn.costUsd.toFixed(4) : turn.costUsd.toFixed(2)}`
  const details = [turn.model, Number.isFinite(seconds) ? `${seconds} s` : null, cost].filter(Boolean).join(' · ')
  return details ? { details } : {}
}
