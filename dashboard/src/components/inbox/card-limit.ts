import { useState } from 'react'

/**
 * Which of the waiting cards show, in their order: the cards already on screen stay (a card he is
 * answering is never pulled away because a newer one arrived), then the next ones up to `limit`.
 * A card that leaves (decided, moved to Later) makes room for the next. A changed limit starts over.
 */
export function pickShown(keys: readonly string[], limit: number, kept: readonly string[]): string[] {
  const keep = new Set(kept)
  const shown = new Set(keys.filter(key => keep.has(key)))
  for (const key of keys) {
    if (shown.size >= limit) break
    shown.add(key)
  }
  return keys.filter(key => shown.has(key))
}

/**
 * Settings > Your day: "Cards at once" (and Easy mode's one at a time) for the Inbox's waiting cards.
 * The rest are never hidden without a count: `hidden` says how many, and `showAll` shows every one
 * until he leaves the Inbox.
 */
export function useCardLimit(keys: readonly string[], limit: number): { shown: ReadonlySet<string>; hidden: number; showAll: () => void } {
  const [all, setAll] = useState(false)
  const [kept, setKept] = useState<{ limit: number; keys: readonly string[] }>({ limit, keys: [] })
  const shown = all ? [...keys] : pickShown(keys, limit, kept.limit === limit ? kept.keys : [])
  // Remember what is on screen (React's "adjust state while rendering": it settles on the next render).
  if (!all && (kept.limit !== limit || kept.keys.join('\n') !== shown.join('\n'))) setKept({ limit, keys: shown })
  return { shown: new Set(shown), hidden: keys.length - shown.length, showAll: () => setAll(true) }
}
