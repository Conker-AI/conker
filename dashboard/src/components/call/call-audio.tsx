import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

/** Identical visual language for input level and output playback; no fake input activity. */
export function CallAudio({ level = 0, speaking = false, active = false, label, stage = false }: { level?: number; speaking?: boolean; active?: boolean; label: string; stage?: boolean }) {
  return <div role="img" aria-label={label} className={cn("call-audio flex items-center justify-center", stage ? "call-audio-stage" : "h-6 gap-0.5", speaking && "call-audio-speaking")}>
    {Array.from({ length: stage ? 64 : 28 }, (_, index) => {
      const envelope = 0.15 + 0.85 * Math.abs(Math.sin(index * 0.21) * Math.cos(index * 0.47))
      return <span key={index} aria-hidden="true" className={cn("w-0.5 rounded-full bg-muted-foreground", (active || speaking) && "bg-primary")} style={{ height: `${speaking ? (stage ? 56 : 22) * envelope : active ? Math.max(3, level * 24 * envelope) : 3}px`, animationDelay: `${(index % 11) * -0.17}s`, animationDuration: `${540 + index % 7 * 85}ms` } as CSSProperties} />
    })}
  </div>
}
