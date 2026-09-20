import { createStore } from 'zustand/vanilla'
import type { RuntimeSession, RuntimeSessionDetail } from '@/lib/gateway/runtime'

/** Forgetting is permanent within an authenticated identity; older read responses cannot undo it. */
export function createGatewaySourcePrivacyState() {
  return createStore<{ sessionIds: string[]; markForgotten: (ids: string[]) => void; reset: () => void }>((set, get) => ({
    sessionIds: [],
    markForgotten: ids => { const merged = [...new Set([...get().sessionIds, ...ids])]; if (merged.length !== get().sessionIds.length) set({ sessionIds: merged }) },
    reset: () => set({ sessionIds: [] }),
  }))
}
export type GatewaySourcePrivacyState = ReturnType<typeof createGatewaySourcePrivacyState>
export function maskForgottenSession<T extends RuntimeSession>(session: T): T {
  return { ...session, status: 'forgotten', title: '', summary: null }
}
export function maskForgottenConversation(detail: RuntimeSessionDetail): RuntimeSessionDetail {
  return { ...maskForgottenSession(detail), messages: detail.messages.map(message => ({ ...message, content: { kind: 'unavailable', reason: 'forgotten' } })), turns: detail.turns.map(turn => ({ ...turn, detail: null })) }
}
