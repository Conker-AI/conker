import { useContext } from 'react'
import type { ChatMessage } from '@/lib/chat/contract'
import { AnswerToolsContext } from '@/lib/chat/answer-tools-context'
import { AnswerVersions } from './answer-versions'
import { AnswerReviews } from './answer-reviews'

/** Tools under one saved answer: versions (retry, compare, switch, branch) and reviews (judge, vote, fact check). */
export function AnswerTools({ message }: { message: ChatMessage }) {
  const tools = useContext(AnswerToolsContext)
  if (!tools || message.content.kind !== 'text') return null
  return <div className="mt-1 flex max-w-full flex-wrap items-center gap-1 text-xs text-muted-foreground">
    <AnswerVersions message={message} tools={tools} />
    <AnswerReviews message={message} tools={tools} />
  </div>
}
