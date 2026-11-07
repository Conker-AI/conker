import { useContext } from 'react'
import type { ChatMessage } from '@/lib/chat/contract'
import { AnswerToolsContext } from '@/lib/chat/answer-tools-context'
import { AnswerVersions } from './answer-versions'
import { AnswerReviews } from './answer-reviews'

/** Tools under one saved answer: versions (retry, compare, switch, branch) and reviews (judge, vote, fact check). */
export function AnswerTools({ message }: { message: ChatMessage }) {
  const tools = useContext(AnswerToolsContext)
  if (!tools || message.content.kind !== 'text') return null
  return <div className="contents">
    <AnswerVersions message={message} tools={tools} />
    <AnswerReviews message={message} tools={tools} />
  </div>
}
