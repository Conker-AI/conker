import { useId, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import type { CharacterAsset } from "@/lib/api/character"

export function StudioSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId()
  return <section aria-labelledby={id} className="space-y-5 border-b pb-6"><header className="space-y-1"><h2 id={id} className="text-base font-semibold">{title}</h2>{description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}</header><div className="space-y-5">{children}</div></section>
}
export function StudioField({ label, hint, value, onChange, multiline = true, placeholder, maxLength = 6000 }: { label: string; hint?: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string; maxLength?: number }) {
  const id = useId()
  const props = { id, value, maxLength, placeholder, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), "aria-describedby": hint ? `${id}-hint` : undefined }
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{multiline ? <Textarea {...props} rows={4} /> : <Input {...props} />}{hint && <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">{hint}</p>}</div>
}
export function AssetPicker({ label, value, assets, onChange }: { label: string; value: string | null; assets: CharacterAsset[]; onChange: (value: string | null) => void }) {
  const id = useId()
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Select value={value || "main"} onValueChange={next => onChange(next === "main" ? null : next)}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="main">Main portrait</SelectItem>{assets.map(asset => <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>)}</SelectContent></Select></div>
}
