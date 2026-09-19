import { useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { TaskDialogContent, OverlayBody, FormActions } from "@/components/design-system"
import type { Memory } from "@/lib/api/models"
import { normalizeMemoryInput, memoryTitle } from "@/lib/memory-explorer"
import { conkerClient } from "@/lib/api"
import { useConkerStore } from "@/lib/api/store"

export function MemoryEditor({ memory, onClose, onSaved }: { memory?: Memory; onClose: () => void; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState(memory ? memoryTitle(memory) : "")
  const [text, setText] = useState(memory?.text || "")
  const [category, setCategory] = useState(memory?.category || "Notes")
  const [tags, setTags] = useState(memory?.tags?.join(", ") || "")
  const [error, setError] = useState("")
  const pending = useConkerStore(state => state.pending)
  const mutate = useConkerStore(state => state.mutate)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    try {
      const input = normalizeMemoryInput({ title, text, category, tags: tags.split(",") })
      let savedId = ""
      const success = await mutate(async () => { const saved = memory ? await conkerClient.saveMemory(memory.id, input) : await conkerClient.createMemory(input); savedId = saved.id }, "Saved in preview. Reloading restores the sample records.")
      if (success) onSaved(savedId)
      else setError(useConkerStore.getState().error || "Could not save. Try again.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the fields and try again.") }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><TaskDialogContent title={memory ? "Edit memory" : "New memory"} description="Preview only · changes stay in this tab and reset on reload. Original sources are never changed." size="wide" showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }}>
    <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-col">
      <OverlayBody><fieldset disabled={pending} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="memory-title">Title</Label><Input id="memory-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={100} /></div>
        <div className="space-y-2"><Label htmlFor="memory-text">Memory text</Label><Textarea id="memory-text" value={text} onChange={event => setText(event.target.value)} required maxLength={16000} rows={5} /></div>
        <div className="space-y-2"><Label htmlFor="memory-category">Category</Label><Input id="memory-category" value={category} onChange={event => setCategory(event.target.value)} required maxLength={50} /></div>
        <div className="space-y-2"><Label htmlFor="memory-topics">Topics</Label><Input id="memory-topics" value={tags} onChange={event => setTags(event.target.value)} aria-describedby="memory-topics-help" /><p id="memory-topics-help" className="text-xs text-muted-foreground">Separate up to 8 topics with commas. Shared topics connect records in the graph.</p></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </fieldset></OverlayBody>
      <FormActions inset><Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save preview"}</Button></FormActions>
    </form>
  </TaskDialogContent></Dialog>
}
