import { persist } from "zustand/middleware"
import { create } from "zustand"
import type { ImportedTheme } from "@/types/theme-customizer"
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
  reset: () => set({ selectedTheme: "", selectedTweakcnTheme: "", selectedRadius: "0.625rem", importedTheme: null, colors: {} }),
  open: false,
  activeTab: "theme",
  setOpen: (open) => set({ open }),
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedTheme: "",
  selectedTweakcnTheme: "",
  selectedRadius: "0.625rem",
  importedTheme: null,
  setSelectedTheme: (selectedTheme) => set({ selectedTheme, colors: {} }),
  setSelectedTweakcnTheme: (selectedTweakcnTheme) =>
    set({ selectedTweakcnTheme, colors: {} }),
  setSelectedRadius: (selectedRadius) => set({ selectedRadius }),
  setImportedTheme: (importedTheme) => set({ importedTheme }),
}), { name: "conker-appearance", partialize: state => ({ selectedTheme: state.selectedTheme, selectedTweakcnTheme: state.selectedTweakcnTheme, selectedRadius: state.selectedRadius, importedTheme: state.importedTheme, colors: state.colors }) }))
