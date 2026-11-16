import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { ChatEffort, ChatOutput } from '@/lib/gateway/chat-names'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import { GatewayError } from '@/lib/gateway/transport'

export const effortStops: readonly (readonly [ChatEffort, string])[] = [['auto', 'Auto'], ['light', 'Light'], ['medium', 'Medium'], ['high', 'High'], ['max', 'Max']]
export const effortLabel = (effort: ChatEffort) => effortStops.find(([value]) => value === effort)?.[1] ?? effort

/** Says whether the models that may answer this chat use the effort; null means Pi only learns it from the provider, so it counts as available. */
export function effortSupportNote(support: ChatOutput['effortSupport']) {
  if (!support?.length) return null
  const ignoring = support.filter(row => row.applies === false).length
  if (ignoring === support.length) return 'Not used by this chat’s model: it ignores effort.'
  return ignoring ? `Not used by ${ignoring} of the ${support.length} models that may answer.` : null
}

/** A chat that does not exist yet keeps its effort here; the workspace saves it with the chat's output settings once the chat is created. */
export type PendingEffort = { value: ChatEffort; set: (value: ChatEffort) => void }

/**
 * Effort for one chat: how hard the answering model thinks, from Light to Max. It is stored with the
 * chat's output settings and reaches only the answer. The model menu shows it beside the model.
 */
export function useChatEffort(control: GatewayControlClient, sessionId: string | null, pending?: PendingEffort) {
  const [saved, setSaved] = useState<ChatOutput | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef(0)

  const load = useCallback(async (keepError = '') => {
    if (!sessionId) return
    const ticket = ++latest.current
    setError(keepError)
    try {
      const result = await control.chatNames.output(sessionId)
      if (ticket === latest.current) setSaved(result)
    } catch (failure) {
      if (ticket === latest.current) setError(chatFeatureMessage(failure))
    }
  }, [control, sessionId])
  // The button names the effort, so it is read when the chat opens, not when the menu does.
  useEffect(() => {
    if (!sessionId) return
    let live = true
    control.chatNames.output(sessionId).then(result => { if (live) setSaved(result) }).catch(failure => { if (live) setError(chatFeatureMessage(failure)) })
    return () => { live = false }
  }, [control, sessionId])

  const choose = async (effort: ChatEffort) => {
    if (!sessionId) { pending?.set(effort); return }
    if (!saved) return
    setSaving(true)
    setError('')
    try {
      setSaved(await control.chatNames.saveOutput(sessionId, { ...saved.output, effort }, saved.revision))
    } catch (failure) {
      const message = chatFeatureMessage(failure)
      if (failure instanceof GatewayError && failure.code === 'revision_conflict') await load(message)
      else setError(message)
    } finally {
      setSaving(false)
    }
  }

  const effort: ChatEffort = (sessionId ? saved?.output.effort : pending?.value) ?? 'auto'
  return { effort, choose, saving, error, note: effortSupportNote(saved?.effortSupport), ready: !sessionId || Boolean(saved), newChat: !sessionId, refresh: () => load() }
}
