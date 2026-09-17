import { useEffect, useRef } from "react"
import { ArrowUp, Keyboard, MessageSquare, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useCallWorkspace } from "@/lib/call-workspace"
import type { CallSession } from "@/lib/api/call-types"
import { callDuration } from "@/lib/call-time"

export function CallTranscript({ call }: { call: CallSession }) {
  const { draft, setDraft, send, interrupt, configure } = useCallWorkspace()
  const tail = useRef<HTMLDivElement>(null)
  useEffect(() => { tail.current?.scrollIntoView({ block: "nearest" }) }, [call.events.length, call.phase])
  const busy = call.phase === "thinking" || call.phase === "responding"
  const messages = call.events.filter(event => event.kind === "user" || (event.kind === "assistant" && call.channels.captions))
  return <div className="flex min-h-0 flex-1 flex-col">
    <div role="log" aria-label="Call transcript" aria-live="polite" tabIndex={0} className="call-transcript flex-1 overflow-y-auto p-4 outline-offset-[-4px]">
      {!messages.length && <div className="flex h-full min-h-40 flex-col justify-center gap-3 py-4">
        <MessageSquare className="size-5 text-muted-foreground" />
        <h3 className="text-sm font-medium">A conversation, your way</h3>
        <p className="text-sm leading-6 text-muted-foreground">Type here even with your microphone off. Your words and {call.name}’s replies stay together.</p>
        <p className="text-xs leading-5 text-muted-foreground">This preview uses sample replies. Live speech is not connected.</p>
      </div>}
      <div className="space-y-5">
        {!call.channels.captions && <p className="text-xs leading-5 text-muted-foreground">Companion text is off. Enable the text control on {call.name}’s tile to show replies.</p>}
        {messages.map(item => <article key={item.id} className={item.kind === "user" ? "ml-6" : "mr-2"}>
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{item.kind === "user" ? "You" : call.name}</span><time className="tabular-nums" dateTime={new Date(item.at).toISOString()}>{callDuration(call.startedAt, item.at)}</time>{item.kind === "assistant" && <span>Sample</span>}</div>
          <p dir="auto" className={item.kind === "user" ? "whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm leading-6" : "whitespace-pre-wrap break-words text-sm leading-6"}>{item.text}</p>
        </article>)}
        {busy && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />{call.phase === "thinking" ? "Preparing a sample response…" : "Composing the sample…"}</p>}
      </div>
      <div ref={tail} />
    </div>
    {call.channels.keyboard ? <form className="shrink-0 border-t border-border p-3" aria-label="Call message" onSubmit={event => { event.preventDefault(); void send() }}>
      <div className="rounded-lg border border-input bg-card p-2 focus-within:border-ring">
        <Textarea aria-label="Type in call" dir="auto" rows={2} placeholder="Say something…" maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}
          className="min-h-16 max-h-32 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 dark:bg-transparent" />
        <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Only sent text is shared</span>{busy ? <Button type="button" variant="outline" size="icon" aria-label="Interrupt response" onClick={interrupt}><Square /></Button> : <Button size="icon" type="submit" aria-label="Send call message" disabled={!draft.trim()}><ArrowUp /></Button>}</div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
    </form> : <div className="shrink-0 border-t border-border p-4"><Button variant="outline" className="w-full" onClick={() => void configure({ channels: { keyboard: true } })}><Keyboard />Enable typing</Button></div>}
  </div>
}
