import { Link, useLocation } from "react-router-dom"
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpRight, CalendarDays, Check, ChevronDown, Copy, LoaderCircle, MessageCircle, TriangleAlert } from "lucide-react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ToolActivity } from "@/components/tool-activity"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import type { Session } from "@/lib/api/models"

function UserMessage({ children, id, time, dateTime }: { children: ReactNode; id?: string; time: string; dateTime?: string }) {
  return (
    <article id={id} aria-label="Your message" className="ml-auto max-w-[92%] scroll-mt-6 space-y-2 sm:max-w-[85%]">
      <div dir="auto" className="rounded-2xl bg-muted px-4 py-3 text-[15px] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere] sm:px-5">{children}</div>
      <p className="pr-1 text-right text-xs text-muted-foreground"><span className="sr-only">You, </span><time dateTime={dateTime}>{time}</time></p>
    </article>
  )
}

function CopyResponse({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle")
  useEffect(() => {
    if (status === "idle") return
    const timer = window.setTimeout(() => setStatus("idle"), 2500)
    return () => window.clearTimeout(timer)
  }, [status])
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setStatus("copied") }
    catch { setStatus("error") }
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" className="h-9 gap-2 px-2 text-xs text-muted-foreground" onClick={() => void copy()}>
        {status === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {status === "copied" ? "Copied" : "Copy response"}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">{status === "error" ? "Couldn’t copy. Select the response to copy it." : status === "copied" ? <span className="sr-only">Response copied</span> : null}</span>
    </div>
  )
}

