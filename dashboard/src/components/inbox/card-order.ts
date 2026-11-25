export type InboxOrder = 'urgent' | 'oldest' | 'newest'
/** One waiting card: its key, when it came (ms), and whether its outcome is unknown (an approval attempt to check). */
export type OrderedCard<T> = { key: string; at: number; unknown: boolean; node: T }

/**
 * Settings > Inbox > Order. "Urgent first" keeps the Inbox's own order (decisions, Conker's requests
 * and questions, then notes, memory and ideas). Oldest or newest first sorts every card by when it came.
 * A card whose outcome is unknown always comes first, so it is never behind the cap; equal times
 * keep the urgent order.
 */
export function orderCards<T>(cards: readonly OrderedCard<T>[], order: InboxOrder): OrderedCard<T>[] {
  const rank = new Map(cards.map((card, index) => [card.key, index]))
  const byTime = (a: OrderedCard<T>, b: OrderedCard<T>) => (order === 'oldest' ? a.at - b.at : order === 'newest' ? b.at - a.at : 0)
  return [...cards].sort((a, b) => Number(b.unknown) - Number(a.unknown) || byTime(a, b) || rank.get(a.key)! - rank.get(b.key)!)
}
