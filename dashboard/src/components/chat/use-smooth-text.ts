import { useEffect, useRef, useState } from 'react'
import { keepPrefix, nextReveal } from '@/lib/chat/smooth-text'

function reducedMotion() {
  const motion = document.documentElement.dataset.motion
  return motion === 'off' || motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The part of a streaming `text` to show now: revealed word by word, never more than about 0.6 s behind. */
export function useSmoothText(text: string, { streaming, resetKey }: { streaming: boolean; resetKey?: unknown }): string {
  const animate = streaming && !reducedMotion()
  const [shown, setShown] = useState(animate ? 0 : text.length)
  const shownRef = useRef(shown)
  const previous = useRef({ text, resetKey })

  useEffect(() => {
    const before = previous.current
    previous.current = { text, resetKey }
    if (!animate) {
      shownRef.current = text.length
      setShown(text.length)
      return
    }
    shownRef.current = before.resetKey === resetKey ? Math.min(keepPrefix(before.text, text, shownRef.current), text.length) : 0
    setShown(shownRef.current)
    let last = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const next = nextReveal(shownRef.current, text, now - last)
      if (next !== shownRef.current) {
        last = now
        shownRef.current = next
        setShown(next)
      }
      if (next < text.length) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [text, animate, resetKey])

  return animate ? text.slice(0, shown) : text
}
