import { create } from "zustand"
export type LocalMessage = { id: number; text: string }
export const useConversations = create<{
  messages: Record<string, LocalMessage[]>
  drafts: Record<string, string>
  setDraft: (id: string, text: string) => void
  send: (id: string) => void
}>((set) => ({
  messages: {},
  drafts: {},
  setDraft: (id, text) =>
    set((state) => ({ drafts: { ...state.drafts, [id]: text } })),
  send: (id) =>
    set((state) => {
      const text = state.drafts[id]?.trim()
      if (!text) return state
      const existing = state.messages[id] || []
      return {
        messages: {
          ...state.messages,
          [id]: [...existing, { id: existing.length + 1, text }],
        },
        drafts: { ...state.drafts, [id]: "" },
      }
    }),
}))
