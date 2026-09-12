import { Link, useLocation } from "react-router-dom"
import { useRef, type ReactNode } from "react"
import { ArrowUp, ArrowUpRight, Info, TriangleAlert } from "lucide-react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ToolActivity } from "@/components/tool-activity"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import type { Session } from "@/lib/api/models"

function UserMessage({ children, id, time, dateTime }: { children: ReactNode; id?: string; time: string; dateTime?: string }) {
  const owner = useConker(data => data.auth.ownerName)
  return <article id={id} className="ml-auto flex max-w-[95%] items-start gap-2 scroll-mt-6 sm:max-w-[85%] sm:gap-3">
    <div className="min-w-0 space-y-1.5"><header className="flex items-center justify-end gap-2 text-xs text-muted-foreground"><span>You</span><time dateTime={dateTime}>{time}</time></header>
      <div className="rounded-xl rounded-tr-sm border bg-muted/40 px-4 py-3 text-sm leading-7 whitespace-pre-wrap break-words">{children}</div>
    </div>
    <Avatar className="mt-6 size-8 border"><AvatarFallback className="text-xs">{owner.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
  </article>
}

export function Conversation({ session }: { session: Session }) {
  const { hash } = useLocation()
  const profile = useConker(data => data.profile)
  const plan = useConker(data => data.plan)
  const thread = useConker(data => data.threads[session.id])
  const messages = useConker(data => data.messages[session.id]) || []
  const replyRequested = useConker(data => data.replyRequests.includes(session.id))
  const { drafts, setDraft, send, pending, mutate } = useConkerStore()
  const composer = useRef<HTMLTextAreaElement>(null)
  const companion = session.agent === "Conker"
  const name = companion ? profile.name : session.agent
  const draft = drafts[session.id] || ""
  const planning = session.mode === "plan"
  const receipt = session.mode === "receipt"
  const submit = async () => {
    if (await send(session.id)) composer.current?.focus()
  }
  return <div className="flex w-full min-w-0 flex-col gap-5">
    <div className="flex flex-wrap items-center gap-3 border-b pb-4">
      <CompanionPortrait profile={companion ? profile : undefined} name={name} face={companion ? undefined : "round"} tone={companion ? undefined : "graphite"} className="size-12" />
      <div className="min-w-0 flex-1"><p className="break-words font-medium">{name}</p><p className="mt-1 break-words text-xs text-muted-foreground">{companion ? profile.mood : "Focused · reviewing your request"} · fixture</p></div>
      {companion && <Button variant="outline" size="sm" asChild><Link to="/companion">Edit companion<ArrowUpRight /></Link></Button>}
      {companion && <p className="w-full text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">Voice: </span>{profile.speakingStyle}</p>}
    </div>
    <div className="flex items-center gap-3"><Separator className="flex-1" /><p className="text-xs text-muted-foreground">{session.updated} · fixture conversation</p><Separator className="flex-1" /></div>
    <div className="flex min-w-0 flex-col gap-5" aria-label="Conversation thread">
      {thread?.messages.map(message => <UserMessage key={message.id} id={message.id} time={message.time}><span lang={message.language}>{message.text}</span></UserMessage>)}
      {thread && <div className="flex items-start gap-2 sm:gap-3">
        <CompanionPortrait profile={companion ? profile : undefined} name={name} face={companion ? undefined : "round"} tone={companion ? undefined : "graphite"} className="mt-6 size-8 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:mr-12">
          <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{name}</span><time>{thread.time}</time><Badge variant="outline" className="font-normal">{thread.mood}</Badge></header>
          {thread.tool && <ToolActivity activity={thread.tool} />}
          {receipt ? <Alert variant="warning"><TriangleAlert /><AlertTitle>Acted, no reply</AlertTitle><AlertDescription>The reminder was saved in the fixture, but the model reply timed out. The receipt is the evidence. Requesting a reply does not repeat the action.</AlertDescription>
            <div className="col-start-2 mt-3"><Button variant="outline" size="sm" disabled={replyRequested || pending} onClick={() => void mutate(() => conkerClient.requestReply(session.id))}>{replyRequested ? "Reply request recorded" : "Request reply only"}</Button>{replyRequested && <p role="status" className="mt-2 text-xs text-muted-foreground">Local preview only. The action receipt is unchanged; no model is connected.</p>}</div>
          </Alert> : <article className="space-y-4 rounded-xl rounded-tl-sm border bg-background p-4">
            <p className="text-sm leading-7">{thread.reply}</p>
            {planning && <><div className="divide-y rounded-lg border">{plan.map(line => <div key={line.day} className="flex items-center gap-4 px-4 py-3"><div className="w-16 shrink-0 text-center"><p className="text-[10px] tracking-wide text-muted-foreground">{line.day}</p>{line.date && <p className="mt-0.5 text-lg font-medium tabular-nums">{line.date}</p>}</div><div><p className="text-sm font-medium">{line.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{line.detail}</p></div></div>)}</div><p className="text-xs text-muted-foreground">A suggested plan. Your calendar hasn’t changed.</p></>}
            {(planning || session.mode === "reading") && <Button variant="outline" size="sm" asChild><Link to={planning ? "/inbox/coach" : "/inbox/cleanup"}>{planning ? "Review the email to coach" : "Review the deletion request"}<ArrowUpRight /></Link></Button>}
            {session.mode === "quiet" && <Link className="text-xs text-muted-foreground underline underline-offset-4" to="/chat/week">Parent conversation · Make room for the week</Link>}
          </article>}
        </div>
      </div>}
      {planning && <details open={["#sent-user", "#expired-user"].includes(hash) || undefined} className="text-xs text-muted-foreground"><summary className="cursor-pointer">Earlier source messages</summary><div className="mt-3 space-y-3"><p id="sent-user">You: “Reply to Mum about Sunday.” · Yesterday</p><p id="expired-user">You: “Check where my exam is.” · Yesterday</p></div></details>}
      {messages.map(message => <div key={message.id} className="flex flex-col gap-3"><UserMessage time={new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} dateTime={message.createdAt}>{message.text}</UserMessage><p className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-3.5 shrink-0" />Saved in this preview. No model or tools are connected.</p></div>)}
    </div>
    <form className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border bg-background p-3" onSubmit={event => { event.preventDefault(); void submit() }}>
      <Label htmlFor="message-composer" className="sr-only">Message {name}</Label>
      <Textarea ref={composer} id="message-composer" placeholder={`Message ${name}…`} value={draft} maxLength={4000} onChange={event => setDraft(session.id, event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() }
      }} className="min-h-20 resize-y border-0 bg-transparent shadow-none dark:bg-transparent" />
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Fixture only · Enter to send · Shift + Enter for a new line</p><Button type="submit" size="icon" disabled={!draft.trim() || pending} aria-label="Send message" className="shrink-0"><ArrowUp /></Button></div>
      <span className="sr-only" role="status">{messages.length ? `${messages.length} local messages saved. No model is connected.` : ""}</span>
    </form>
  </div>
}
