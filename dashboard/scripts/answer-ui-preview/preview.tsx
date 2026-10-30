// Development preview of interactive answers, for screenshots (scripts/answer-ui-screenshots.cjs).
// Served by the Vite dev server only (/scripts/answer-ui-preview/); it is not part of the build.
// Each sample sits in its own fake chat, so its buttons go through the real reply provider.
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { RichAnswer } from "@/components/rich-answer"
import { ChatAnswerReplies } from "@/components/answer-ui/reply"
import type { ChatContract, ChatMessage } from "@/lib/chat/contract"
import { samples } from "../answer-ui-samples.mjs"

const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light"
document.documentElement.classList.add(theme)

type Sample = { id: string; title: string; text: string; streaming?: boolean }

export function SampleChat({ sample }: { sample: Sample }) {
  const [draft, setDraft] = useState("")
  const [sent, setSent] = useState<string[]>([])
  const message = { id: sample.id, sessionId: sample.id, sequence: 1, role: "assistant", createdAt: "2026-10-29T10:00:00Z", content: { kind: "text", text: sample.text }, agentId: null, actions: {} } as unknown as ChatMessage
  const chat = {
    source: "fixture", sessionId: sample.id, activeAgentName: "Conker", history: "ready", notice: null, error: null, draft, messages: [message],
    generation: sample.streaming ? { id: "g", sessionId: sample.id, phase: "streaming", previewText: sample.text, resetVersion: 0, stop: { availability: "disabled", reason: "" } } : null,
    submission: { kind: "idle" },
    setDraft: { availability: "enabled", run: (text: string) => setDraft(text) },
    send: draft.trim() ? { availability: "enabled", run: () => { setSent(list => [...list, draft]); setDraft("") } } : { availability: "disabled", reason: "Type a message first." },
    checkHistory: { availability: "enabled", run: () => {} },
  } as unknown as ChatContract
  return <ChatAnswerReplies chat={chat}>
    <article data-sample={sample.id} className="flex min-w-0 flex-col gap-3 border-b pb-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{sample.title}</p>
      <div className="flex items-center gap-2"><img src="/conker.png" alt="" className="size-7 rounded-md" /><span className="text-sm font-medium">Conker</span>{sample.streaming && <span className="text-sm text-muted-foreground">is writing…</span>}</div>
      <RichAnswer text={sample.text} streaming={sample.streaming} />
      {sent.map((text, index) => <p key={index} data-sent className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-base leading-7">{text}</p>)}
    </article>
  </ChatAnswerReplies>
}

createRoot(document.getElementById("root")!).render(<StrictMode>
  <main className="mx-auto flex w-full max-w-[816px] flex-col gap-8 px-4 py-6 sm:px-6">
    <h1 className="text-xl font-semibold">Interactive answers</h1>
    {(samples as Sample[]).map(sample => <SampleChat key={sample.id} sample={sample} />)}
  </main>
</StrictMode>)
