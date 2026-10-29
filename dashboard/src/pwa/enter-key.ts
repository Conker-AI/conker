import { useSyncExternalStore } from "react"
import { useIsMobile } from "@/hooks/use-mobile"

const coarse = "(pointer: coarse)"

/**
 * What Enter does in the message composer. On a phone (touch, phone width) Enter adds a new line and
 * the Send button sends, as in WhatsApp, Messages and Telegram; elsewhere Enter sends and Shift+Enter
 * adds a new line.
 */
export function enterSends(phoneWidth: boolean, touch: boolean) {
  return !(phoneWidth && touch)
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(coarse)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export function useEnterSends() {
  const phoneWidth = useIsMobile()
  const touch = useSyncExternalStore(subscribe, () => window.matchMedia(coarse).matches, () => false)
  return enterSends(phoneWidth, touch)
}
