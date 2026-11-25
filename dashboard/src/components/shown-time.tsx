import { useSyncExternalStore } from 'react'
import { fullTime, shownTime } from '@/lib/shown-time'
import { useTimeStyle } from './use-time-style'

// One clock for every relative time on screen, so "Just now" never stays on a message an hour old.
// It ticks every 30 s and only while something shows a relative time.
let clockNow = Date.now()
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setInterval> | undefined
function subscribeClock(listener: () => void) {
  clockListeners.add(listener)
  if (clockListeners.size === 1) {
    clockNow = Date.now()
    clockTimer = setInterval(() => {
      clockNow = Date.now()
      clockListeners.forEach(notify => notify())
    }, 30_000)
  }
  return () => {
    clockListeners.delete(listener)
    if (!clockListeners.size) clearInterval(clockTimer)
  }
}
const stillClock = () => () => undefined
const readClock = () => clockNow

/**
 * When something happened, as the owner chose to see times: its full date and time is always its
 * label, so a hidden or relative time still answers "when exactly". Renders nothing when hidden.
 */
export function ShownTime({ at, className }: { at: string; className?: string }) {
  const style = useTimeStyle()
  const now = useSyncExternalStore(style === 'relative' ? subscribeClock : stillClock, readClock, readClock)
  const when = Date.parse(at)
  const text = Number.isFinite(when) ? shownTime(when, now, style) : null
  if (text === null) return null
  const full = fullTime(when)
  return (
    <time dateTime={at} title={full} aria-label={full} className={className}>
      {text}
    </time>
  )
}
