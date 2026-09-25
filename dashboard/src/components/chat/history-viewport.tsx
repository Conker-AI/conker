import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Follow new content only while the reader is at the end of the conversation. */
export function ChatHistoryViewport({ children, focusedMessageId, visible = true }: {
  children: ReactNode
  focusedMessageId?: string | null
  visible?: boolean
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const following = useRef(!focusedMessageId)
  const [away, setAway] = useState(false)

  useEffect(() => {
    const frame = viewport.current
    const body = content.current
    if (!frame || !body || !visible) return
    const measure = () => {
      if (!frame.clientHeight) return
      if (following.current) frame.scrollTop = frame.scrollHeight
      setAway(frame.scrollHeight - frame.scrollTop - frame.clientHeight > 48)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(body)
    return () => observer.disconnect()
  }, [visible])

  return <div className="relative min-h-0 flex-1">
    <div ref={viewport} className="h-full overflow-y-auto p-4 sm:p-6" tabIndex={0} aria-label="Saved conversation history"
      onScroll={() => {
        const frame = viewport.current
        if (!frame) return
        const atEnd = frame.scrollHeight - frame.scrollTop - frame.clientHeight <= 48
        following.current = atEnd
        setAway(!atEnd)
      }}>
      <div ref={content} className="mx-auto w-full max-w-3xl space-y-6">{children}</div>
    </div>
    {away && <Button type="button" variant="outline" size="icon" className="absolute bottom-3 left-1/2 size-8 -translate-x-1/2 rounded-full bg-background shadow-sm" aria-label="Jump to latest message" onClick={() => {
      const frame = viewport.current
      if (!frame) return
      following.current = true
      frame.scrollTop = frame.scrollHeight
      setAway(false)
    }}><ArrowDown className="size-4" /></Button>}
  </div>
}
