import { createContext } from 'react'
import type { ChatAnswersClient } from '@/lib/gateway/chat-answers'
import type { ChatReviewsClient } from '@/lib/gateway/chat-reviews'

/** The open chat's answer clients; null in previews without a gateway and in closed or forgotten chats. `refresh` reloads the chat after a change. */
export type AnswerTools = { answers: ChatAnswersClient; reviews: ChatReviewsClient; disabled: boolean; refresh: () => void }
export const AnswerToolsContext = createContext<AnswerTools | null>(null)
/** Plain words for a failed answer tool; the context editor imports it from its own module. */
export { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
