import { useEffect, useRef, type RefObject } from "react"
import { Link, useLocation } from "react-router-dom"
import { ArrowUp, Check, ChevronDown, Keyboard, ListPlus, LoaderCircle, Mic, Paperclip, Phone, SlidersHorizontal, Square, X } from "lucide-react"
import { ConversationQueue } from "@/components/conversation-queue"
import { ConversationPreviewControls } from "@/components/conversation-preview-controls"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useVoiceTyping } from "@/hooks/use-voice-typing"
import { useConker, useConkerStore } from "@/lib/api/store"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import type { Session } from "@/lib/api/models"
import { MESSAGE_LIMIT } from "@/lib/voice/draft"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import { useCallWorkspace } from "@/lib/call-workspace"
import { cn } from "@/lib/utils"
import "./conversation-composer.css"

const iconControl = "size-(--control-height-sm) shrink-0"

function VoiceWaveform({ levels, listening }: { levels: number[]; listening: boolean }) {
  // Recent microphone samples begin at the center and travel toward both edges.
  const recent = levels.slice(-32)
  const mirrored = [...recent, ...[...recent].reverse()]
  return <svg viewBox="0 0 512 48" preserveAspectRatio="none" aria-hidden="true" className={cn("voice-waveform mx-auto h-12 w-full max-w-xl", listening ? "text-primary" : "text-muted-foreground")}>
    {mirrored.map((level, index) => {
      const height = listening ? Math.max(2, level * 44) : 2
      const centerWeight = 1 - Math.abs(index - 31.5) / 32
      return <rect key={index} x={index * 8 + 2} y={(48 - height) / 2} width="3" height={height} rx="1.5" fill="currentColor" opacity={0.3 + centerWeight * 0.7} />
    })}
  </svg>
}

