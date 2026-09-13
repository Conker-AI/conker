import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Copy, CornerUpLeft, FileSearch, GitFork, Lightbulb, MoreHorizontal, Pencil, Pin, RotateCcw, Share2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { ConversationMessage } from "@/lib/api/conversation-types"
import type { Session } from "@/lib/api/models"
import { conkerClient } from "@/lib/api"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import { useConker, useConkerStore } from "@/lib/api/store"
import { useConversationWorkspace } from "@/lib/conversation-workspace"

export function MessageActions({ session, message }: { session: Session; message: ConversationMessage }) {
  const configuration = useConker(data => data.modelsConfiguration)
  const models = getAvailableModels(configuration)
  const mainId = useConker(data => data.companionSessionId)
  const pending = useConkerStore(state => state.pending)
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const { setReply, openRail, retry, notify } = useConversationWorkspace()
  const mutate = useConkerStore(state => state.mutate)
  const [dialog, setDialog] = useState<"edit" | "redact" | null>(null)
  const [text, setText] = useState(message.text)
  const focusComposer = useRef(false)
  const navigate = useNavigate()
  const busy = pending || !!streaming || !!session.archived
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); notify(session.id, label) }
    catch { notify(session.id, "Clipboard unavailable. Select the message text to copy it.") }
  }
  const update = (patch: Parameters<typeof conkerClient.updateMessage>[2]) => mutate(() => conkerClient.updateMessage(session.id, message.id, patch))

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button data-home="message" variant="ghost" size="icon" className="size-8 text-muted-foreground sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`Message actions: ${message.role === "user" ? "your message" : "companion response"}`} title="Message actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onCloseAutoFocus={event => {
        if (focusComposer.current) { event.preventDefault(); focusComposer.current = false; document.getElementById("message-composer")?.focus() }
      }}>
        <DropdownMenuItem disabled={busy || message.redacted} onSelect={() => { setReply(session.id, message.id); focusComposer.current = true }}><CornerUpLeft />Reply</DropdownMenuItem>
        <DropdownMenuItem disabled={busy || message.redacted} onSelect={async () => {
          let fork: Session | undefined
          if (await mutate(async () => { fork = await conkerClient.forkConversation(session.id, message.id) })) {
            if (fork) navigate(`/chat/${fork.id}`)
          }
        }}><GitFork />Fork from here</DropdownMenuItem>
        <DropdownMenuItem disabled={message.redacted} onSelect={() => void copy(message.text, "Message copied.")}><Copy />Copy</DropdownMenuItem>
        <DropdownMenuItem disabled={message.redacted} onSelect={() => void copy(`${location.origin}${session.id === mainId ? "/companion" : `/chat/${session.id}`}#${encodeURIComponent(message.id)}`, "Local preview link copied. It is available only while this preview data exists.")}><Share2 />Share link</DropdownMenuItem>
        <DropdownMenuSub><DropdownMenuSubTrigger disabled={busy || message.redacted || message.role !== "assistant" || !models.length}><RotateCcw />Retry with model</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-w-72">{models.map(model => <DropdownMenuItem key={model.id} onSelect={() => void retry(session.id, message.id, model.id)}>{model.name}<span className="ml-auto text-xs text-muted-foreground">{model.providerId}</span></DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy || message.redacted} onSelect={() => void update({ pinned: !message.pinned })}><Pin />{message.pinned ? "Unpin message" : "Pin message"}</DropdownMenuItem>
        <DropdownMenuItem disabled={busy || message.redacted} onSelect={() => { setText(message.text); setDialog("edit") }}><Pencil />Edit message</DropdownMenuItem>
        <DropdownMenuItem disabled={busy || message.redacted} variant="destructive" onSelect={() => setDialog("redact")}><Trash2 />Delete / redact</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openRail(session.id, "explain", message.id)}><Lightbulb />Explain</DropdownMenuItem>
        <DropdownMenuItem disabled={message.redacted} onSelect={() => openRail(session.id, "source", message.id)}><FileSearch />Open source</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}><DialogContent>
      <DialogHeader><DialogTitle>{dialog === "edit" ? "Edit message" : "Redact this message?"}</DialogTitle><DialogDescription>{dialog === "edit" ? "Edits are marked in this preview. They do not regenerate the conversation or repeat tools." : "The text and its source are removed from this conversation. A redacted marker remains. Existing forks are separate copies."}</DialogDescription></DialogHeader>
      {dialog === "edit" ? <form className="space-y-4" onSubmit={async event => { event.preventDefault(); if (await update({ text })) setDialog(null) }}><Label htmlFor={`edit-${message.id}`}>Message text</Label><Textarea id={`edit-${message.id}`} value={text} onChange={event => setText(event.target.value)} maxLength={4000} rows={5} /><DialogFooter><Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy || !text.trim()}>Save message</Button></DialogFooter></form>
        : <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (await update({ redacted: true })) setDialog(null) }}>Redact message</Button></DialogFooter>}
    </DialogContent></Dialog>
  </>
}
