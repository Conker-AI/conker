import { cn } from "@/lib/utils"

/** Identical visual language for input level and output playback; no fake input activity. */
export function CallAudio({ level = 0, speaking = false, active = false, label }: { level?: number; speaking?: boolean; active?: boolean; label: string }) {
  return <div role="img" aria-label={label} className={cn("call-audio flex h-6 items-center justify-center gap-0.5", speaking && "call-audio-speaking")}>
    {Array.from({ length: 28 }, (_, index) => <span key={index} aria-hidden="true" className={cn("w-0.5 rounded-full bg-muted-foreground", (active || speaking) && "bg-primary")} style={{ height: `${active ? Math.max(3, level * 24 * (0.35 + 0.65 * Math.abs(Math.sin(index * 1.7)))) : 3}px`, animationDelay: `${(index % 7) * -0.13}s` }} />)}
  </div>
}
