import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { useBackToChats, useSwipeBack } from '@/pwa/chat-navigation'
import { conversationColumn } from './composer'

/** A phone's way from a chat back to the chat list (a swipe right on the history does the same). */
export function BackToChats() {
  const phone = useIsMobile()
  const back = useBackToChats()
  if (!phone) return null
  return <Button type="button" variant="ghost" size="icon" className="-mx-1 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Back to chats" title="Back to chats" onClick={back}><ArrowLeft aria-hidden="true" /></Button>
}

export function ConversationHistory({ sessionId, focusedMessageId, children }: { sessionId: string; focusedMessageId?: string | null; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  useSwipeBack(viewport)
  useLayoutEffect(() => {
    const scroller = viewport.current
    const body = content.current
    if (!scroller || !body) return
    following.current = !focusedMessageId
    let positioned = false
    let height = scroller.clientHeight
    // Observe content as well as the viewport: markdown and streaming can change its height.
    const follow = () => {
      const before = height
      height = scroller.clientHeight
      if (following.current) scroller.scrollTop = scroller.scrollHeight
      else if (focusedMessageId && !positioned && scroller.clientHeight) {
        const target = body.ownerDocument.getElementById(`record-${focusedMessageId}`)
        if (!target || !body.contains(target)) return
        scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16
        positioned = true
        setShowLatest(true)
      }
      // The on-screen keyboard opening or closing keeps the lines being read at the bottom in view.
      else if (before && height && height !== before) scroller.scrollTop = Math.max(0, scroller.scrollTop + before - height)
    }
    follow()
    const observer = new ResizeObserver(follow)
    observer.observe(body)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [sessionId, focusedMessageId])
  return <div className="relative min-h-0 flex-1">
    <div ref={viewport} tabIndex={0} aria-label="Saved conversation history" className="h-full overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring" onClickCapture={event => {
      // Inspecting a disclosure is an explicit reading action, including keyboard activation.
      // Pause before its default toggle resizes content so following cannot hide the heading.
      if (event.target instanceof Element && event.target.closest('summary')) {
        following.current = false
        setShowLatest(true)
      }
    }} onScroll={event => {
      const scroller = event.currentTarget
      // Programmatic focus can emit a stale bottom scroll event; only Latest releases a deep link.
      if (!focusedMessageId || following.current) following.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
      setShowLatest(!following.current)
    }}>
      <div ref={content} className={`${conversationColumn} space-y-6 py-6`}>{children}</div>
    </div>
    {showLatest && <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none"><Tooltip><TooltipTrigger render={<Button type="button" size="icon" variant="outline" className="pointer-events-auto rounded-full bg-background shadow-sm" aria-label="Jump to latest message" onClick={() => {
      following.current = true
      if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
      setShowLatest(false)
    }} />}><ArrowDown /></TooltipTrigger><TooltipContent>Latest message</TooltipContent></Tooltip></div>}
  </div>
}
