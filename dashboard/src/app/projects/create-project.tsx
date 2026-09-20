import { useEffect, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ConfirmationDialog, FormActions, OverlayBody, TaskDialogContent } from "@/components/design-system"
import { useConkerStore } from "@/lib/api/store"
import type { ProjectClient, ProjectInput } from "@/lib/api/project-types"
import { emptyProject } from "./format"
import { ProjectFields } from "./shared"
import { takeMutationError } from "./feedback"

let draft: ProjectInput | null = null
export function CreateProject({ client, onClose, onCreated }: { client: ProjectClient; onClose: () => void; onCreated: () => void }) {
  const [value, setValue] = useState(() => draft ?? { ...emptyProject })
  const [discard, setDiscard] = useState(false)
  const [error, setError] = useState("")
  const { pending, mutate } = useConkerStore()
  const dirty = JSON.stringify(value) !== JSON.stringify(emptyProject)
  useEffect(() => { draft = dirty ? value : null }, [dirty, value])
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn) }, [dirty])
  const close = () => { if (!pending) { if (dirty) setDiscard(true); else onClose() } }
  return <><Dialog open onOpenChange={open => { if (!open) close() }}><TaskDialogContent title="New project" description="Group existing chats, tasks and file references. Add instructions and links after creation. Changes reset on reload." onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }} showCloseButton={!pending}>
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); if (pending) return; void (async () => { const saved = await mutate(() => client.create(value), "Project created in preview. Open it to link existing work."); if (saved) { draft = null; onCreated() } else setError(takeMutationError()) })() }}>
      <OverlayBody><fieldset disabled={pending}><ProjectFields value={value} onChange={setValue} instructions={false} /></fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody>
      <FormActions inset><Button type="button" variant="outline" onClick={close} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || !value.name.trim()}>{pending ? "Creating…" : "Create preview project"}</Button></FormActions>
    </form>
  </TaskDialogContent></Dialog><ConfirmationDialog open={discard} onOpenChange={setDiscard} title="Discard this project draft?" description="The name and description you entered will be discarded." actionLabel="Discard draft" pending={false} onConfirm={() => { draft = null; onClose() }} /></>
}