export function Conversation({ session, companionWorkspace = false, intro: Intro }: { session: Session; companionWorkspace?: boolean; intro?: ComponentType<{ preparePrompt: (text: string) => void }> }) {
  const { hash } = useLocation()
  const profile = useConker(data => data.profile)
  const plan = useConker(data => data.plan)
  const thread = useConker(data => data.threads[session.id])
  const messages = useConker(data => data.messages[session.id]) || []
  const replyRequested = useConker(data => data.replyRequests.includes(session.id))
  const { drafts, setDraft, send, pending, mutate } = useConkerStore()
  const composer = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const previousMessageCount = useRef(messages.length)
  const [showLatest, setShowLatest] = useState(false)
  const companion = session.agent === "Conker"
  const name = companion ? profile.name : session.agent
  const draft = drafts[session.id] || ""
  const planning = session.mode === "plan"
  const receipt = session.mode === "receipt"
  const sourceTarget = thread?.sources?.some(source => `#${source.id}` === hash)
  const portraitProps = { profile: companion ? profile : undefined, name, face: companion ? undefined : "round" as const, tone: companion ? undefined : "graphite" as const }

  const scrollToLatest = () => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "instant" })
  }

  useEffect(() => {
    const element = composer.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [draft])

  useEffect(() => {
    const element = scroller.current
    const content = transcript.current
    if (!element || !content) return
    const update = () => setShowLatest(element.scrollHeight - element.scrollTop - element.clientHeight > 80)
    const observer = new ResizeObserver(update)
    observer.observe(element)
    observer.observe(content)
    element.addEventListener("scroll", update, { passive: true })
    return () => { observer.disconnect(); element.removeEventListener("scroll", update) }
  }, [])

  useEffect(() => {
    if (messages.length > previousMessageCount.current) scrollToLatest()
    previousMessageCount.current = messages.length
  }, [messages.length])

  useEffect(() => {
    if (!hash) return
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(hash.slice(1))
      const container = scroller.current
      if (target && container?.contains(target)) {
        const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top
        container.scrollTo({ top: container.scrollTop + offset - container.clientHeight / 2 + target.clientHeight / 2, behavior: "instant" })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, sourceTarget])

  const submit = async () => {
    if (await send(session.id)) composer.current?.focus()
  }
  const preparePrompt = (text: string) => {
    const next = draft.trim() ? `${draft}\n\n${text}` : text
    if (next.length > 4000) {
      useConkerStore.setState({ error: "Your draft is full. Send or shorten it before adding another request." })
      return
    }
    setDraft(session.id, next)
    composer.current?.focus()
  }
  const responseText = [thread?.reply, ...(planning ? plan.map(line => `${line.day}${line.date ? ` ${line.date}` : ""}: ${line.title}\n${line.detail}`) : []), planning ? "A suggested plan. Your calendar hasn’t changed." : ""].filter(Boolean).join("\n\n")

  return (
    <section aria-label={`Chat with ${name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-18 shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <CompanionPortrait {...portraitProps} className="size-10" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold sm:text-base" title={companionWorkspace ? name : session.title}>{companionWorkspace ? name : session.title}</h1>
          <p className="mt-1 truncate text-xs text-muted-foreground">{companionWorkspace ? "Your main companion" : name}<span className="hidden sm:inline"> · {companion ? profile.mood : "Focused on your request"}</span></p>
        </div>
      </header>

      <div ref={scroller} role="region" aria-label="Conversation thread" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
        <div ref={transcript} className="flex w-full min-w-0 flex-col gap-7 py-6 sm:gap-8 sm:py-8">
          {Intro && <Intro preparePrompt={preparePrompt} />}
          {thread?.messages.map(message => <UserMessage key={message.id} id={message.id} time={message.time}><span lang={message.language}>{message.text}</span></UserMessage>)}

          {thread ? <article aria-label={`${name} response`} className="min-w-0 space-y-4">
            <header className="flex items-center gap-2.5">
              <CompanionPortrait {...portraitProps} className="size-8 rounded-lg" />
              <span className="min-w-0 truncate text-sm font-semibold" title={name}>{name}</span>
              <span className="text-xs text-muted-foreground">{thread.mood}</span>
              <time className="sr-only">{thread.time}</time>
            </header>
            {thread.tool && <ToolActivity activity={thread.tool} />}
            {receipt ? <Alert variant="warning">
              <TriangleAlert /><AlertTitle>Reminder saved. Reply unavailable.</AlertTitle>
              <AlertDescription>The reminder was saved in this preview, but the model reply timed out. You can request the reply without repeating the action.</AlertDescription>
              <div className="col-start-2 mt-3">
                <Button variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal" disabled={replyRequested || pending} onClick={() => void mutate(() => conkerClient.requestReply(session.id))}>{replyRequested ? "Reply request recorded" : "Request reply only"}</Button>
                {replyRequested && <p role="status" className="mt-2 text-xs text-muted-foreground">Local preview only. The action receipt is unchanged; no model is connected.</p>}
              </div>
            </Alert> : <>
              <p className="text-[15px] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere] sm:text-base sm:leading-8">{thread.reply}</p>
              {planning && <section aria-label="Suggested plan" className="rounded-xl border border-border/70 px-4 py-4 sm:px-5">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-muted-foreground" />Your week</h2>
                <div className="divide-y divide-border/60">{plan.map(line => <div key={line.day} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 py-3 sm:gap-5">
                  <div><p className="text-[11px] font-medium text-muted-foreground">{line.day}</p>{line.date && <p className="mt-0.5 text-xl font-medium tabular-nums">{line.date}</p>}</div>
                  <div><p className="text-sm font-medium">{line.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{line.detail}</p></div>
                </div>)}</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">A suggested plan. Your calendar hasn’t changed.</p>
              </section>}
              {(planning || session.mode === "reading") && <Button variant="outline" size="sm" className="h-auto min-h-10 max-w-full whitespace-normal py-2" asChild><Link to={planning ? "/inbox/coach" : "/inbox/cleanup"}>{planning ? "Review the email to coach" : "Review the deletion request"}<ArrowUpRight className="shrink-0" /></Link></Button>}
              {session.mode === "quiet" && <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground underline underline-offset-4" to="/chat/week"><MessageCircle className="size-4 shrink-0" />Parent conversation: Make room for the week</Link>}
              <CopyResponse text={responseText} />
            </>}
          </article> : Intro ? null : <div className="py-10 text-center">
            <CompanionPortrait {...portraitProps} className="mx-auto mb-4 size-16" />
            <h2 className="text-xl font-medium">What’s on your mind?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Start a conversation with {name} below.</p>
          </div>}

          {thread?.sources && <details open={sourceTarget || undefined} className="group text-xs text-muted-foreground">
            <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />Earlier source messages ({thread.sources.length})</summary>
            <div className="mt-3 space-y-4 border-t pt-4">{thread.sources.map(source => <p key={source.id} id={source.id} className="scroll-mt-6 leading-6"><span className="font-medium text-foreground">You: </span>{source.text}<span className="ml-2">{source.time}</span></p>)}</div>
          </details>}

          {messages.map(message => <UserMessage key={message.id} id={message.id} time={new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} dateTime={message.createdAt}>{message.text}</UserMessage>)}
        </div>
      </div>

      <div className="relative shrink-0 bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
        <div className="w-full min-w-0">
          <form className="rounded-2xl border border-input bg-muted/35 p-2 transition-colors focus-within:border-ring motion-reduce:transition-none sm:p-3" onSubmit={event => { event.preventDefault(); void submit() }}>
            <Label htmlFor="message-composer" className="sr-only">Message {name}</Label>
            <Textarea ref={composer} id="message-composer" rows={1} placeholder={companionWorkspace ? `Ask ${name} anything, or hand over a task…` : `Message ${name}…`} value={draft} maxLength={4000} onChange={event => setDraft(session.id, event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() }
            }} className="max-h-40 min-h-11 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-3 py-2 font-[family-name:system-ui] text-base leading-7 shadow-none placeholder:font-[family-name:system-ui] focus-visible:ring-0 dark:bg-transparent md:text-[15px]" />
            <div className="flex items-center justify-between gap-3 pt-1 pl-3">
              {showLatest ? <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11 gap-1.5 px-2 text-xs text-muted-foreground" aria-label="Jump to latest message" onClick={scrollToLatest}><ArrowDown className="size-3.5" />Latest messages</Button> : <p className="min-w-0 truncate text-xs text-muted-foreground"><span className="hidden sm:inline">Enter to send<span className="mx-2" aria-hidden="true">·</span>Shift + Enter for a new line</span><span className="sm:hidden">Chat with {name}</span></p>}
              <Button type="submit" size="icon" disabled={!draft.trim() || pending} aria-label="Send message" className="size-11 shrink-0 rounded-xl">{pending ? <LoaderCircle className="size-4 motion-safe:animate-spin" /> : <ArrowUp className="size-5" />}</Button>
            </div>
          </form>
          <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">Preview · Messages stay until reload. AI replies are not connected.</p>
          <span className="sr-only" role="status">{messages.length ? `${messages.length} local messages saved. No model is connected.` : ""}</span>
        </div>
      </div>
    </section>
  )
}
