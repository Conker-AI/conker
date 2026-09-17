import { create } from "zustand"
import type { CharacterDraft } from "./api/character"

/** Keep the unsaved studio draft across internal routes, just like chat drafts. */
export const useCharacterWorkspace = create<{ draft: CharacterDraft | null; uploading: boolean }>(() => ({ draft: null, uploading: false }))
