import { create } from "zustand"
import { conkerClient } from "./api"
import type { CallSession, CallUpdate } from "./api/call-types"
import { readAloud } from "./voice/read-aloud"

type CallWorkspace = {
  call: CallSession | null; view: "expanded" | "mini"; draft: string; error: string; starting: boolean
  panel: "transcript" | "details" | null
  start: (conversationId: string) => Promise<void>
  configure: (patch: CallUpdate) => Promise<void>
  send: () => Promise<void>; interrupt: () => void; end: () => Promise<void>
  minimize: () => void; expand: () => void; dismiss: () => void
  setDraft: (draft: string) => void; setPanel: (panel: CallWorkspace["panel"]) => void
}
let response: AbortController | null = null
export const useCallWorkspace = create<CallWorkspace>((set, get) => ({
  call: null, view: "expanded", draft: "", error: "", starting: false, panel: "transcript",
  start: async conversationId => {
    if (get().starting) return
    if (get().call && !get().call?.endedAt) { set({ view: "expanded" }); return }
    set({ starting: true, error: "" })
    readAloud.stop()
    try { set({ call: await conkerClient.calls.start(conversationId), view: "expanded", draft: "", panel: window.matchMedia("(max-width: 700px)").matches ? null : "transcript" }) }
    catch (error) { set({ error: error instanceof Error ? error.message : "Could not open the call. Try again." }) }
    finally { set({ starting: false }) }
  },
  configure: async patch => {
    const current = get().call
    if (!current || current.endedAt) return
    try {
      const call = await conkerClient.calls.update(current.id, patch)
      if (get().call?.id === call.id && !get().call?.endedAt) set({ call, error: "" })
    } catch (error) { set({ error: error instanceof Error ? error.message : "Could not update call settings." }) }
  },
  send: async () => {
    const call = get().call, text = get().draft
    if (!call || call.endedAt || call.phase !== "ready" || !text.trim() || text.length > 4000 || response) return
    const run = new AbortController(); response = run
    set({ error: "" })
    try {
      const result = await conkerClient.calls.send(call.id, text, run.signal, update => {
        if (get().call?.id === update.id && !get().call?.endedAt) {
          set({ call: update })
          if (get().draft === text) set({ draft: "" })
        }
      })
      if (get().call?.id === result.id && !get().call?.endedAt) set({ call: result })
    } catch (error) { set({ error: error instanceof Error ? error.message : "Could not send. Your draft is kept." }) }
    finally { if (response === run) response = null }
  },
  interrupt: () => response?.abort(),
  end: async () => {
    const current = get().call
    if (!current || current.endedAt) return
    response?.abort()
    try { set({ call: await conkerClient.calls.end(current.id), view: "expanded", error: "" }) }
    catch (error) { set({ error: error instanceof Error ? error.message : "Could not end the call." }) }
  },
  minimize: () => set({ view: "mini" }), expand: () => set({ view: "expanded" }),
  dismiss: () => { if (get().call?.endedAt) set({ call: null, draft: "", error: "" }) },
  setDraft: draft => set({ draft }), setPanel: panel => set({ panel }),
}))
