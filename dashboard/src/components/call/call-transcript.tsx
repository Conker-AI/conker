import { useEffect, useRef } from "react"
import { ArrowUp, MessageSquare, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useCallWorkspace } from "@/lib/call-workspace"
import type { CallSession } from "@/lib/api/call-types"
import { callDuration } from "@/lib/call-time"

export function CallTranscript({ call }: { call: CallSession }) {
  const tail = useRef<HTMLDivElement>(null)
  useEffect(() => { tail.current?.scrollIntoView({ block: "nearest" }) }, [call.events.length, call.phase])
  const busy = call.phase === "thinking" || call.phase === "responding"
  const messages = call.events.filter(event => event.kind === "user" || (event.kind === "assistant" && call.channels.captions))
  return <div role="log" aria-label="Call conversation" aria-live="polite" tabIndex={0} className="call-transcript min-h-0 flex-1 overflow-y-auto p-5 outline-offset-[-4px] sm:p-6">
    {!messages.length && <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <MessageSquare className="size-7 text-muted-foreground" />
      <h3 className="text-lg font-medium">What’s on your mind?</h3>
      <p className="max-w-xs text-sm leading-6 text-muted-foreground">Your conversation lives here, alongside your camera.</p>
      <p className="max-w-xs text-xs leading-5 text-muted-foreground">Replies are a preview. Your character’s live voice is not connected yet.</p>
    </div>}
    <div className="mx-auto max-w-2xl space-y-5">
      {!call.channels.captions && <p className="text-xs leading-5 text-muted-foreground">Companion text is hidden. Turn it back on with the text control below.</p>}
      {messages.map(item => <article key={item.id} className={item.kind === "user" ? "ml-auto max-w-[85%]" : "mr-4"}>
        <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{item.kind === "user" ? "You" : call.name}</span><time className="tabular-nums" dateTime={new Date(item.at).toISOString()}>{callDuration(call.startedAt, item.at)}</time>{item.kind === "assistant" && <span>Sample</span>}</div>
        <p dir="auto" className={item.kind === "user" ? "whitespace-pre-wrap break-words rounded-lg bg-muted px-4 py-3 text-sm leading-6" : "whitespace-pre-wrap break-words text-sm leading-6"}>{item.text}</p>
      </article>)}
      {busy && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />{call.phase === "thinking" ? "Thinking…" : "Writing…"}</p>}
    </div>
    <div ref={tail} />
  </div>
}

export function CallComposer({ call }: { call: CallSession }) {
  const { draft, setDraft, send, interrupt } = useCallWorkspace()
  const busy = call.phase === "thinking" || call.phase === "responding"
  if (!call.channels.keyboard) return null
  return <form className="shrink-0 border-t border-border bg-background p-3" aria-label="Call message" onSubmit={event => { event.preventDefault(); void send() }}>
    <div className="flex items-end gap-2 rounded-lg border border-input bg-card p-2 focus-within:border-ring">
      <Textarea aria-label="Type in call" dir="auto" rows={2} placeholder="Type instead of speaking…" maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}
        className="min-h-12 max-h-28 flex-1 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 dark:bg-transparent" />
      {busy ? <Button type="button" variant="outline" size="icon" aria-label="Interrupt response" onClick={interrupt}><Square /></Button> : <Button size="icon" type="submit" aria-label="Send call message" disabled={!draft.trim() || draft.length > 4000}><ArrowUp /></Button>}
    </div>
    <p className="mt-1.5 text-xs text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
  </form>
}
