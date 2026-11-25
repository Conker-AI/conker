import { formatDateTime } from './date-format'

/**
 * When something happened, as Inbox cards, the Chats list and chat messages show it, from the
 * owner's pick in Settings > Appearance > Times: "5 min ago" (relative), the exact time, or hidden.
 * One wording for every list, so it is learned once. "Hidden" only clears the list line: the exact
 * time stays one step away (a card's Advanced facts, a message's label), so nothing is lost. Times
 * still to come (expires, next run, quiet hours) are never changed by this pick.
 */
export type TimeStyle = 'relative' | 'exact' | 'hidden'

/** "Just now", "5 min ago", "3 hr ago", "1 day ago", "4 days ago". */
export function timeAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`
  const days = Math.floor(minutes / 1440)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/** Day, month and time, short enough for a list line ("25 Nov, 14:03" in the owner's format). */
export function exactTime(at: number): string {
  return formatDateTime(at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** The full date and time, for labels and details ("25/11/2026, 14:03:12" in the owner's format). */
export function fullTime(at: number): string {
  return formatDateTime(at)
}

/** The time on a list line, or null when he hid times. */
export function shownTime(at: number, now: number, style: TimeStyle): string | null {
  return style === 'hidden' ? null : style === 'exact' ? exactTime(at) : timeAgo(at, now)
}

/** A "Came" fact under Advanced: always the full time, with how long ago in front while times are relative. */
export function factTime(at: number, now: number, style: TimeStyle): string {
  return style === 'relative' ? `${timeAgo(at, now)} · ${fullTime(at)}` : fullTime(at)
}
