import { useEffect, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { TaskDialogContent, OverlayBody, FormActions, ConfirmationDialog } from "@/components/design-system"
import { conkerClient } from "@/lib/api"
import { useConkerStore } from "@/lib/api/store"
import { agentInput } from "@/lib/api/agent-config"
import { AgentFields } from "./agent-fields"
import type { AgentInput } from "@/lib/api/models"

let creationDraft: AgentInput | null = null

export function CreateAgent({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [value, setValue] = useState(() => creationDraft || agentInput())
  const [error, setError] = useState("")
  const [discarding, setDiscarding] = useState(false)
  const { mutate, pending } = useConkerStore()
  const dirty = JSON.stringify(value) !== JSON.stringify(agentInput())
  useEffect(() => { creationDraft = dirty ? value : null }, [dirty, value])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const close = () => { if (pending) return; if (dirty) setDiscarding(true); else onClose() }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    let id = ""
    const saved = await mutate(async () => { id = (await conkerClient.createAgent(value)).id }, "Agent created in preview. Changes reset on reload.")
    if (saved) { creationDraft = null; onCreated(id) }
    else setError(useConkerStore.getState().error || "Could not create this agent.")
  }
  return <><Dialog open onOpenChange={open => { if (!open) close() }}><TaskDialogContent title="New agent" description="Create a specialist in this preview. Changes reset on reload. Configure tools and memory after creation." size="wide" showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }}>
    <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-col"><OverlayBody><fieldset disabled={pending}><AgentFields value={value} onChange={setValue} /></fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button disabled={pending} type="submit">{pending ? "Creating…" : "Create preview agent"}</Button></FormActions></form>
  </TaskDialogContent></Dialog><ConfirmationDialog open={discarding} onOpenChange={setDiscarding} title="Discard this agent draft?" description="The name, instructions and model selection entered here will be discarded." actionLabel="Discard draft" pending={false} onConfirm={() => { creationDraft = null; onClose() }} /></>
}
