import { useLocation, useNavigate } from "react-router-dom"
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react"
import { ArrowDown, ArrowRight, CalendarDays, TriangleAlert } from "lucide-react"
import { ApprovalRequest } from "@/components/approval-request"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ConversationActivity } from "@/components/conversation-activity"
import { ConversationRun } from "@/components/conversation-run"
import { RichAnswer } from "@/components/rich-answer"
import { ResponseVersions } from "@/components/response-versions"
import { conversationRows, responseFamilyId } from "@/lib/conversation-continuity"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import type { Session } from "@/lib/api/models"
import type { ConversationMessage } from "@/lib/api/conversation-types"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import { MessageActions } from "./message-actions"
import { ConversationRail } from "./conversation-rail"
import { ConversationComposer } from "./conversation-composer"

// Completed rich blocks should not reparse on every token of the next response.
const MessageAnswer = memo(function MessageAnswer({ message, sessionId }: { message: ConversationMessage; sessionId: string }) {
  const openRail = useConversationWorkspace(state => state.openRail)
  return <RichAnswer text={message.text} citations={message.citations} onOpenSource={sourceId => openRail(sessionId, "source", message.id, { sourceId })} />
})

function Scenario({ session, messageId }: { session: Session; messageId: string }) {
  const data = useConker(data => data)
  const pending = useConkerStore(state => state.pending)
  const mutate = useConkerStore(state => state.mutate)
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const retry = useConversationWorkspace(state => state.retry)
  const thread = data.threads[session.id]
  const planning = session.mode === "plan"
  const ticket = data.tickets.find(item => item.id === (planning ? "coach" : session.mode === "reading" ? "cleanup" : ""))
  const replyRequested = data.replyRequests.includes(session.id)
  const replyModelId = data.conversations[session.id].modelId || data.modelsConfiguration.defaultModelId
  const canRequestReply = !session.archived && getAvailableModels(data.modelsConfiguration).some(model => model.id === replyModelId)
  if (!thread) return null
  return <div className="space-y-4">
    {session.mode === "receipt" && <Alert variant="warning"><TriangleAlert /><AlertTitle>Action completed. Reply unavailable.</AlertTitle><AlertDescription>The reminder was recorded in the fixture, but the reply timed out. Requesting text again will not repeat the action.</AlertDescription><div className="col-start-2 mt-3"><Button variant="outline" size="sm" disabled={replyRequested || pending || !!streaming || !canRequestReply} onClick={async () => {
      if (replyModelId && await retry(session.id, messageId, replyModelId)) await mutate(() => conkerClient.requestReply(session.id))
    }}>{replyRequested ? "Reply requested" : "Ask only for the reply"}</Button></div></Alert>}
    {planning && <section aria-label="Suggested plan" className="rounded-lg border bg-card p-4"><h2 className="mb-2 flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-muted-foreground" />Your week</h2><div className="divide-y divide-border">{data.plan.map(line => <div key={line.day} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 py-3"><div><p className="text-xs text-muted-foreground">{line.day}</p>{line.date && <p className="text-lg font-medium tabular-nums">{line.date}</p>}</div><div><p className="text-sm font-medium">{line.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{line.detail}</p></div></div>)}</div><p className="mt-2 text-xs text-muted-foreground">A suggested plan. Your calendar hasn’t changed.</p></section>}
    {ticket && <ApprovalRequest ticket={ticket} />}
  </div>
}

export function Conversation({ session, companionWorkspace = false, intro: Intro, reference }: { session: Session; companionWorkspace?: boolean; intro?: ComponentType<{ preparePrompt: (text: string) => void; hasMessages: boolean }>; reference?: ReactNode }) {
  const { hash, key: locationKey } = useLocation()
  const navigate = useNavigate()
  const data = useConker(data => data)
  const conversation = data.conversations[session.id]
  const { drafts, setDraft } = useConkerStore()
  const { openRail, notify, selectVersion, retryUnanswered } = useConversationWorkspace()
  const selectedVersions = useConversationWorkspace(state => state.selectedVersions[session.id])
  const pending = useConkerStore(state => state.pending)
  const mutate = useConkerStore(state => state.mutate)
  const stream = useConversationWorkspace(state => state.streams[session.id])
  const activity = useConversationWorkspace(state => state.activities[session.id])
  const activeQueued = useConversationWorkspace(state => state.activeQueued[session.id])
  const unanswered = useConversationWorkspace(state => state.unanswered[session.id])
  const composer = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(!hash)
  const [showLatest, setShowLatest] = useState(false)
  const messages = useMemo(() => conversation?.messages || [], [conversation?.messages])
  const rows = useMemo(() => conversationRows(messages, selectedVersions), [messages, selectedVersions])
  const previousCount = useRef(messages.length)
  const companion = data.agents.find(agent => agent.name === session.agent)?.kind === "companion"
  const name = companion ? data.profile.name : session.agent
  const draft = drafts[session.id] || ""
  const portraitProps = { profile: companion ? data.profile : undefined, name, face: "round" as const, tone: "graphite" as const }
  const presentationMode = conversation?.presentationMode || "focus"
  const activityText = activity?.label || (stream?.phase === "thinking" ? "Thinking" : "Writing")
  const pendingActivity = activity && !messages.some(message => message.activity?.id === activity.id) ? activity : undefined
  const streamingVisible = stream && (!activity || pendingActivity)

  const scrollToLatest = useCallback(() => {
    nearBottom.current = true
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "instant" })
    setShowLatest(false)
  }, [])
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const update = () => { nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; setShowLatest(!nearBottom.current) }
    element.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) scrollToLatest()
      else update()
    })
    observer.observe(element); if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => { element.removeEventListener("scroll", update); observer.disconnect() }
  }, [scrollToLatest])
  useLayoutEffect(() => {
    const newUserMessage = !activeQueued && messages.length > previousCount.current && messages.at(-1)?.role === "user"
    // Finishing/retrying an assistant response must never pull someone away from older messages.
    if (newUserMessage || nearBottom.current) scrollToLatest()
    previousCount.current = messages.length
  }, [messages, stream, activeQueued, scrollToLatest])
  useEffect(() => {
    if (!hash) return
    let id: string
    try { id = decodeURIComponent(hash.slice(1)) } catch { return }
    const linkedMessage = messages.find(message => message.id === id || `message-${message.id}` === id)
    if (linkedMessage?.role === "assistant") selectVersion(session.id, responseFamilyId(messages, linkedMessage), linkedMessage.id)
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id) || (id.startsWith("message-") ? document.getElementById(id.slice(8)) : null)
      if (target && scroller.current?.contains(target)) target.scrollIntoView({ block: "center" })
      else if (data.threads[session.id]?.sources?.some(source => source.id === id)) openRail(session.id, "source", id)
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, locationKey, data.threads, session.id, openRail, messages, selectVersion])
  const preparePrompt = (text: string) => { const next = draft.trim() ? `${draft}\n\n${text}` : text; if (next.length > 4000) notify(session.id, "Your draft is full. Shorten it before adding another request."); else { setDraft(session.id, next); composer.current?.focus() } }

  return <div className="flex min-h-0 min-w-0 flex-1">
    <section aria-label={`Chat with ${name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <h1 className="sr-only">{session.title}</h1>
      <span className="sr-only" role="status">{stream ? `${name} is ${activityText.toLowerCase()}. Preview response.` : ""}</span>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} role="region" aria-label="Conversation thread" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-col gap-5 py-5">
          {Intro && <Intro preparePrompt={preparePrompt} hasMessages={messages.length > 0} />}
          {!messages.length && !Intro && <div className="space-y-3 py-8"><CompanionPortrait {...portraitProps} className="size-12" /><h2 className="text-xl font-semibold">Chat with {name}</h2><p className="text-sm leading-6 text-muted-foreground">A question, a rough idea, or something you want to make.<br />This is a separate conversation. Choose its agent from the avatar above.</p></div>}
          {rows.map(({ message, versions, familyId, activeId, hasLaterTurns }) => {
            const author = data.agents.find(agent => agent.id === message.agentId)
            const authorName = message.agentName || name
            const authorPortrait = { ...portraitProps, name: authorName, profile: author ? author.kind === "companion" ? data.profile : undefined : portraitProps.profile }
            return <Fragment key={familyId}><article id={message.id} data-message-id={message.id} data-role={message.role} aria-label={message.role === "user" ? "Your message" : `${authorName} response`} className={`relative min-w-0 scroll-mt-4 ${message.role === "user" ? "ml-auto flex max-w-[92%] flex-col items-end sm:max-w-[85%]" : "w-full"}`}>
            {message.role === "assistant" && <div className="mb-2 flex items-center gap-2"><CompanionPortrait {...authorPortrait} className="size-6 rounded-md" /><span className="text-sm font-medium">{authorName}</span>{message.status === "stopped" && <Badge variant="outline">Stopped</Badge>}</div>}
            {!message.redacted && message.activity && <ConversationRun run={message.activity} profile={authorPortrait.profile} mode={message.presentationMode || presentationMode} onInspectStep={(runId, stepId) => openRail(session.id, "activity", message.id, { runId, stepId })} />}
            {message.replyTo && <p className="mb-1 truncate text-xs text-muted-foreground">Replying to: {messages.find(item => item.id === message.replyTo)?.redacted ? "Redacted message" : messages.find(item => item.id === message.replyTo)?.text || "Earlier message"}</p>}
            <div className={message.role === "user" ? "rounded-xl border bg-card px-4 py-3" : "space-y-3"}>
              {message.redacted ? <p className="text-sm italic text-muted-foreground">Message redacted</p> : <>{message.text && (message.role === "assistant" ? <MessageAnswer message={message} sessionId={session.id} /> : <p dir="auto" className="whitespace-pre-wrap text-[15px] leading-7 [overflow-wrap:anywhere]">{message.text}</p>)}{message.scenario && !message.edited && <Scenario session={session} messageId={message.id} />}</>}
            </div>
            {message.role === "assistant" && <ResponseVersions versions={versions} selectedId={message.id} activeId={activeId} hasLaterTurns={hasLaterTurns} disabled={pending || !!stream || session.archived} onSelect={id => selectVersion(session.id, familyId, id)} onFork={async id => {
              let fork: Session | undefined
              if (await mutate(async () => { fork = await conkerClient.forkConversation(session.id, id) }) && fork) navigate(`/chat/${fork.id}`)
            }} />}
            <MessageActions session={session} message={message} />
            {!message.redacted && unanswered?.messageId === message.id && <section aria-label="Unanswered request" className="mt-3 w-full space-y-3 rounded-lg border bg-muted p-3 text-left">
              <div className="space-y-1"><p className="text-sm font-medium">Reply could not start</p><p className="text-xs leading-5 text-muted-foreground">{unanswered.reason}</p><p className="text-xs leading-5 text-muted-foreground">Your request is saved. Review the settings, then retry this request with the current context. No new message will be added.</p></div>
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending || !!stream} onClick={() => openRail(session.id, "overview")}>Review context</Button><Button size="sm" disabled={pending || !!stream || session.archived || messages.at(-1)?.id !== message.id} onClick={() => void retryUnanswered(session.id)}>Retry saved request</Button></div>
            </section>}
          </article>{conversation.handoffs.filter(event => versions.some(version => version.id === event.afterMessageId)).map(event => <div key={event.id} role="note" aria-label="Agent handoff" className="flex flex-wrap items-center justify-center gap-2 border-y py-3 text-xs text-muted-foreground"><span>{event.fromName}</span><ArrowRight className="size-3" /><span>{event.toName}</span><span>· Conversation handed over</span></div>)}</Fragment>
          })}
          {(streamingVisible || pendingActivity) && <div aria-label={stream ? "Streaming preview response" : "Response activity"} className="space-y-3">
            {pendingActivity ? <ConversationRun run={pendingActivity} profile={portraitProps.profile} mode={presentationMode} motion={!showLatest} onInspectStep={(runId, stepId) => openRail(session.id, "activity", undefined, { runId, stepId })} /> : stream && <ConversationActivity profile={portraitProps.profile} mode={presentationMode} phase={stream.phase} motion={!showLatest} />}
            {streamingVisible && stream.text && <RichAnswer text={stream.text} />}
          </div>}
        </div>
      </div>
      {showLatest && <div className="conversation-latest"><Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon" className="relative size-8 rounded-full bg-popover p-0 text-muted-foreground hover:text-foreground dark:bg-popover dark:hover:bg-accent" aria-label={stream ? `${name} is ${activityText.toLowerCase()} · Go to latest response` : "Go to latest message"} onClick={() => { scrollToLatest(); scroller.current?.focus({ preventScroll: true }) }}>
        {stream ? <ConversationActivity profile={portraitProps.profile} mode={presentationMode} phase={activity?.phase || stream.phase} compact /> : <ArrowDown className="size-4" />}
      </Button></TooltipTrigger><TooltipContent side="top">{stream ? `${activityText} · Preview · Go to latest response` : "Go to latest message"}</TooltipContent></Tooltip></div>}
      </div>
      <ConversationComposer key={session.id} session={session} name={name} companionWorkspace={companionWorkspace} inputRef={composer} />
    </section>
    <ConversationRail session={session}>{reference}</ConversationRail>
  </div>
}
