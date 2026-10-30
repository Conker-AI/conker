import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { createToolDefinition } from '@/lib/tool-workspace'
import type { GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'

/** New tool, by hand: a name saves an empty draft and opens it in the editor. Nothing runs yet. */
export function NewToolDialog({ drafts, open, onOpenChange }: { drafts: Pick<GatewayEditorDrafts, 'save'>; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  async function create() {
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    try {
      const value = await drafts.save(createToolDefinition(`tool-${crypto.randomUUID()}`, name.trim()), 0, lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return
      onOpenChange(false); setName('')
      navigate(`/tools?draft=${encodeURIComponent(value.id)}`)
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not create the tool.') }
    finally { if (!lifetime.current?.signal.aborted) setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
    <TaskDialogContent title="New tool" description="Name it, then build its steps in the editor. Nothing runs or reaches Conker until you publish it.">
      <form noValidate onSubmit={event => { event.preventDefault(); void create() }}>
        <OverlayBody className="flex flex-col gap-2"><Label htmlFor="new-tool-name">Name</Label><Input id="new-tool-name" value={name} maxLength={100} disabled={busy} placeholder="Study group digest" onChange={event => setName(event.target.value)} />{error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}</OverlayBody>
        <FormActions inset><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create tool'}</Button></FormActions>
      </form>
    </TaskDialogContent>
  </Dialog>
}
