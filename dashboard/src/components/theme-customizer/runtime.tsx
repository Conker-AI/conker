import { useEffect } from "react"
import { useThemeManager } from "@/hooks/use-theme-manager"
import { tweakcnThemes } from "@/config/theme-data"
import { useCustomizerPreferences } from "./preferences"

/** Theme application stays mounted when the owner leaves Settings. */
export function ThemeRuntime() {
  const { isDarkMode, resetTheme, applyTheme, applyTweakcnTheme, applyImportedTheme } = useThemeManager()
  const { selectedTheme, selectedTweakcnTheme, selectedRadius, importedTheme, colors } = useCustomizerPreferences()
  useEffect(() => {
    resetTheme()
    if (importedTheme) applyImportedTheme(importedTheme, isDarkMode)
    else if (selectedTheme) applyTheme(selectedTheme, isDarkMode)
    else {
      const preset = tweakcnThemes.find(item => item.value === selectedTweakcnTheme)?.preset
      if (preset) applyTweakcnTheme(preset, isDarkMode)
    }
    document.documentElement.style.setProperty("--radius", selectedRadius)
    Object.entries(colors).forEach(([key, value]) => document.documentElement.style.setProperty(key, value))
  }, [isDarkMode, selectedTheme, selectedTweakcnTheme, selectedRadius, importedTheme, colors, resetTheme, applyTheme, applyTweakcnTheme, applyImportedTheme])
  return null
}
