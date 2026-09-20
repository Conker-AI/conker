import type { ModelsConfiguration } from "./model-catalogue"
import { create } from "zustand"
import { conkerClient } from "./index"
import type { Snapshot, Character } from "./client"
import type { TicketStatus } from "./models"
import type { Connections } from "./config"
import type { ConversationAttachment } from "../conversation-attachments"
import { normalizeResearchMode, type ResearchMode } from "../conversation-research"

type State = {
  data: Snapshot | null; error: string; pending: boolean; notice: string
  drafts: Record<string, string>
  attachmentDrafts: Record<string, ConversationAttachment[]>
  researchDrafts: Record<string, ResearchMode>
  setResearchMode: (id: string, mode: ResearchMode) => void
  setAttachments: (id: string, value: ConversationAttachment[]) => void
  load: () => Promise<void>
  mutate: (action: () => Promise<unknown>, notice?: string) => Promise<boolean>
  save: (profile: Character) => Promise<boolean>
  decide: (id: string, status: TicketStatus) => Promise<boolean>
  toggle: (id: string) => Promise<boolean>
  run: (id: string) => Promise<boolean>
  setDraft: (id: string, text: string) => void
  send: (id: string) => Promise<boolean>
  saveModelsConfiguration: (value: ModelsConfiguration) => Promise<boolean>
  saveConnections: (value: Connections) => Promise<boolean>
}
export const useConkerStore = create<State>((set, get) => ({
  data: null, error: "", pending: false, notice: "", drafts: {}, attachmentDrafts: {}, researchDrafts: {},
  setResearchMode: (id, mode) => set(state => ({ researchDrafts: { ...state.researchDrafts, [id]: normalizeResearchMode(mode) } })),
  setAttachments: (id, value) => set(state => ({ attachmentDrafts: { ...state.attachmentDrafts, [id]: value } })),
  load: async () => {
    set({ error: "" })
    try { set({ data: await conkerClient.load() }) }
    catch (error) { set({ error: error instanceof Error ? error.message : "Could not load dashboard." }) }
  },
  mutate: async (action, notice = "") => {
    if (get().pending) return false
    set({ pending: true, error: "", notice: "" })
    try {
      await action()
      set({ data: await conkerClient.load(), notice })
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not save changes. Try again." })
      return false
    } finally { set({ pending: false }) }
  },
  save: profile => get().mutate(() => conkerClient.saveCharacter(profile)),
  decide: (id, status) => get().mutate(() => conkerClient.decideTicket(id, status)),
  toggle: id => get().mutate(() => conkerClient.updateJob(id, "toggle"), "Schedule changed in the fixture only. No scheduler is connected."),
  run: id => get().mutate(() => conkerClient.updateJob(id, "run"), "Simulated run recorded. No backup, calendar change, or index rebuild was performed."),
  setDraft: (id, text) => set(state => ({ drafts: { ...state.drafts, [id]: text } })),
  send: async id => {
    const text = get().drafts[id] || ""
    const attachments = get().attachmentDrafts[id] || []
    const researchMode = get().researchDrafts[id] || "off"
    if (!text.trim() && !attachments.length) return false
    const saved = await get().mutate(() => conkerClient.sendMessage(id, text, { attachments, researchMode }))
    if (saved && get().drafts[id] === text) get().setDraft(id, "")
    if (saved && (get().researchDrafts[id] || "off") === researchMode) get().setResearchMode(id, "off")
    if (saved) get().setAttachments(id, (get().attachmentDrafts[id] || []).filter(item => !attachments.some(sent => sent.id === item.id)))
    return saved
  },
  saveModelsConfiguration: value => get().mutate(() => conkerClient.saveModelsConfiguration(value)),
  saveConnections: value => get().mutate(() => conkerClient.saveConnections(value)),
}))

/** Only rendered below DataProvider, so an absent snapshot is a programming error. */
export function useConker<T>(select: (data: Snapshot) => T): T {
  return useConkerStore(state => {
    if (!state.data) throw new Error("Conker data must be loaded before rendering screens.")
    return select(state.data)
  })
}
