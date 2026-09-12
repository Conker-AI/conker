import { create } from "zustand"
import type { ImportedTheme } from "@/types/theme-customizer"
type Preferences = {
  open: boolean
  activeTab: string
  setOpen: (value: boolean) => void
  setActiveTab: (value: string) => void
  selectedTheme: string
  selectedTweakcnTheme: string
  selectedRadius: string
  importedTheme: ImportedTheme | null
  setSelectedTheme: (value: string) => void
  setSelectedTweakcnTheme: (value: string) => void
  setSelectedRadius: (value: string) => void
  setImportedTheme: (value: ImportedTheme | null) => void
}
export const useCustomizerPreferences = create<Preferences>((set) => ({
  open: false,
  activeTab: "theme",
  setOpen: (open) => set({ open }),
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedTheme: "",
  selectedTweakcnTheme: "",
  selectedRadius: "0.625rem",
  importedTheme: null,
  setSelectedTheme: (selectedTheme) => set({ selectedTheme }),
  setSelectedTweakcnTheme: (selectedTweakcnTheme) =>
    set({ selectedTweakcnTheme }),
  setSelectedRadius: (selectedRadius) => set({ selectedRadius }),
  setImportedTheme: (importedTheme) => set({ importedTheme }),
}))
