import { useEffect, useMemo, useState } from "react"
import { CharacterMedia } from "@/components/character-studio/media"
import { createCharacterStudio, type CharacterMode } from "@/lib/api/character"
import type { Character } from "@/lib/api/client"
import type { ActivityPhase } from "@/lib/api/conversation-types"
import "./conversation-activity.css"

export type ConversationActivityPhase = ActivityPhase

function activityLabel(phase: ConversationActivityPhase) {
  return { thinking: "Thinking", streaming: "Writing", searching: "Searching", reading: "Reading", tool: "Running tool", agent: "Agent working", waiting: "Waiting for you" }[phase]
}

/** Presentation follows real stream phases; no invented tool work or inferred emotions. */
export function ConversationActivity({ profile, mode, phase, compact = false, motion = true }: {
  profile?: Character
  mode: CharacterMode
  phase: ConversationActivityPhase
  compact?: boolean
  motion?: boolean
}) {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  const character = useMemo(() => profile ? { ...profile, studio: profile.studio ?? createCharacterStudio() } : undefined, [profile])
  const showCharacter = mode === "character" && character
  const animate = visible && motion

  return <span aria-hidden="true" data-phase={phase} data-motion={animate ? "on" : "off"} className={compact ? "conversation-activity conversation-activity-compact" : "conversation-activity conversation-activity-label"}>
    <span className="conversation-activity-mark">
      {showCharacter ? <>
        <CharacterMedia profile={character} activity="thinking" motion={animate && character.studio.modes[mode].motion} className="conversation-activity-portrait size-9 rounded-full" />
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
    {!compact && <><span className="text-sm font-medium">{activityLabel(phase)}<span className="conversation-activity-dots"><span>.</span><span>.</span><span>.</span></span></span><span className="pr-1 text-xs text-muted-foreground">Preview</span></>}
  </span>
}
