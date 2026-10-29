import { useCallback, useEffect, useRef, type RefObject } from "react"
import { useNavigate } from "react-router-dom"
import { useIsMobile } from "@/hooks/use-mobile"

const CHAT_LIST = "/chats"
// Swipes that start this close to the left edge belong to the browser's and the phone's own back gesture.
const EDGE_PX = 24
// Far enough that a tap or a slightly sideways scroll never counts.
const SWIPE_PX = 80

type HistoryEntries = { currentEntry: { index: number } | null; entries(): { url: string | null }[] }

/** A rightward swipe: long enough, mostly horizontal, and quick. */
export function isBackSwipe(dx: number, dy: number, milliseconds: number) {
  return dx >= SWIPE_PX && Math.abs(dy) * 2 <= dx && milliseconds <= 700
}

/** Whether the history entry before this one is the chat list (browsers with the Navigation API). */
export function previousIsChatList(navigation: HistoryEntries | undefined, origin: string, base = "") {
  const index = navigation?.currentEntry?.index ?? 0
  const previous = index > 0 ? navigation?.entries()[index - 1]?.url : null
  if (!previous) return false
  const url = new URL(previous)
  return url.origin === origin && url.pathname.replace(/\/+$/, "") === `${base}${CHAT_LIST}`
}

/**
 * Back to the chat list. A chat opened from the list goes back through history, so the phone's own
 * back button does not return to the chat afterwards; any other chat opens the list.
 */
export function useBackToChats() {
  const navigate = useNavigate()
  return useCallback(() => {
    const navigation = (window as Window & { navigation?: HistoryEntries }).navigation
    if (previousIsChatList(navigation, window.location.origin, import.meta.env.VITE_BASENAME || "")) navigate(-1)
    else navigate(CHAT_LIST)
  }, [navigate])
}

function startsInsideControl(target: EventTarget | null, stop: Element) {
  for (let node = target instanceof Element ? target : null; node && node !== stop; node = node.parentElement) {
    if (node.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return true
    // Code blocks and wide tables scroll sideways; a swipe there scrolls them.
    const overflow = getComputedStyle(node).overflowX
    if ((overflow === "auto" || overflow === "scroll") && node.scrollWidth > node.clientWidth + 1) return true
  }
  return false
}

/** On a phone, a rightward swipe across `area` goes back to the chat list. Scrolling is never blocked. */
export function useSwipeBack(area: RefObject<HTMLElement | null>) {
  const phone = useIsMobile()
  const back = useBackToChats()
  const latest = useRef(back)
  useEffect(() => { latest.current = back })
  useEffect(() => {
    const element = area.current
    if (!element || !phone) return
    let start: { x: number; y: number; time: number } | null = null
    const begin = (event: TouchEvent) => {
      const touch = event.touches[0]
      start = event.touches.length === 1 && touch.clientX > EDGE_PX && !startsInsideControl(event.target, element) && !window.getSelection()?.toString()
        ? { x: touch.clientX, y: touch.clientY, time: event.timeStamp } : null
    }
    const end = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      if (start && touch && isBackSwipe(touch.clientX - start.x, touch.clientY - start.y, event.timeStamp - start.time)) latest.current()
      start = null
    }
    const cancel = () => { start = null }
    element.addEventListener("touchstart", begin, { passive: true })
    element.addEventListener("touchend", end, { passive: true })
    element.addEventListener("touchcancel", cancel, { passive: true })
    return () => {
      element.removeEventListener("touchstart", begin)
      element.removeEventListener("touchend", end)
      element.removeEventListener("touchcancel", cancel)
    }
  }, [area, phone])
}
