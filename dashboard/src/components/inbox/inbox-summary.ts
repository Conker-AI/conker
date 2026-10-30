/**
 * The Inbox's one-line summary. It never says "All clear" before every source has answered, and a
 * source that failed is reported as not loaded, never counted as empty.
 */
export type InboxSource = { answered: boolean; failed: boolean }
export type InboxSummary = { state: 'loading' | 'partial' | 'ready'; text: string }

export function inboxSummary(sources: readonly InboxSource[], needs: number, decidedToday: number): InboxSummary {
  if (sources.some(source => !source.answered && !source.failed)) return { state: 'loading', text: 'Loading your Inbox…' }
  const waiting = needs ? `${needs} ${needs === 1 ? 'needs' : 'need'} you` : null
  if (sources.some(source => source.failed)) return { state: 'partial', text: waiting ? `${waiting} · part of your Inbox didn’t load` : 'Part of your Inbox didn’t load' }
  return { state: 'ready', text: `${waiting ?? 'All clear'} · ${decidedToday} decided today` }
}
