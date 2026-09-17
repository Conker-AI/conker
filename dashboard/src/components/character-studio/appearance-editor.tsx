import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CompanionPortrait } from "@/components/companion-portrait"
import { StudioSection, StudioField, AssetPicker } from "./fields"
import { readCharacterFile } from "@/lib/character-media"
import { activityNames, removeCharacterAsset, type CharacterDraft } from "@/lib/api/character"

export function AppearanceEditor({ profile, update, onBusy }: { profile: CharacterDraft; update: (profile: CharacterDraft | ((current: CharacterDraft) => CharacterDraft)) => void; onBusy: (busy: boolean) => void }) {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [expressionName, setExpressionName] = useState("")
  const appearance = profile.studio.appearance
  const change = (patch: Partial<typeof appearance>) => update({ ...profile, studio: { ...profile.studio, appearance: { ...appearance, ...patch } } })
  async function upload(file: File | undefined, portrait: boolean) {
    if (!file) return
    setError(""); setLoading(true); onBusy(true)
    try {
      const src = await readCharacterFile(file, portrait ? "image" : "asset")
      if (portrait) update(current => ({ ...current, portrait: src }))
      else update(current => ({ ...current, studio: { ...current.studio, appearance: { ...current.studio.appearance, assets: [...current.studio.appearance.assets, { id: crypto.randomUUID(), name: file.name.slice(0, 120), src, kind: file.type.startsWith("video/") ? "video" : "image" }] } } }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this asset.") } finally { setLoading(false); onBusy(false) }
  }
  return <div className="space-y-6">
    <StudioSection title="Appearance" description="Give your character a visual identity, then build its expressions and movement.">
      <StudioField label="Appearance description" value={appearance.description} onChange={description => change({ description })} placeholder="Describe the face, silhouette, clothing, materials, and details that make this character yours." hint="A brief for your artwork. Image generation is not connected." />
      <div className="flex items-center gap-4"><CompanionPortrait profile={profile} className="size-20" /><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="main-portrait">Main portrait</Label><Input id="main-portrait" type="file" accept="image/png,image/jpeg,image/webp" disabled={loading} onChange={event => { void upload(event.target.files?.[0], true); event.target.value = "" }} /><p className="text-xs leading-5 text-muted-foreground">PNG, JPEG or WebP · 2 MB. The full artwork stays visible.</p></div></div>
      <div className="flex flex-wrap items-end gap-3"><div className="w-40 space-y-2"><Label htmlFor="portrait-inset">Portrait inset (%)</Label><Input id="portrait-inset" type="number" min={12.5} max={25} step={0.5} value={appearance.inset} onChange={event => change({ inset: Math.min(25, Math.max(12.5, Number(event.target.value))) })} /></div><Button type="button" variant="outline" onClick={() => { update({ ...profile, portrait: "/conker.png", studio: { ...profile.studio, appearance: { ...appearance, inset: 12.5 } } }) }}>Restore Conker portrait</Button></div>
    </StudioSection>
    <StudioSection title="Artwork library" description="Reuse images and short, silent animation loops across activities and expressions.">
      <div className="space-y-2"><Label htmlFor="character-assets">Add artwork</Label><Input id="character-assets" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" disabled={loading || appearance.assets.length >= 16} onChange={event => { void upload(event.target.files?.[0], false); event.target.value = "" }} /><p className="text-xs leading-5 text-muted-foreground">Images up to 2 MB · MP4/WebM up to 8 MB · 16 assets maximum. Saved in this preview; export to keep a copy.</p></div>
      {loading && <p role="status" className="text-sm text-muted-foreground">Checking your file…</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {appearance.assets.length ? <div className="divide-y">{appearance.assets.map(asset => <div key={asset.id} className="flex min-w-0 items-center gap-3 py-3"><div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">{asset.kind === "image" ? <img src={asset.src} alt="" className="size-3/4 object-contain" /> : <video src={asset.src} muted preload="metadata" className="size-3/4 object-contain" />}</div><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{asset.name}</p><p className="text-xs text-muted-foreground">{asset.kind === "video" ? "Animation loop" : "Still image"}</p></div><Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Remove ${asset.name}`} onClick={() => update({ ...profile, studio: removeCharacterAsset(profile.studio, asset.id) })}><Trash2 /></Button></div>)}</div> : <p className="text-sm leading-6 text-muted-foreground">Add your first image or animation. Every state already falls back to the main portrait.</p>}
    </StudioSection>
    <StudioSection title="Activities" description="What your companion is doing. Assign artwork to each state independently."><div className="grid gap-4 sm:grid-cols-2">{activityNames.map(activity => <AssetPicker key={activity} label={activity.charAt(0).toUpperCase() + activity.slice(1)} value={appearance.activities[activity]} assets={appearance.assets} onChange={value => change({ activities: { ...appearance.activities, [activity]: value } })} />)}</div></StudioSection>
    <StudioSection title="Expressions" description="Name your own expressions and describe when they fit. No personality presets.">
      <div className="flex items-end gap-2"><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="new-expression">Expression name</Label><Input id="new-expression" value={expressionName} maxLength={60} placeholder="For example, quietly amused" onChange={event => setExpressionName(event.target.value)} /></div><Button type="button" variant="outline" disabled={!expressionName.trim() || appearance.expressions.length >= 16} onClick={() => { change({ expressions: [...appearance.expressions, { id: crypto.randomUUID(), name: expressionName.trim(), instruction: "", assetId: null }] }); setExpressionName("") }}><Plus />Add</Button></div>
      {appearance.expressions.map(expression => <div key={expression.id} className="space-y-4 border-t pt-4"><div className="flex items-center justify-between gap-3"><h3 className="break-words text-sm font-medium">{expression.name}</h3><Button type="button" size="icon" className="size-8" variant="ghost" aria-label={`Remove expression ${expression.name}`} onClick={() => change({ expressions: appearance.expressions.filter(item => item.id !== expression.id) })}><Trash2 /></Button></div><StudioField label={`When to use ${expression.name}`} value={expression.instruction} maxLength={500} onChange={instruction => change({ expressions: appearance.expressions.map(item => item.id === expression.id ? { ...item, instruction } : item) })} /><AssetPicker label={`${expression.name} artwork`} assets={appearance.assets} value={expression.assetId} onChange={assetId => change({ expressions: appearance.expressions.map(item => item.id === expression.id ? { ...item, assetId } : item) })} /></div>)}
      <p className="text-xs leading-5 text-muted-foreground">An assigned expression takes priority over activity artwork in the preview. 3D models and lip sync are a later integration.</p>
    </StudioSection>
  </div>
}