export function ConversationComposer({ session, name, companionWorkspace, inputRef }: {
  session: Session
  name: string
  companionWorkspace: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const data = useConker(value => value)
  const draft = useConkerStore(state => state.drafts[session.id] || "")
  const setDraft = useConkerStore(state => state.setDraft)
  const pending = useConkerStore(state => state.pending)
  const { send, stop, setNextModel, setReply, openRail, pauseQueue, resumeQueue, removeQueued, editQueued, reviewQueued, setPreview } = useConversationWorkspace()
  const queue = useConversationWorkspace(state => state.queues[session.id])
  const activeQueued = useConversationWorkspace(state => state.activeQueued[session.id])
  const preview = useConversationWorkspace(state => state.previews[session.id])
  const { search } = useLocation()
  const showFixtures = import.meta.env.DEV && new URLSearchParams(search).get("fixtures") === "1"
  const stream = useConversationWorkspace(state => state.streams[session.id])
  const nextModel = useConversationWorkspace(state => state.nextModels[session.id])
  const replyId = useConversationWorkspace(state => state.replies[session.id])
  const notice = useConversationWorkspace(state => state.notices[session.id])
  const unanswered = useConversationWorkspace(state => state.unanswered[session.id])
  const voice = useVoiceTyping(session.id, inputRef)
  const call = useCallWorkspace(state => state.call)
  const startCall = useCallWorkspace(state => state.start)
  const callStarting = useCallWorkspace(state => state.starting)
  const callError = useCallWorkspace(state => state.error)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const useTextRef = useRef<HTMLButtonElement>(null)
  const previousActive = useRef(false)
  const conversation = data.conversations[session.id]
  const noticeInRecovery = notice === unanswered?.reason && conversation?.messages.some(message => message.id === unanswered?.messageId && message.role === "user" && !message.redacted)
  const models = getAvailableModels(data.modelsConfiguration)
  const modelId = nextModel || conversation?.modelId || data.modelsConfiguration.defaultModelId
  const model = models.find(item => item.id === modelId)
  const provider = data.modelsConfiguration.providers.find(item => item.id === model?.providerId)
  const reply = conversation?.messages.find(message => message.id === replyId)
  const overLimit = draft.length > MESSAGE_LIMIT
  const queueing = !!stream || !!queue?.entries.length
  const voiceStatus = voice.phase === "requesting" ? "Opening microphone…" : voice.phase === "finishing" ? "Finishing transcription…" : "Listening"

  useEffect(() => {
    const element = inputRef.current
    if (!element || voice.active) return
    const resize = () => { element.style.height = "auto"; element.style.height = `${Math.min(element.scrollHeight, 160)}px` }
    let width = element.clientWidth
    resize()
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resize() }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [draft, voice.active, inputRef])
  useEffect(() => {
    if (voice.active && !previousActive.current) useTextRef.current?.focus()
    previousActive.current = voice.active
  }, [voice.active])
  useEffect(() => {
    const element = transcriptRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [voice.transcript])

  const sendDraft = () => { if (!session.archived && !voice.active && !overLimit) void send(session.id) }
  const startVoice = () => { void voice.start(navigator.language || "en-US") }

  return <div data-home="composer" className="shrink-0 bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
    {showFixtures && <div className="mb-2"><ConversationPreviewControls value={preview || ""} onChange={value => setPreview(session.id, value)} disabled={session.archived} /></div>}
    <ConversationQueue queue={queue} busy={pending} activeEntryId={activeQueued} onPause={() => pauseQueue(session.id)} onResume={() => void resumeQueue(session.id)} onRemove={id => removeQueued(session.id, id)} onEdit={(id, text) => editQueued(session.id, id, text)} onReview={id => reviewQueued(session.id, id)} />
    {session.archived && <p className="mb-2 text-xs text-muted-foreground">Archived. Restore this conversation from its appbar menu to continue.</p>}
    <form aria-label="Message composer" data-voice-state={voice.phase} className={cn("conversation-composer rounded-xl border border-input bg-card text-card-foreground p-2 shadow-sm focus-within:border-ring", voice.active && "border-ring")} onSubmit={event => { event.preventDefault(); sendDraft() }} onKeyDown={event => { if (event.key === "Escape" && voice.active) { event.preventDefault(); voice.cancel() } }}>
      {reply && <div className="mb-1 flex min-w-0 items-center gap-2 rounded-md bg-muted px-2 py-1"><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Replying to {reply.role === "user" ? "your message" : name}: {reply.redacted ? "Redacted message" : reply.text}</p><Button type="button" variant="ghost" size="icon" className={iconControl} aria-label="Cancel reply" onClick={() => setReply(session.id)}><X /></Button></div>}
      <div hidden={voice.active}>
        <Label htmlFor="message-composer" className="sr-only">Message {name}</Label>
        <Textarea ref={inputRef} id="message-composer" dir="auto" rows={1} placeholder={companionWorkspace ? `Ask ${name} anything, or use your voice…` : `Message ${name}, or use your voice…`} value={draft} maxLength={overLimit ? undefined : MESSAGE_LIMIT} disabled={session.archived} aria-invalid={overLimit || undefined} aria-describedby={overLimit ? "composer-limit" : undefined} onChange={event => setDraft(session.id, event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendDraft() } }} className="max-h-40 min-h-16 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-2 py-2 text-base leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent" />
      </div>
      {voice.active && <div className="voice-typing-panel px-2 pt-2" role="region" aria-label="Voice typing">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2" role="status">{voice.phase === "listening" ? <span className="size-1.5 rounded-full bg-primary" /> : <LoaderCircle className="size-3 motion-safe:animate-spin" />}{voiceStatus}</span>
          <span className="tabular-nums" aria-label={`${voice.seconds} seconds recorded`}>{Math.floor(voice.seconds / 60).toString().padStart(2, "0")}:{(voice.seconds % 60).toString().padStart(2, "0")}</span>
        </div>
        <div ref={transcriptRef} className="voice-transcript min-h-16 max-h-40 overflow-y-auto text-base leading-7 [overflow-wrap:anywhere]" dir="auto">
          {voice.transcript.final || voice.transcript.interim ? <p><span>{voice.transcript.final}</span>{voice.transcript.final && voice.transcript.interim && " "}<span className="text-muted-foreground">{voice.transcript.interim}</span></p> : <p className="text-muted-foreground">{voice.phase === "requesting" ? "Allow microphone access to start voice typing." : "Go ahead. Your words will appear here."}</p>}
        </div>
        <span className="sr-only" role="status">{voice.transcript.final}</span>
        <VoiceWaveform levels={voice.levels} listening={voice.phase === "listening"} />
      </div>}
      {voice.active ? <div className="mt-2 flex min-w-0 items-center gap-1 border-t border-border pt-2">
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className={iconControl} aria-label="Cancel voice typing" onClick={voice.cancel}><X /></Button></TooltipTrigger><TooltipContent>Cancel voice typing</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button ref={useTextRef} type="button" size="icon" className={cn(iconControl, "ml-auto")} aria-label="Use transcript and switch to typing" disabled={voice.phase === "finishing"} onClick={voice.stop}>{voice.phase === "finishing" ? <LoaderCircle className="motion-safe:animate-spin" /> : <Keyboard />}</Button></TooltipTrigger><TooltipContent>Use text</TooltipContent></Tooltip>
      </div> : <div className="flex min-w-0 items-center gap-1">
        <DropdownMenu><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={session.archived} aria-label="Composer tools" className={iconControl}><SlidersHorizontal /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>Tools</TooltipContent></Tooltip><DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuLabel>For this message</DropdownMenuLabel>
          <DropdownMenuItem disabled><Paperclip />Attach<span className="ml-auto text-xs">Not connected</span></DropdownMenuItem>
          <DropdownMenuSeparator /><p className="px-2 py-1.5 text-xs leading-5 text-muted-foreground">Voice typing uses your browser’s speech service, which may process audio online. Conker does not save the recording.</p>
        </DropdownMenuContent></DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className="min-w-0 max-w-52 shrink gap-1 text-muted-foreground" aria-label={`Choose model and provider: ${model?.name || "No model"}, ${provider?.name || "No provider"}`} disabled={session.archived}><span className="min-w-0 truncate">{model?.name || "Choose model"}</span><ChevronDown className="size-3" />{nextModel && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Next-turn override" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" side="top" className="max-h-80 w-72 overflow-y-auto">
          <DropdownMenuLabel>Model for your next message</DropdownMenuLabel><DropdownMenuItem onSelect={() => setNextModel(session.id, "")}>Conversation default{!nextModel && <Check className="ml-auto" />}</DropdownMenuItem><DropdownMenuSeparator />
          {data.modelsConfiguration.providers.filter(item => item.enabled).map(item => <div key={item.id}><DropdownMenuLabel className="text-xs text-muted-foreground">{item.name}</DropdownMenuLabel>{models.filter(value => value.providerId === item.id).map(value => <DropdownMenuItem key={value.id} onSelect={() => setNextModel(session.id, value.id)}>{value.name}{modelId === value.id && <Check className="ml-auto" />}</DropdownMenuItem>)}</div>)}
          <DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/settings?tab=models">Manage models / providers</Link></DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className={iconControl} aria-label="Start voice typing" disabled={session.archived || !!stream || (!!call && !call.endedAt)} onClick={startVoice}><Mic /></Button></TooltipTrigger><TooltipContent side="top">{call && !call.endedAt ? "End the call to use voice typing" : "Voice typing"}</TooltipContent></Tooltip>
          {stream && <Button type="button" variant="outline" size="icon" className={iconControl} aria-label="Stop response" title="Stop response" onClick={() => stop(session.id)}><Square /></Button>}
          {draft.trim() ? <Button type="submit" size="icon" className={iconControl} disabled={overLimit || pending || session.archived || !model} aria-label={queueing ? "Queue message" : "Send message"} title={queueing ? "Queue message" : "Send message"}>{queueing ? <ListPlus /> : <ArrowUp />}</Button> : !stream &&
            <Tooltip><TooltipTrigger asChild><Button type="button" size="icon" aria-label={call && !call.endedAt ? "Return to call" : "Start call"} disabled={session.archived || pending || callStarting} className={iconControl} onClick={() => void startCall(session.id)}><Phone /></Button></TooltipTrigger><TooltipContent>{call && !call.endedAt ? `Return to call with ${call.name}` : "Start call"}</TooltipContent></Tooltip>}
        </div>
      </div>}
    </form>
    <div className="mt-2 flex min-w-0 items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
      {voice.active ? <p className="min-w-0 truncate" title="Your browser’s speech service may process audio online. Conker does not save recordings.">Browser transcription · Review before sending</p> : <button type="button" className="min-h-8 min-w-0 truncate rounded-md text-left underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="View conversation usage and cost" onClick={() => openRail(session.id, "usage")} title="Conversation usage and cost">{provider?.name || "No provider"} · Cost not metered · Preview</button>}
      {draft.length > 3600 ? <span id="composer-limit" className={cn("shrink-0 tabular-nums", overLimit && "text-destructive")}>{draft.length.toLocaleString()} / 4,000</span> : <span className="hidden shrink-0 sm:inline">{voice.active ? "Esc to cancel" : `${queueing ? "Enter to queue" : "Enter to send"} · Shift + Enter for a new line`}</span>}
    </div>
    {voice.error && <div role="alert" className="mt-2 flex items-start gap-2 px-1"><p className="flex-1 text-xs leading-5 text-muted-foreground">{voice.error}</p><Button type="button" variant="ghost" size="icon" className={iconControl} aria-label="Dismiss voice typing notice" onClick={voice.clearError}><X /></Button></div>}
    {notice && <p role="status" className={noticeInRecovery ? "sr-only" : "mt-1 px-1 text-xs leading-5 text-muted-foreground"}>{notice}</p>}
    {callError && !call && <p role="alert" className="mt-1 px-1 text-xs leading-5 text-muted-foreground">{callError}</p>}
  </div>
}
