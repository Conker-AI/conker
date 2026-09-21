import { create } from "zustand"
import { conkerClient } from "@/lib/api"
import type { OwnerPreferences } from "@/lib/api/owner-preferences-types"

type State = { saved: OwnerPreferences | null; draft: OwnerPreferences | null; pending: boolean; error: string; notice: string; load: () => Promise<void>; update: (value: OwnerPreferences) => void; save: () => Promise<void>; discard: () => void }
export const useOwnerPreferences = create<State>((set, get) => ({
  saved: null, draft: null, pending: false, error: "", notice: "",
  load: async () => {
    if (get().saved || get().pending) return
    set({ pending: true, error: "" })
    try { const saved = await conkerClient.ownerPreferences.load(); set({ saved, draft: structuredClone(saved) }) }
    catch (cause) { set({ error: cause instanceof Error ? cause.message : "Could not load preferences." }) }
    finally { set({ pending: false }) }
  },
  update: draft => { if (!get().pending) set({ draft: structuredClone(draft), error: "", notice: "" }) },
  save: async () => {
    const draft = get().draft
    if (!draft || get().pending) return
    set({ pending: true, error: "", notice: "" })
    try { const saved = await conkerClient.ownerPreferences.save(draft); set({ saved, draft: structuredClone(saved), notice: "Preferences saved in this preview. Enforcement is not connected; reload resets them." }) }
    catch (cause) { set({ error: cause instanceof Error ? cause.message : "Could not save. Your draft is retained." }) }
    finally { set({ pending: false }) }
  },
  discard: () => { if (!get().pending && get().saved) set({ draft: structuredClone(get().saved), error: "", notice: "Draft changes discarded." }) },
}))
