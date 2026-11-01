import type { ChatMessage } from '@/lib/chat/contract'
import type { AnswerTools } from '@/lib/chat/answer-tools-context'

/** Reviews of one answer: blind judge of its versions, the owner's vote and a fact check. */
export function AnswerReviews({ message, tools }: { message: ChatMessage; tools: AnswerTools }) {
  void message
  void tools
  return null
}
