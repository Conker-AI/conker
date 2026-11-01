import type { ChatMessage } from '@/lib/chat/contract'
import type { AnswerTools } from '@/lib/chat/answer-tools-context'

/** Versions of one answer: switch between versions, retry with another model, compare models, branch a new chat from here. */
export function AnswerVersions({ message, tools }: { message: ChatMessage; tools: AnswerTools }) {
  void message
  void tools
  return null
}
