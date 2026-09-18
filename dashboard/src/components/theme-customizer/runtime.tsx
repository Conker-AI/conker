import { useEffect } from "react"
import { useThemeManager } from "@/hooks/use-theme-manager"
import { tweakcnThemes } from "@/config/theme-data"
import { useCustomizerPreferences } from "./preferences"

/** Theme application stays mounted when the owner leaves Settings. */
export function ThemeRuntime() {
  const { isDarkMode, resetTheme, applyTheme, applyTweakcnTheme, applyImportedTheme, applyRadius, handleColorChange } = useThemeManager()
  const { selectedTheme, selectedTweakcnTheme, selectedRadius, importedTheme, colors } = useCustomizerPreferences()
  useEffect(() => {
    resetTheme()
    if (importedTheme) applyImportedTheme(importedTheme, isDarkMode)
    else if (selectedTheme) applyTheme(selectedTheme, isDarkMode)
    else {
      const preset = tweakcnThemes.find(item => item.value === selectedTweakcnTheme)?.preset
      if (preset) applyTweakcnTheme(preset, isDarkMode)
    }
    if (selectedRadius) applyRadius(selectedRadius)
    Object.entries(colors).forEach(([key, value]) => handleColorChange(key, value))
  }, [isDarkMode, selectedTheme, selectedTweakcnTheme, selectedRadius, importedTheme, colors, resetTheme, applyTheme, applyTweakcnTheme, applyImportedTheme, applyRadius, handleColorChange])
  return null
}
