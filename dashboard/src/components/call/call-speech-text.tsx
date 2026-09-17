import { Fragment, useEffect, useRef } from "react"
import type { SpeechProgress } from "@/lib/voice/read-aloud"
import { cn } from "@/lib/utils"

/** One word treatment for timed playback and arriving microphone transcripts. */
export function CallSpeechText({ text, progress, live = false, compact = false }: {
  text: string; progress?: SpeechProgress | null; live?: boolean; compact?: boolean
}) {
  const active = useRef<HTMLSpanElement>(null)
  const words = [...text.matchAll(/\S+/g)]
  const visible = live ? words.slice(-40) : words
  useEffect(() => {
    const word = active.current
    const scroller = word?.closest<HTMLElement>(".call-lyrics, .call-transcript")
    if (live || !word || !scroller) return
    const bounds = scroller.getBoundingClientRect(), current = word.getBoundingClientRect()
    if (current.bottom > bounds.bottom - 16) scroller.scrollTop += current.bottom - bounds.bottom + 32
    else if (current.top < bounds.top + 16) scroller.scrollTop -= bounds.top - current.top + 32
  }, [progress?.wordStart, live])
  return <p dir="auto" aria-live="off" className={cn("call-speech-text whitespace-pre-wrap break-words font-medium", compact ? "text-base leading-7" : "text-xl leading-relaxed sm:text-2xl")}>
    {visible.map((match, index) => {
      const current = progress?.wordStart === match.index
      const spoken = live || (!!progress && match.index < progress.spokenUntil)
      const gap = visible[index + 1] ? text.slice(match.index + match[0].length, visible[index + 1].index) : ""
      return <Fragment key={`${match.index}:${match[0]}`}><span ref={current ? active : undefined} data-speech-word={current ? "current" : spoken ? "spoken" : "upcoming"}
        className={cn("call-word", live && "call-word-arriving", current ? "call-word-current text-primary" : spoken ? "text-foreground" : "text-muted-foreground")}>{match[0]}</span>{gap}</Fragment>
    })}
  </p>
}
