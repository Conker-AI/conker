import { persist } from "zustand/middleware"
import { create } from "zustand"
import type { ImportedTheme } from "@/types/theme-customizer"
import { migrateRadiusPreference } from "@/lib/theme-resolution"
type Preferences = {
  colors: Record<string, string>
  setColors: (colors: Record<string, string>) => void
  reset: () => void
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
export const useCustomizerPreferences = create<Preferences>()(persist((set) => ({
  colors: {},
  setColors: (colors) => set({ colors }),
  reset: () => set({ selectedTheme: "", selectedTweakcnTheme: "", selectedRadius: "", importedTheme: null, colors: {} }),
  open: false,
  activeTab: "theme",
  setOpen: (open) => set({ open }),
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedTheme: "",
  selectedTweakcnTheme: "",
  selectedRadius: "",
  importedTheme: null,
  setSelectedTheme: (selectedTheme) => set({ selectedTheme, colors: {} }),
  setSelectedTweakcnTheme: (selectedTweakcnTheme) =>
    set({ selectedTweakcnTheme, colors: {} }),
  setSelectedRadius: (selectedRadius) => set({ selectedRadius }),
  setImportedTheme: (importedTheme) => set({ importedTheme, colors: {} }),
}), {
  name: "conker-appearance",
  version: 1,
  migrate: persisted => {
    const previous = (persisted ?? {}) as Partial<Preferences>
    return {
      selectedTheme: previous.selectedTheme ?? "",
      selectedTweakcnTheme: previous.selectedTweakcnTheme ?? "",
      selectedRadius: migrateRadiusPreference(previous.selectedRadius),
      importedTheme: previous.importedTheme ?? null,
      colors: previous.colors ?? {},
    }
  },
  partialize: state => ({ selectedTheme: state.selectedTheme, selectedTweakcnTheme: state.selectedTweakcnTheme, selectedRadius: state.selectedRadius, importedTheme: state.importedTheme, colors: state.colors }),
}))
