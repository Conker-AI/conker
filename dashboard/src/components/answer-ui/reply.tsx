import { useEffect, useRef, useState, type ReactNode } from "react"
import type { ChatContract } from "@/lib/chat/contract"
import { AnswerReplies, type AnswerReply } from "./context"

/** How long a choice may wait for the composer to take it before the owner is told. */
const HANDOFF_MS = 5000

/**
 * Lets the latest answer in one chat send replies. The text goes into the chat's draft and is sent
 * once the composer has it, so the usual saving, recovery and "outcome unknown" checks apply.
 * A draft the owner is writing is never replaced.
 */
export function ChatAnswerReplies({ chat, children }: { chat: ChatContract; children: ReactNode }) {
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const handled = useRef<string | null>(null)
  const latest = [...chat.messages].reverse().find(message => message.role === "assistant")
  const latestText = latest?.content.kind === "text" ? latest.content.text : null
  const busy = chat.generation !== null || chat.submission.kind !== "idle" && chat.submission.kind !== "rejected"

  useEffect(() => {
    if (pending === null || handled.current === pending) return
    if (chat.draft !== pending) {
      const timer = setTimeout(() => { setPending(null); setNotice("Couldn't put your choice in the message box. Type it instead.") }, HANDOFF_MS)
      return () => clearTimeout(timer)
    }
    handled.current = pending
    const reason = chat.send.availability === "enabled" ? null : chat.send.reason
    void Promise.resolve(chat.send.availability === "enabled" ? chat.send.run() : undefined).catch(() => {}).finally(() => {
      handled.current = null
      setPending(null)
      if (reason) setNotice(`Your choice is in the message box. ${reason}`)
    })
  }, [pending, chat.draft, chat.send])

  const forAnswer = (answerText: string): AnswerReply => {
    const send = (text: string) => {
      if (pending !== null || chat.setDraft.availability !== "enabled") return
      setNotice(null)
      setPending(text)
      void chat.setDraft.run(text)
    }
    const reply = (reason?: string, sending: string | null = null): AnswerReply => ({ available: !reason && sending === null, reason, sending, send })
    if (answerText !== latestText) return reply("From an earlier answer.")
    if (busy) return reply("Available when the reply finishes.")
    if (pending !== null) return reply(undefined, pending)
    if (chat.draft.trim()) return reply(notice ?? "Your message box has text. Send or clear it first.")
    if (chat.setDraft.availability !== "enabled") return reply(chat.setDraft.reason)
    return { ...reply(), notice: notice ?? undefined }
  }
  return <AnswerReplies.Provider value={{ forAnswer }}>{children}</AnswerReplies.Provider>
}
