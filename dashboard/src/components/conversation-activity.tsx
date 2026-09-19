import { useEffect, useMemo, useRef, useState } from "react"
import { CharacterMedia } from "@/components/character-studio/media"
import { createCharacterStudio, type CharacterMode } from "@/lib/api/character"
import type { Character } from "@/lib/api/client"
import type { ActivityPhase, ConversationRun } from "@/lib/api/conversation-types"
import { activityPresentation } from "@/lib/conversation-activity"
import "./conversation-activity.css"

export type ConversationActivityPhase = ActivityPhase

/** Presentation follows real stream phases; no invented tool work or inferred emotions. */
export function ConversationActivity({ profile, mode, phase, status = "running", compact = false, motion = true }: {
  profile?: Character
  mode: CharacterMode
  phase: ConversationActivityPhase
  status?: ConversationRun["status"]
  compact?: boolean
  motion?: boolean
}) {
  const [visible, setVisible] = useState(() => !document.hidden)
  const [inView, setInView] = useState(true)
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  const mark = useRef<HTMLSpanElement>(null)
  const previousStatus = useRef(status)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    query.addEventListener("change", update)
    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? true))
    if (mark.current) observer?.observe(mark.current)
    return () => { query.removeEventListener("change", update); observer?.disconnect() }
  }, [])
  const character = useMemo(() => profile ? { ...profile, studio: profile.studio ?? createCharacterStudio() } : undefined, [profile])
  const showCharacter = mode === "character" && character
  const presentation = activityPresentation(phase, status)
  const allowMotion = visible && inView && motion && !reduced && (!showCharacter || character.studio.modes[mode].motion)
  const animate = allowMotion && presentation.animate
  useEffect(() => {
    const justCompleted = previousStatus.current === "running" && status === "complete"
    previousStatus.current = status
    if (!justCompleted || !allowMotion) return
    const animation = mark.current?.animate?.([{ opacity: 0.65, transform: "scale(0.94)" }, { opacity: 1, transform: "scale(1)" }], { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" })
    return () => animation?.cancel()
  }, [status, allowMotion])

  return <span aria-hidden="true" data-phase={phase} data-state={presentation.state} data-motion={animate ? "on" : "off"} className={compact ? "conversation-activity conversation-activity-compact" : "conversation-activity conversation-activity-label"}>
    <span ref={mark} className="conversation-activity-mark">
      {showCharacter ? <>
        <CharacterMedia profile={character} activity={presentation.activity} motion={animate} className="conversation-activity-portrait size-9 rounded-full" />
        <svg className="conversation-activity-ring size-full text-primary" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" className="text-border" stroke="currentColor" strokeWidth="1" />
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="24 14 3 97" />
        </svg>
      </> : <svg className="conversation-activity-orb size-full text-primary" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1 4" strokeLinecap="round" />
        <g className="conversation-activity-orbit" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1 4" strokeLinecap="round">
          <ellipse cx="24" cy="24" rx="9" ry="17" />
          <ellipse cx="24" cy="24" rx="17" ry="9" />
          <ellipse cx="24" cy="24" rx="9" ry="17" transform="rotate(55 24 24)" />
        </g>
      </svg>}
    </span>
    {!compact && <><span className="text-sm font-medium">{presentation.label}{presentation.animate && <span className="conversation-activity-dots"><span>.</span><span>.</span><span>.</span></span>}</span><span className="pr-1 text-xs text-muted-foreground">Preview</span></>}
  </span>
}
