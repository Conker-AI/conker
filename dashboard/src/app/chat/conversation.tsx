import { Link, useLocation } from "react-router-dom"
import { Fragment, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { ArrowRight, ArrowUpRight, CalendarDays, LoaderCircle, Pin, TriangleAlert } from "lucide-react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ToolActivity } from "@/components/tool-activity"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import type { Session } from "@/lib/api/models"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import { MessageActions } from "./message-actions"
import { ConversationRail } from "./conversation-rail"
import { ConversationComposer } from "./conversation-composer"

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

export function Conversation({ session, companionWorkspace = false, intro: Intro, reference }: { session: Session; companionWorkspace?: boolean; intro?: ComponentType<{ preparePrompt: (text: string) => void; hasMessages: boolean }>; reference?: ReactNode }) {
  const { hash, key: locationKey } = useLocation()
  const data = useConker(data => data)
  const conversation = data.conversations[session.id]
  const { drafts, setDraft } = useConkerStore()
  const { openRail, notify } = useConversationWorkspace()
  const stream = useConversationWorkspace(state => state.streams[session.id])
  const composer = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const messages = conversation?.messages || []
  const previousCount = useRef(messages.length)
  const companion = data.agents.find(agent => agent.name === session.agent)?.kind === "companion"
  const name = companion ? data.profile.name : session.agent
  const draft = drafts[session.id] || ""
  const portraitProps = { profile: companion ? data.profile : undefined, name, face: "round" as const, tone: "graphite" as const }

  const scrollToLatest = () => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "instant" }); nearBottom.current = true }
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

  return <div className="conversation-contrast flex min-h-0 min-w-0 flex-1">
    <section aria-label={`Chat with ${name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <h1 className="sr-only">{session.title}</h1>
      <div ref={scroller} role="region" aria-label="Conversation thread" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-col gap-5 py-5">
          {Intro && <Intro preparePrompt={preparePrompt} hasMessages={messages.length > 0} />}
          {!messages.length && !Intro && <div className="space-y-3 py-8"><CompanionPortrait {...portraitProps} className="size-12" /><h2 className="text-xl font-semibold">Chat with {name}</h2><p className="text-sm leading-6 text-muted-foreground">A question, a rough idea, or something you want to make.<br />This is a separate conversation. Choose its agent from the avatar above.</p></div>}
          {messages.map(message => {
            const author = data.agents.find(agent => agent.id === message.agentId)
            const authorName = message.agentName || name
            const authorPortrait = { ...portraitProps, name: authorName, profile: author ? author.kind === "companion" ? data.profile : undefined : portraitProps.profile }
            return <Fragment key={message.id}><article id={message.id} data-message-id={message.id} data-role={message.role} aria-label={message.role === "user" ? "Your message" : `${authorName} response`} className={`group/message relative min-w-0 scroll-mt-4 ${message.role === "user" ? "ml-auto max-w-[92%] sm:max-w-[85%]" : "w-full"}`}>
            {message.role === "assistant" && <div className="mb-2 flex items-center gap-2"><CompanionPortrait {...authorPortrait} className="size-6 rounded-md" /><span className="text-sm font-medium">{authorName}</span>{message.status === "stopped" && <Badge variant="outline">Stopped</Badge>}</div>}
            {message.replyTo && <p className="mb-1 truncate text-xs text-muted-foreground">Replying to: {messages.find(item => item.id === message.replyTo)?.redacted ? "Redacted message" : messages.find(item => item.id === message.replyTo)?.text || "Earlier message"}</p>}
            <div className={message.role === "user" ? "rounded-xl border bg-muted/40 px-4 py-3" : "space-y-3"}>
              {message.redacted ? <p className="text-sm italic text-muted-foreground">Message redacted</p> : <>{message.text && <p dir="auto" className="whitespace-pre-wrap text-[15px] leading-7 [overflow-wrap:anywhere]">{message.text}</p>}{message.scenario && !message.edited && <Scenario session={session} messageId={message.id} />}</>}
            </div>
            <div className={`mt-1 flex min-h-8 items-center gap-2 text-[11px] text-muted-foreground ${message.role === "user" ? "justify-end" : ""}`}><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.edited && <span>Edited</span>}{message.pinned && <Pin className="size-3" aria-label="Pinned" />}<MessageActions session={session} message={message} /></div>
          </article>{conversation.handoffs.filter(event => event.afterMessageId === message.id).map(event => <div key={event.id} role="note" aria-label="Agent handoff" className="flex flex-wrap items-center justify-center gap-2 border-y py-3 text-xs text-muted-foreground"><span>{event.fromName}</span><ArrowRight className="size-3" /><span>{event.toName}</span><span>· Conversation handed over</span></div>)}</Fragment>
          })}
          {stream && <div aria-label="Streaming preview response" className="space-y-2"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CompanionPortrait {...portraitProps} className="size-6 rounded-md" /><LoaderCircle className="size-3.5 motion-safe:animate-spin" /><span role="status">{stream.phase === "thinking" ? "Thinking" : "Responding"} · simulated</span></div>{stream.text && <p className="whitespace-pre-wrap text-[15px] leading-7">{stream.text}</p>}</div>}
        </div>
      </div>
      <ConversationComposer key={session.id} session={session} name={name} companionWorkspace={companionWorkspace} inputRef={composer} showLatest={showLatest} onLatest={scrollToLatest} />
    </section>
    <ConversationRail session={session}>{reference}</ConversationRail>
  </div>
}
