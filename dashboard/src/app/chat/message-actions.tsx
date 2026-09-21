import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, Copy, CornerUpLeft, FileSearch, FileBox, GitFork, Info, MoreHorizontal, Pencil, Pin, RotateCcw, Share2, Square, ThumbsDown, ThumbsUp, Trash2, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { MessageActionButton as ActionButton } from "@/components/message-action-button"
import { useReadAloud } from "@/hooks/use-read-aloud"
import { cn } from "@/lib/utils"
import { Dialog } from "@/components/ui/dialog"
import { TaskDialogContent, OverlayBody, FormActions, ConfirmationDialog } from "@/components/design-system"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { ConversationMessage } from "@/lib/api/conversation-types"
import type { Session } from "@/lib/api/models"
import { conkerClient } from "@/lib/api"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import { useConker, useConkerStore } from "@/lib/api/store"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import { hasDownstreamMessages } from "@/lib/conversation-continuity"
import { readableAnswer } from "@/lib/rich-answer"
import { SaveResponseArtifact } from "./save-response-artifact"
import { useArtifactWorkspace } from "@/lib/artifact-workspace"


export function MessageActions({ session, message }: { session: Session; message: ConversationMessage }) {
  const configuration = useConker(data => data.modelsConfiguration)
  const models = getAvailableModels(configuration)
  const mainId = useConker(data => data.companionSessionId)
  const conversationModelId = useConker(data => data.conversations[session.id].modelId)
  const messages = useConker(data => data.conversations[session.id].messages)
  const artifacts = useConker(data => data.artifacts).filter(artifact => artifact.source?.sessionId === session.id && artifact.source.messageId === message.id && !artifact.archivedAt)
  const [savingArtifact, setSavingArtifact] = useState(false)
  const pending = useConkerStore(state => state.pending)
  const error = useConkerStore(state => state.error)
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const { setReply, openRail, retry, notify } = useConversationWorkspace()
  const mutate = useConkerStore(state => state.mutate)
  const [dialog, setDialog] = useState<"edit" | "redact" | null>(null)
  const [text, setText] = useState(message.text)
  const [copied, setCopied] = useState<"text" | "link" | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const speech = useReadAloud(`${session.id}:${message.id}`, message.redacted ? "" : message.role === "assistant" ? readableAnswer(message.text) : message.text)
  const focusComposer = useRef(false)
  const focusReference = useRef(false)
  const actionGroup = useRef<HTMLDivElement>(null)
  const restoreFocus = (event: Event) => { event.preventDefault(); actionGroup.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus() }
  const navigate = useNavigate()
  const busy = pending || !!streaming || !!session.archived
  const assistant = message.role === "assistant"
  const retryModelId = message.modelId || conversationModelId || configuration.defaultModelId
  const canRetry = models.some(model => model.id === retryModelId)
  const editNeedsFork = hasDownstreamMessages(messages, message.id)
  useEffect(() => () => { clearTimeout(copyTimer.current) }, [])
  const copy = async (value: string, kind: "text" | "link") => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(null), 1800)
      notify(session.id, kind === "text" ? "Message copied." : "Local preview link copied. It is available only while this preview data exists.")
    }
    catch { notify(session.id, "Clipboard unavailable. Select the message text to copy it.") }
  }
  const update = (patch: Parameters<typeof conkerClient.updateMessage>[2]) => mutate(() => conkerClient.updateMessage(session.id, message.id, patch))

  const speak = () => speech.toggle(error => notify(session.id, error))
  const edit = () => { setText(message.text); setDialog("edit") }
  const reply = () => { setReply(session.id, message.id); document.getElementById("message-composer")?.focus() }

  return <div ref={actionGroup} data-home="message" role="group" aria-label={assistant ? "Response actions" : "Message actions"} className={cn("mt-2 flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5", !assistant && "justify-end")}>
    <div className="flex shrink-0 items-center gap-0.5">
      <ActionButton label={copied === "text" ? "Copied" : "Copy message"} disabled={message.redacted || !message.text} onClick={() => void copy(message.text, "text")}>{copied === "text" ? <Check /> : <Copy />}</ActionButton>
      {assistant ? <>
        <ActionButton label={speech.active ? "Stop reading" : "Read aloud"} aria-pressed={speech.active} disabled={message.redacted || !message.text || !speech.supported} onClick={speak}>{speech.active ? <Square /> : <Volume2 />}</ActionButton>
        <ActionButton label="Good response" aria-pressed={message.rating === "up"} disabled={busy || message.redacted} onClick={() => void update({ rating: message.rating === "up" ? null : "up" })}><ThumbsUp /></ActionButton>
        <ActionButton label="Bad response" aria-pressed={message.rating === "down"} disabled={busy || message.redacted} onClick={() => void update({ rating: message.rating === "down" ? null : "down" })}><ThumbsDown /></ActionButton>
        <ActionButton label="Try again" disabled={busy || message.redacted || !canRetry} onClick={() => { if (retryModelId) void retry(session.id, message.id, retryModelId) }}><RotateCcw /></ActionButton>
      </> : <>
        <ActionButton label="Edit message" disabled={busy || message.redacted} onClick={edit}><Pencil /></ActionButton>
        <ActionButton label="Reply to message" disabled={busy || message.redacted} onClick={reply}><CornerUpLeft /></ActionButton>
      </>}
      <ActionButton label={copied === "link" ? "Link copied" : "Share message"} disabled={message.redacted} onClick={() => void copy(`${location.origin}${session.id === mainId ? "/companion" : `/chat/${session.id}`}#${encodeURIComponent(message.id)}`, "link")}>{copied === "link" ? <Check /> : <Share2 />}</ActionButton>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><ActionButton label="More message actions"><MoreHorizontal /></ActionButton></DropdownMenuTrigger>
      <DropdownMenuContent align={assistant ? "start" : "end"} className="w-56" onCloseAutoFocus={event => {
        if (focusComposer.current) { event.preventDefault(); focusComposer.current = false; document.getElementById("message-composer")?.focus() }
        if (focusReference.current) { event.preventDefault(); focusReference.current = false }
      }}>
        {assistant && <DropdownMenuItem disabled={busy || message.redacted} onSelect={() => { setReply(session.id, message.id); focusComposer.current = true }}><CornerUpLeft />Reply</DropdownMenuItem>}
        <DropdownMenuItem disabled={busy || message.redacted} onSelect={async () => {
          let fork: Session | undefined
          if (await mutate(async () => { fork = await conkerClient.forkConversation(session.id, message.id) })) {
            if (fork) navigate(`/chat/${fork.id}`)
          }
        }}><GitFork />Fork from here</DropdownMenuItem>
        {assistant ? <DropdownMenuSub><DropdownMenuSubTrigger disabled={busy || message.redacted || !models.length}><RotateCcw />Retry with model</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-80 max-w-72 overflow-y-auto">{models.map(model => <DropdownMenuItem key={model.id} onSelect={() => void retry(session.id, message.id, model.id)}>{model.name}<span className="ml-auto text-xs text-muted-foreground">{model.providerId}</span></DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub> : <DropdownMenuItem disabled={message.redacted || !message.text || !speech.supported} onSelect={speak}><Volume2 />{speech.active ? "Stop reading" : "Read aloud"}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        {assistant && <DropdownMenuItem disabled={busy || message.redacted || message.status !== "complete" || !message.text} onSelect={() => setSavingArtifact(true)}><FileBox />Save to artifacts</DropdownMenuItem>}
        {artifacts.length > 0 && <DropdownMenuSub><DropdownMenuSubTrigger><FileBox />Open artifact</DropdownMenuSubTrigger><DropdownMenuSubContent>{artifacts.map(artifact => <DropdownMenuItem key={artifact.id} onSelect={() => { useConversationWorkspace.getState().closeRail(session.id); useArtifactWorkspace.getState().open(session.id, artifact.id) }}>{artifact.title}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>}
        <DropdownMenuItem disabled={busy || message.redacted} onSelect={() => void update({ pinned: !message.pinned })}><Pin />{message.pinned ? "Unpin message" : "Pin message"}</DropdownMenuItem>
        {assistant && <DropdownMenuItem disabled={busy || message.redacted} onSelect={edit}><Pencil />Edit message</DropdownMenuItem>}
        <DropdownMenuItem disabled={busy || message.redacted} variant="destructive" onSelect={() => setDialog("redact")}><Trash2 />Delete / redact</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { focusReference.current = true; openRail(session.id, "explain", message.id) }}><Info />Message info</DropdownMenuItem>
        <DropdownMenuItem disabled={message.redacted} onSelect={() => { focusReference.current = true; openRail(session.id, "source", message.id) }}><FileSearch />Open source</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
    <div className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      {message.edited && <span>Edited</span>}{message.pinned && <Pin className="size-3" aria-label="Pinned" />}
    </div>
    {savingArtifact && <SaveResponseArtifact sessionId={session.id} message={message} onClose={() => setSavingArtifact(false)} />}
    <Dialog open={dialog === "edit"} onOpenChange={open => { if (!open && !pending) setDialog(null) }}>
      <TaskDialogContent title={editNeedsFork ? "Edit in a new fork" : "Edit message"} description={editNeedsFork ? "Later replies used the original words. Save this edit in a new conversation ending here; the existing conversation stays intact." : "Edits are marked in this preview. They do not regenerate the conversation or repeat tools."}
        onCloseAutoFocus={restoreFocus} onInteractOutside={event => event.preventDefault()} showCloseButton={!pending}>
        <form className="flex min-h-0 flex-col" onSubmit={async event => {
          event.preventDefault()
          if (!editNeedsFork) { if (await update({ text })) setDialog(null); return }
          let fork: Session | undefined
          if (await mutate(async () => {
            fork = await conkerClient.forkConversation(session.id, message.id)
            await conkerClient.updateMessage(fork.id, message.id, { text })
          })) {
            setDialog(null)
            if (fork) navigate(`/chat/${fork.id}`)
          }
        }}>
          <OverlayBody><div className="space-y-2"><Label htmlFor={`edit-${message.id}`}>Message text</Label><Textarea id={`edit-${message.id}`} value={text} onChange={event => setText(event.target.value)} maxLength={4000} rows={5} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody>
          <FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy || !text.trim()}>{editNeedsFork ? "Save in new fork" : "Save message"}</Button></FormActions>
        </form>
      </TaskDialogContent>
    </Dialog>
    <ConfirmationDialog open={dialog === "redact"} onOpenChange={open => { if (!open) setDialog(null) }} title="Redact this message?"
      description="The text and its source are removed from this conversation. A redacted marker remains. Existing forks are separate copies."
      actionLabel="Redact message" pending={busy} error={error} onCloseAutoFocus={restoreFocus} onConfirm={async () => { if (await update({ redacted: true })) setDialog(null) }}>
      <p className="line-clamp-3 text-sm text-muted-foreground">{message.text}</p>
    </ConfirmationDialog>
  </div>
}
