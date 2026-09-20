import { useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { FormActions, OverlayBody, TaskDialogContent } from "@/components/design-system"
import { SearchableSelect } from "@/app/activity/searchable-select"
import { conkerClient } from "@/lib/api"
import type { ConversationMessage } from "@/lib/api/conversation-types"
import { useConker, useConkerStore } from "@/lib/api/store"
import { useArtifactWorkspace } from "@/lib/artifact-workspace"
import { useConversationWorkspace } from "@/lib/conversation-workspace"

export function SaveResponseArtifact({ sessionId, message, onClose }: { sessionId: string; message: ConversationMessage; onClose: () => void }) {
  const [title, setTitle] = useState(() => message.text.split("\n").find(line => line.trim())?.replace(/^#+\s*/, "").slice(0, 160) || "Saved response")
  const [taskId, setTaskId] = useState("")
  const [error, setError] = useState("")
  const tasks = useConker(data => data.tasks).filter(task => task.sessionId === sessionId && !task.archivedAt)
  const { pending, mutate } = useConkerStore()
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><TaskDialogContent title="Save response to artifacts" description="Copy the response text and citations with version history. Activity and interactive cards stay in the original conversation. Preview copies reset on reload." showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }}>
    <form className="flex min-h-0 flex-col" onSubmit={async event => {
      event.preventDefault()
      let artifactId: string | undefined
      const saved = await mutate(async () => { artifactId = (await conkerClient.artifacts.createFromMessage({ title, sessionId, messageId: message.id, ...(taskId ? { taskId } : {}) })).id }, "Response saved as a preview artifact.")
      if (saved && artifactId) { useConversationWorkspace.getState().closeRail(sessionId); useArtifactWorkspace.getState().open(sessionId, artifactId); onClose() }
      else { setError(useConkerStore.getState().error); useConkerStore.setState({ error: "" }) }
    }}><OverlayBody><fieldset disabled={pending} className="space-y-4"><div className="space-y-2"><Label htmlFor="artifact-response-title">Title</Label><Input id="artifact-response-title" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></div>{tasks.length > 0 && <div className="space-y-2"><Label htmlFor="artifact-response-task">Related task</Label><SearchableSelect id="artifact-response-task" label="Related task" value={taskId} onChange={setTaskId} options={[{ value: "", label: "No task link" }, ...tasks.map(task => ({ value: task.id, label: task.outcome }))]} disabled={pending} /></div>}<p className="text-xs text-muted-foreground">Source privacy stays attached. Redacting, deleting or changing the source hides this copy and its version history.</p></fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending || !title.trim()}>{pending ? "Saving…" : "Save and open canvas"}</Button></FormActions></form>
  </TaskDialogContent></Dialog>
}
