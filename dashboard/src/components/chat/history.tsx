import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { conversationColumn } from './composer'

export function ConversationHistory({ sessionId, focusedMessageId, children }: { sessionId: string; focusedMessageId?: string | null; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  useLayoutEffect(() => {
    const scroller = viewport.current
    const body = content.current
    if (!scroller || !body) return
    following.current = !focusedMessageId
    // Observe content as well as the viewport: markdown and streaming can change its height.
    const follow = () => { if (following.current) scroller.scrollTop = scroller.scrollHeight }
    follow()
    const observer = new ResizeObserver(follow)
    observer.observe(body)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [sessionId, focusedMessageId])
  return <div className="relative min-h-0 flex-1">
    <div ref={viewport} tabIndex={0} aria-label="Saved conversation history" className="h-full overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring" onScroll={event => {
      const scroller = event.currentTarget
      following.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
      setShowLatest(!following.current)
    }}>
      <div ref={content} className={`${conversationColumn} space-y-6 py-6`}>{children}</div>
    </div>
    {showLatest && <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none"><Tooltip><TooltipTrigger asChild><Button type="button" size="icon" variant="outline" className="pointer-events-auto rounded-full bg-background shadow-sm" aria-label="Jump to latest message" onClick={() => {
      following.current = true
      if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
      setShowLatest(false)
    }}><ArrowDown /></Button></TooltipTrigger><TooltipContent>Latest message</TooltipContent></Tooltip></div>}
  </div>
}
