import { createContext, useContext } from "react"

/**
 * How a button or form in an answer sends its text: as the owner's next message, through the
 * composer's own draft and Send. Nothing else runs; generated parts never call tools.
 */
export type AnswerReply = {
  /** Whether a tap sends now; when false, `reason` says why in plain words. */
  available: boolean
  reason?: string
  /** A note about the last tap that does not stop the next one. */
  notice?: string
  /** The text being handed to the composer right now, so its button can say so. */
  sending: string | null
  send: (text: string) => void
}

export type Replies = { forAnswer: (answerText: string) => AnswerReply }

const OUTSIDE_CHAT: AnswerReply = { available: false, reason: "Buttons work in the chat.", sending: null, send: () => {} }
export const AnswerReplies = createContext<Replies | null>(null)

/** How taps in one answer reply; outside a chat they cannot. */
export function useAnswerReply(answerText: string): AnswerReply {
  return useContext(AnswerReplies)?.forAnswer(answerText) ?? OUTSIDE_CHAT
}

/** What every part of one interactive block shares: how a tap replies, and whether it is still arriving. */
export type AnswerBlockState = { reply: AnswerReply; streaming: boolean }

export const AnswerBlockContext = createContext<AnswerBlockState>({
  reply: OUTSIDE_CHAT,
  streaming: false,
})

/** The reply as a part should show it: nothing sends while the block is still arriving. */
export function useBlockReply(): AnswerReply {
  const { reply, streaming } = useContext(AnswerBlockContext)
  return streaming ? { ...reply, available: false, reason: "Available when the reply finishes.", notice: undefined } : reply
}

type Step = { type?: unknown; message?: unknown; url?: unknown }

/** The steps of an evaluated action prop, or none. */
export function actionSteps(action: unknown): Step[] {
  const steps = (action as { steps?: unknown } | null | undefined)?.steps
  return Array.isArray(steps) ? steps.filter((step): step is Step => !!step && typeof step === "object") : []
}

/** A button's link when its only step opens one; undefined when it is not a link. */
export function linkTarget(action: unknown): string | undefined {
  const steps = actionSteps(action)
  return steps.length === 1 && steps[0].type === "open_url" ? String(steps[0].url ?? "") : undefined
}

/** The message a button sends: its @ToAssistant text, else its label. */
export function replyText(label: string, action: unknown): string {
  const step = actionSteps(action).find(item => item.type === "continue_conversation")
  return typeof step?.message === "string" && step.message.trim() ? step.message : label
}
