const MIN_RATE = 80 // characters per second when nothing more is waiting: about 15 words a second
const CATCH_UP_S = 0.3 // plus backlog / CATCH_UP_S, so a backlog melts away fast
const LONG_WORD = 24 // a word longer than this is shown in pieces instead of waiting for it

/** How many characters of `target` to show next, `elapsedMs` after showing `shown` of them. Shows whole words only, so the caller keeps counting time until the next word fits. */
export function nextReveal(shown: number, target: string, elapsedMs: number): number {
  if (shown >= target.length) return target.length
  if (elapsedMs <= 0) return shown
  const rate = MIN_RATE + (target.length - shown) / CATCH_UP_S
  const budget = Math.min(target.length, shown + Math.floor(rate * elapsedMs / 1000))
  let next = shown
  for (let end = shown + 1; end <= budget; end++) {
    if (end === target.length || /\s/.test(target[end])) next = end
  }
  return next === shown && budget - shown >= LONG_WORD ? budget : next
}

/** Where to restart when the text changed: the shared prefix length, or 0. */
export function keepPrefix(previous: string, next: string, shown: number): number {
  return next.startsWith(previous.slice(0, shown)) ? shown : 0
}
