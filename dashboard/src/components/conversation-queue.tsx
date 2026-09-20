import { useState } from "react"
import { ConversationAttachments } from "@/components/conversation-attachments"
import { researchLabel } from "@/lib/conversation-research"
import { ListOrdered, Pause, Pencil, Play, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FormActions, OverlayBody, TaskDialogContent } from "@/components/design-system"
import { MAX_QUEUED_TURNS, type QueuedTurn, type TurnQueue } from "@/lib/conversation-continuity"

type Props = {
  queue?: TurnQueue
  busy?: boolean
  activeEntryId?: string
  onPause: () => void
  onResume: () => void
  onRemove: (id: string) => void
  onEdit: (id: string, text: string) => boolean
  /** Explicitly recapture current model, privacy, context, agent and authority after user review. */
  onReview: (id: string) => boolean
}

function privacyLabel(entry: QueuedTurn) {
  if (entry.privacy.memoryDisabled && entry.privacy.harnessDisabled) return "No memory or harness"
  if (entry.privacy.memoryDisabled) return "No memory"
  if (entry.privacy.harnessDisabled) return "No harness"
  return "Standard privacy"
}

export function ConversationQueue({ queue, busy, activeEntryId, onPause, onResume, onRemove, onEdit, onReview }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [text, setText] = useState("")
  const editing = queue?.entries.find(entry => entry.id === editingId)
  const canSave = !!text.trim() || !!editing?.attachments?.length
  if (!queue?.entries.length) return null
  return <section aria-label="Queued messages" className="mb-2 overflow-hidden rounded-lg border bg-card text-card-foreground">
    <div className="flex min-h-10 items-center gap-2 px-3">
      <ListOrdered className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-xs font-medium">{queue.entries.length} queued{queue.paused ? " · Paused" : " · Sends after this response"}</span>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={queue.paused ? onResume : onPause}>{queue.paused ? <Play /> : <Pause />}{queue.paused ? "Resume" : "Pause"}</Button>
    </div>
    {queue.reason && <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">{queue.reason}</p>}
    <ol className="max-h-40 overflow-y-auto border-t divide-y divide-border">
      {queue.entries.map((entry, index) => <li key={entry.id} className="flex min-w-0 items-start gap-2 px-3 py-2">
        <span className="min-w-4 pt-1 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p dir="auto" className="line-clamp-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{entry.text}</p>
          <ConversationAttachments attachments={entry.attachments} />
          {entry.researchMode && entry.researchMode !== "off" && <p className="mt-1 text-xs text-muted-foreground">{researchLabel(entry.researchMode)} · Preview</p>}
          <p className="mt-1 truncate text-xs text-muted-foreground">{entry.modelLabel} · {privacyLabel(entry)}{entry.sentMessageId ? " · Saved; reply pending" : ""}</p>
        </div>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-(--control-height-sm) shrink-0" disabled={busy || activeEntryId === entry.id} aria-label={`Edit queued message ${index + 1}`} onClick={() => { onPause(); setText(entry.text); setEditingId(entry.id) }}><Pencil /></Button></TooltipTrigger><TooltipContent>Edit queued message</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-(--control-height-sm) shrink-0" disabled={busy || activeEntryId === entry.id} aria-label={`Remove queued message ${index + 1}`} onClick={() => onRemove(entry.id)}><X /></Button></TooltipTrigger><TooltipContent>Remove from queue</TooltipContent></Tooltip>
      </li>)}
    </ol>
    {queue.entries.length >= MAX_QUEUED_TURNS && <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">Queue full. Edit or remove a message to make room.</p>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditingId(null) }}>
      <TaskDialogContent title="Edit queued message" description="This changes an unsent turn, not the response being written." onInteractOutside={event => event.preventDefault()}>
        <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); if (editing && canSave && onEdit(editing.id, text)) setEditingId(null) }}>
          <OverlayBody className="space-y-4">
            {editing?.researchMode && editing.researchMode !== "off" && <p className="text-xs text-muted-foreground">{researchLabel(editing.researchMode)} · Preview · retained with this queued message</p>}
            <ConversationAttachments attachments={editing?.attachments} />
            <div className="space-y-2"><Label htmlFor="queued-message-edit">Message</Label><Textarea id="queued-message-edit" value={text} onChange={event => setText(event.target.value)} rows={5} maxLength={4000} disabled={!!editing?.sentMessageId} /></div>
            {editing && <div className="space-y-2 text-xs text-muted-foreground"><p>{editing.modelLabel} · {privacyLabel(editing)} · {editing.presentationMode === "character" ? "Character" : "Focus"}</p><p>{editing.sentMessageId ? "The message is already in the conversation. Remove it from the queue to edit or fork its saved message." : "Model, privacy and context stay as captured. If settings changed, explicitly update this entry before resuming."}</p>{!editing.sentMessageId && <Button type="button" variant="outline" size="sm" onClick={() => { if (onEdit(editing.id, text) && onReview(editing.id)) setEditingId(null) }} disabled={!canSave || busy}>Use current chat settings</Button>}</div>}
          </OverlayBody>
          <FormActions inset><Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button><Button disabled={!canSave || busy || !!editing?.sentMessageId}>Save message</Button></FormActions>
        </form>
      </TaskDialogContent>
    </Dialog>
  </section>
}
