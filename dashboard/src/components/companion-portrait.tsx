import { cn } from "@/lib/utils"
import type { Character, Emotion, Face, PortraitTone } from "@/lib/api/client"

export function CompanionPortrait({ className, name = "Conker", portrait, face = "sprout", tone = "green", emotion = "neutral", profile }: {
  className?: string; name?: string; portrait?: string; face?: Face; tone?: PortraitTone; emotion?: Emotion; profile?: Character
}) {
  if (profile) {
    name = profile.name; tone = profile.tone; face = profile.face; portrait = profile.portrait
    const mapping = profile.emotions[emotion]
    if (mapping && mapping !== "default" && mapping !== "portrait") { face = mapping; portrait = "" }
  }

  // Keep the artwork inset by one eighth on every side at every avatar size.
  // Contain the complete photo so ears, edges, and non-square uploads stay visible.
  if (portrait) {
    return (
      <div
        role="img"
        aria-label={`${name} ${emotion} portrait`}
        className={cn(
          "border-border bg-muted/40 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border",
          className,
        )}
      >
        <img
          src={portrait}
          alt=""
          className="size-3/4 object-contain"
        />
      </div>
    )
  }

  return <div role="img" aria-label={`${name} ${emotion} portrait`} className={cn(
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border",
    tone === "green" ? "border-primary/30 bg-primary/15 text-primary" : tone === "soft" ? "border-primary/20 bg-primary/5 text-primary/70" : "border-border bg-muted text-foreground",
    className,
  )}>
    <svg viewBox="0 0 100 100" className="size-3/4" aria-hidden="true">
      {face === "sprout" && <><path d="M49 30C43 13 62 6 74 13C69 28 59 30 49 30Z" fill="currentColor" opacity=".7" /><path d="M49 30C49 18 36 13 27 19C30 30 41 33 49 30Z" fill="currentColor" opacity=".4" /></>}
      {face === "cat" && <path d="M23 47L19 17L42 33M58 33L81 17L77 47" fill="currentColor" opacity=".5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
      <path d={face === "round" ? "M17 53a33 33 0 1 0 66 0a33 33 0 1 0-66 0" : "M19 51C19 25 81 25 81 51V66C81 91 19 91 19 66Z"} fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth="2" />
      <path d={emotion === "happy" || emotion === "celebrating" ? "M31 54q5-8 10 0m18 0q5-8 10 0" : "M36 51v7m28-7v7"} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d={emotion === "concerned" ? "M43 72q7-7 14 0" : emotion === "thinking" ? "M46 71h10" : "M42 69q8 9 16 0"} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="29" cy="65" rx="5" ry="3" fill="currentColor" opacity=".22" /><ellipse cx="71" cy="65" rx="5" ry="3" fill="currentColor" opacity=".22" />
    </svg>
  </div>
}
