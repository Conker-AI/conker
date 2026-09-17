import { useEffect, useRef, useState } from "react"
import { CompanionPortrait } from "@/components/companion-portrait"
import type { CharacterActivity, CharacterDraft } from "@/lib/api/character"
import { cn } from "@/lib/utils"

export function CharacterMedia({ profile, activity = "idle", expressionId, motion = true, className }: { profile: CharacterDraft; activity?: CharacterActivity; expressionId?: string; motion?: boolean; className?: string }) {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const change = () => setReduced(media.matches)
    media.addEventListener("change", change)
    return () => media.removeEventListener("change", change)
  }, [])
  const appearance = profile.studio.appearance
  const expression = appearance.expressions.find(item => item.id === expressionId)
  const id = expression?.assetId || appearance.activities[activity]
  const asset = appearance.assets.find(item => item.id === id)
  const canAnimate = motion && !reduced
  useEffect(() => {
    const element = video.current
    if (!element) return
    if (canAnimate) void element.play().catch(() => {})
    else element.pause()
    return () => element.pause()
  }, [asset?.src, canAnimate])
  if (!asset || (asset.kind === "video" && !canAnimate)) return <CompanionPortrait profile={profile} className={className} />
  return <div role="img" aria-label={`${profile.name}, ${expression?.name || activity}`} className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted", className)}>
    {asset.kind === "image" ? <img src={asset.src} alt="" className="size-3/4 object-contain" style={{ width: `${100 - appearance.inset * 2}%`, height: `${100 - appearance.inset * 2}%` }} /> : <video ref={video} src={asset.src} muted loop playsInline preload="metadata" className="size-3/4 object-contain" style={{ width: `${100 - appearance.inset * 2}%`, height: `${100 - appearance.inset * 2}%` }} />}
  </div>
}

