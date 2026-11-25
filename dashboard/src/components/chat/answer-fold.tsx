import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useServerSetting } from '@/settings/server-setting'

/** Line height of answer text when the page cannot say (rich-answer.css: 16 px at 1.7). */
const FALLBACK_LINE = 27.2

/**
 * Fold long answers (Settings > Chats): a saved answer taller than this many of its own lines shows
 * that many, with a button that opens the rest; 0 never folds. Only saved answers fold: one still
 * being written stays whole. Counted in lines as drawn, so a long paragraph counts as what it fills.
 */
export function AnswerFold({ children }: { children: ReactNode }) {
  const lines = useServerSetting('chats.fold_after', 0)
  const body = useRef<HTMLDivElement>(null)
  // The folded height in pixels once the answer is measured as longer than the setting; null fits.
  const [limit, setLimit] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const element = body.current
    if (!element || lines <= 0) return
    const measure = () => {
      const style = getComputedStyle(element.firstElementChild ?? element)
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.7 || FALLBACK_LINE
      // Half a line of slack, so an answer one line over is not folded to hide a single line.
      setLimit(element.offsetHeight > (lines + 0.5) * line ? lines * line : null)
    }
    // A ResizeObserver reports once when it starts, then on every change (the formatted text arriving).
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [lines])
  const folds = lines > 0 && limit !== null
  return (
    <div className="min-w-0">
      <div
        className="min-w-0 overflow-hidden"
        style={folds && !open ? { maxHeight: limit } : undefined}
        // Tab into the folded part (a link, a code block) opens the answer, so focus is never hidden.
        onFocus={event => {
          if (folds && !open && event.target.getBoundingClientRect().bottom > event.currentTarget.getBoundingClientRect().bottom) setOpen(true)
        }}
      >
        <div ref={body} data-answer-body className="min-w-0">
          {children}
        </div>
      </div>
      {folds && (
        <Button type="button" variant="ghost" size="sm" className="mt-1 -ml-2 text-muted-foreground" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {open ? 'Fold the answer' : 'Show the whole answer'}
        </Button>
      )}
    </div>
  )
}
