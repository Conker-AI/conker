import { Link, useLocation } from "react-router-dom"
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpRight, CalendarDays, ChevronDown, LoaderCircle, Mic, Paperclip, Pin, SlidersHorizontal, Square, TriangleAlert, X } from "lucide-react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ToolActivity } from "@/components/tool-activity"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import type { Session } from "@/lib/api/models"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import { MessageActions } from "./message-actions"
import { ConversationRail } from "./conversation-rail"

function Scenario({ session, messageId }: { session: Session; messageId: string }) {
  const data = useConker(data => data)
  const pending = useConkerStore(state => state.pending)
  const mutate = useConkerStore(state => state.mutate)
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const retry = useConversationWorkspace(state => state.retry)
  const openRail = useConversationWorkspace(state => state.openRail)
  const thread = data.threads[session.id]
  const planning = session.mode === "plan"
  const ticket = data.tickets.find(item => item.id === (planning ? "coach" : session.mode === "reading" ? "cleanup" : ""))
  const replyRequested = data.replyRequests.includes(session.id)
  const replyModelId = data.conversations[session.id].modelId || data.modelsConfiguration.defaultModelId
  const canRequestReply = !session.archived && getAvailableModels(data.modelsConfiguration).some(model => model.id === replyModelId)
  if (!thread) return null
  return <div className="space-y-4">
    {thread.tool && <ToolActivity activity={thread.tool} />}
    {session.mode === "receipt" && <Alert variant="warning"><TriangleAlert /><AlertTitle>Action completed. Reply unavailable.</AlertTitle><AlertDescription>The reminder was recorded in the fixture, but the reply timed out. Requesting text again will not repeat the action.</AlertDescription><div className="col-start-2 mt-3"><Button variant="outline" size="sm" disabled={replyRequested || pending || !!streaming || !canRequestReply} onClick={async () => {
      if (replyModelId && await retry(session.id, messageId, replyModelId)) await mutate(() => conkerClient.requestReply(session.id))
    }}>{replyRequested ? "Reply requested" : "Ask only for the reply"}</Button></div></Alert>}
    {planning && <section aria-label="Suggested plan" className="rounded-lg border p-4"><h2 className="mb-2 flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-muted-foreground" />Your week</h2><div className="divide-y divide-border/60">{data.plan.map(line => <div key={line.day} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 py-3"><div><p className="text-xs text-muted-foreground">{line.day}</p>{line.date && <p className="text-lg font-medium tabular-nums">{line.date}</p>}</div><div><p className="text-sm font-medium">{line.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{line.detail}</p></div></div>)}</div><p className="mt-2 text-xs text-muted-foreground">A suggested plan. Your calendar hasn’t changed.</p></section>}
    {ticket && <Alert variant={ticket.status === "Needs you" ? "warning" : "default"}><TriangleAlert /><AlertTitle>{ticket.status === "Needs you" ? "Waiting for your decision" : "Request reviewed"}</AlertTitle><AlertDescription>{ticket.request} · {ticket.status}. No external action is performed by this preview.</AlertDescription><div className="col-start-2 mt-3"><Button variant="outline" size="sm" asChild><Link to={`/inbox/${ticket.id}`}>Review in Inbox<ArrowUpRight /></Link></Button></div></Alert>}
    {!!thread.sources?.length && <div aria-label="Citations" className="flex flex-wrap gap-2">{thread.sources.map((source, index) => <Button key={source.id} variant="outline" size="sm" className="h-7 px-2 text-xs" title={source.text} onClick={() => openRail(session.id, "source", source.id)}>[{index + 1}] Saved request</Button>)}</div>}
  </div>
}

export function Conversation({ session, companionWorkspace = false, intro: Intro, reference }: { session: Session; companionWorkspace?: boolean; intro?: ComponentType<{ preparePrompt: (text: string) => void }>; reference?: ReactNode }) {
  const { hash, key: locationKey } = useLocation()
  const data = useConker(data => data)
  const conversation = data.conversations[session.id]
  const { drafts, setDraft, pending } = useConkerStore()
  const { send, stop, setNextModel, setReply, openRail, notify } = useConversationWorkspace()
  const stream = useConversationWorkspace(state => state.streams[session.id])
  const nextModel = useConversationWorkspace(state => state.nextModels[session.id])
  const replyId = useConversationWorkspace(state => state.replies[session.id])
  const notice = useConversationWorkspace(state => state.notices[session.id])
  const composer = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const messages = conversation?.messages || []
  const previousCount = useRef(messages.length)
  const companion = data.agents.find(agent => agent.name === session.agent)?.kind === "companion"
  const name = companion ? data.profile.name : session.agent
  const draft = drafts[session.id] || ""
  const models = getAvailableModels(data.modelsConfiguration)
  const modelId = stream?.modelId || nextModel || conversation?.modelId || data.modelsConfiguration.defaultModelId
  const model = models.find(item => item.id === modelId)
  const reply = messages.find(message => message.id === replyId)
  const portraitProps = { profile: companion ? data.profile : undefined, name, face: "round" as const, tone: "graphite" as const }

  const scrollToLatest = () => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "instant" }); nearBottom.current = true }
  useEffect(() => { const element = composer.current; if (element) { element.style.height = "auto"; element.style.height = `${Math.min(element.scrollHeight, 160)}px` } }, [draft])
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const update = () => { nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; setShowLatest(!nearBottom.current) }
    element.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update); observer.observe(element); if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => { element.removeEventListener("scroll", update); observer.disconnect() }
  }, [])
  useEffect(() => { if (messages.length > previousCount.current) scrollToLatest(); previousCount.current = messages.length }, [messages.length])
  useEffect(() => { if (stream && nearBottom.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "instant" }) }, [stream])
  useEffect(() => {
    if (!hash) return
    let id: string
    try { id = decodeURIComponent(hash.slice(1)) } catch { return }
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id) || (id.startsWith("message-") ? document.getElementById(id.slice(8)) : null)
      if (target && scroller.current?.contains(target)) target.scrollIntoView({ block: "center" })
      else if (data.threads[session.id]?.sources?.some(source => source.id === id)) openRail(session.id, "source", id)
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, locationKey, data.threads, session.id, openRail])
  const preparePrompt = (text: string) => { const next = draft.trim() ? `${draft}\n\n${text}` : text; if (next.length > 4000) notify(session.id, "Your draft is full. Shorten it before adding another request."); else { setDraft(session.id, next); composer.current?.focus() } }

  return <div className="flex min-h-0 min-w-0 flex-1">
    <section aria-label={`Chat with ${name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <h1 className="sr-only">{session.title}</h1>
      <div ref={scroller} role="region" aria-label="Conversation thread" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-col gap-5 py-5">
          {Intro && messages.length === 0 && <Intro preparePrompt={preparePrompt} />}
          {!messages.length && !Intro && <div className="space-y-2 py-6"><p className="text-lg font-medium">Start a conversation with {name}</p><p className="text-sm text-muted-foreground">Choose a model and send a message to try the streaming preview.</p></div>}
          {messages.map(message => <article key={message.id} id={message.id} data-message-id={message.id} data-role={message.role} aria-label={message.role === "user" ? "Your message" : `${name} response`} className={`group/message relative min-w-0 scroll-mt-4 ${message.role === "user" ? "ml-auto max-w-[92%] sm:max-w-[85%]" : "w-full"}`}>
            {message.role === "assistant" && <div className="mb-2 flex items-center gap-2"><CompanionPortrait {...portraitProps} className="size-6 rounded-md" /><span className="text-sm font-medium">{name}</span>{message.status === "stopped" && <Badge variant="outline">Stopped</Badge>}</div>}
            {message.replyTo && <p className="mb-1 truncate text-xs text-muted-foreground">Replying to: {messages.find(item => item.id === message.replyTo)?.redacted ? "Redacted message" : messages.find(item => item.id === message.replyTo)?.text || "Earlier message"}</p>}
            <div className={message.role === "user" ? "rounded-xl border bg-muted/40 px-4 py-3" : "space-y-3"}>
              {message.redacted ? <p className="text-sm italic text-muted-foreground">Message redacted</p> : <>{message.text && <p dir="auto" className="whitespace-pre-wrap text-[15px] leading-7 [overflow-wrap:anywhere]">{message.text}</p>}{message.scenario && !message.edited && <Scenario session={session} messageId={message.id} />}</>}
            </div>
            <div className={`mt-1 flex min-h-8 items-center gap-2 text-[11px] text-muted-foreground ${message.role === "user" ? "justify-end" : ""}`}><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.edited && <span>Edited</span>}{message.pinned && <Pin className="size-3" aria-label="Pinned" />}<MessageActions session={session} message={message} /></div>
          </article>)}
          {stream && <div aria-label="Streaming preview response" className="space-y-2"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CompanionPortrait {...portraitProps} className="size-6 rounded-md" /><LoaderCircle className="size-3.5 motion-safe:animate-spin" /><span role="status">{stream.phase === "thinking" ? "Thinking" : "Responding"} · simulated</span></div>{stream.text && <p className="whitespace-pre-wrap text-[15px] leading-7">{stream.text}</p>}</div>}
        </div>
      </div>
      <div data-home="composer" className="shrink-0 bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        {session.archived && <p className="mb-2 text-xs text-muted-foreground">Archived. Restore this conversation from its appbar menu to continue.</p>}
        <form className="rounded-xl border bg-muted/20 p-2 focus-within:border-ring" onSubmit={event => { event.preventDefault(); if (!session.archived) void send(session.id) }}>
          {reply && <div className="mb-1 flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2 py-1"><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Replying to {reply.role === "user" ? "your message" : name}: {reply.redacted ? "Redacted message" : reply.text}</p><Button type="button" variant="ghost" size="icon" className="size-6" aria-label="Cancel reply" onClick={() => setReply(session.id)}><X /></Button></div>}
          <Label htmlFor="message-composer" className="sr-only">Message {name}</Label>
          <Textarea ref={composer} id="message-composer" rows={1} placeholder={companionWorkspace ? `Ask ${name} anything…` : `Message ${name}…`} value={draft} maxLength={4000} disabled={session.archived} onChange={event => setDraft(session.id, event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!session.archived) void send(session.id) } }} className="max-h-40 min-h-11 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-2 py-2 text-base leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent" />
          <div className="flex min-w-0 items-center gap-2">
            <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={session.archived} className="gap-1.5"><SlidersHorizontal className="size-3.5" />Tools<ChevronDown className="size-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" side="top" className="w-56"><DropdownMenuLabel>For the next turn</DropdownMenuLabel><DropdownMenuSub><DropdownMenuSubTrigger disabled={!!stream}><SlidersHorizontal />Model</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-w-72"><DropdownMenuItem onSelect={() => setNextModel(session.id, "")}>Conversation default</DropdownMenuItem>{models.map(item => <DropdownMenuItem key={item.id} onSelect={() => setNextModel(session.id, item.id)}>{item.name}<span className="ml-auto text-xs text-muted-foreground">{item.providerId}</span></DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub><DropdownMenuSeparator /><DropdownMenuItem disabled><Paperclip />Attach · not connected</DropdownMenuItem><DropdownMenuItem disabled><Mic />Voice · not connected</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <span className="min-w-0 max-w-44 truncate rounded-md border px-2 py-1 text-[11px] text-muted-foreground" title={`${nextModel ? "Next turn" : "Conversation default"}: ${model?.name || "No model"}`}>{model?.name || "Choose model"}</span>
            {showLatest && <Button type="button" variant="ghost" size="icon" className="ml-auto size-8 shrink-0" aria-label="Jump to latest message" onClick={scrollToLatest}><ArrowDown /></Button>}
            {stream ? <Button type="button" variant="outline" size="icon" className="ml-auto size-9 shrink-0" aria-label="Stop response" onClick={() => stop(session.id)}><Square className="size-4" /></Button> : <Button type="submit" size="icon" className="ml-auto size-9 shrink-0" disabled={!draft.trim() || pending || session.archived || !model} aria-label="Send message"><ArrowUp /></Button>}
          </div>
        </form>
        <p className="mt-2 truncate text-center text-[11px] text-muted-foreground" title="Enter sends · Shift + Enter adds a line. Messages and settings reset on reload.">{model?.name || "No model selected"} · Cost not metered · Fixture preview</p>
        {notice && <p role="status" className="mt-1 text-center text-xs leading-5 text-muted-foreground">{notice}</p>}
      </div>
    </section>
    <ConversationRail session={session}>{reference}</ConversationRail>
  </div>
}
