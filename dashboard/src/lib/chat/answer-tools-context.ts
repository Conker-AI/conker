import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { messageRuleOf, withMessageRule, type MessageRule } from '@/lib/chat/message-context-rules'
import type { ChatAnswersClient } from '@/lib/gateway/chat-answers'
import type { ChatContextClient, ChatContextSettings } from '@/lib/gateway/chat-context'
import type { ChatReviewsClient } from '@/lib/gateway/chat-reviews'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import { gatewayError } from '@/lib/gateway/transport'

/** The open chat's answer clients; null in previews without a gateway and in closed or forgotten chats. `refresh` reloads the chat after a change. */
export type AnswerTools = { answers: ChatAnswersClient; reviews: ChatReviewsClient; context: ChatContextClient; disabled: boolean; refresh: () => void }
export const AnswerToolsContext = createContext<AnswerTools | null>(null)
/** Plain words for a failed answer tool; the context editor imports it from its own module. */
export { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

/** The open chat's message rules, loaded once per chat; null until they are loaded. `set` saves one message's rule (null clears it). */
export type MessageRules = {
  settings: ChatContextSettings
  saving: boolean
  error: { messageId: string; text: string } | null
  set: (messageId: string, rule: MessageRule | null) => Promise<void>
}
export const MessageRulesContext = createContext<MessageRules | null>(null)

/** True while this message has a rule, so its action bar stays visible and the rule can be seen without hovering. */
export function useHasContextRule(message: { id: string }): boolean {
  const rules = useContext(MessageRulesContext)
  return rules !== null && messageRuleOf(rules.settings.policy, message.id) !== null
}

/** Loads the chat's context policy once, reloads when `reloadKey` changes and after a revision conflict, and saves single-message rules. */
export function useMessageRules(tools: AnswerTools | null, sessionId: string, reloadKey: string): MessageRules | null {
  const client = tools?.context ?? null
  const [settings, setSettings] = useState<ChatContextSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<MessageRules['error']>(null)

  useEffect(() => {
    if (!client) return
    const controller = new AbortController()
    client.get(sessionId, controller.signal)
      .then(loaded => { if (!controller.signal.aborted) setSettings(loaded) })
      .catch(() => { if (!controller.signal.aborted) setSettings(null) })
    return () => controller.abort()
  }, [client, sessionId, reloadKey])

  const set = useCallback(async (messageId: string, rule: MessageRule | null) => {
    if (!client || !settings || saving) return
    setSaving(true)
    setError(null)
    try {
      setSettings(await client.save(sessionId, withMessageRule(settings.policy, messageId, rule), settings.revision))
    } catch (failure) {
      if (gatewayError(failure).code === 'revision_conflict') {
        setError({ messageId, text: "This chat's context changed. Try again." })
        await client.get(sessionId).then(setSettings, () => setSettings(null))
      } else {
        setError({ messageId, text: chatFeatureMessage(failure) })
      }
    } finally {
      setSaving(false)
    }
  }, [client, saving, sessionId, settings])

  return useMemo(() => client && settings ? { settings, saving, error, set } : null, [client, settings, saving, error, set])
}
