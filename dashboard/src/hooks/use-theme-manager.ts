"use client"

import React from 'react'
import { useTheme } from '@/hooks/use-theme'
import { baseColors } from '@/config/theme-customizer-constants'
import { colorThemes } from '@/config/theme-data'
import { resolveThemeVariables } from '@/lib/theme-resolution'
import { loadThemeFonts } from '@/lib/fonts'
import type { ThemePreset, ImportedTheme } from '@/types/theme-customizer'

// Only remove variables owned by this runtime, never unrelated root state.
const appliedVariables = new Set<string>()
function applyVariables(styles: Record<string, string>) {
  Object.entries(styles).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value)
    appliedVariables.add(key)
  })
  loadThemeFonts(styles)
}

export function useThemeManager() {
  const { theme, setTheme } = useTheme()
  const [brandColorsValues, setBrandColorsValues] = React.useState<Record<string, string>>({})
  const systemDark = React.useSyncExternalStore(
    React.useCallback((notify) => {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    }, []),
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  )
  const isDarkMode = theme === 'dark' || (theme === 'system' && systemDark)

  const resetTheme = React.useCallback(() => {
    appliedVariables.forEach(key => document.documentElement.style.removeProperty(`--${key}`))
    appliedVariables.clear()
    loadThemeFonts({})
  }, [])

  const updateBrandColorsFromTheme = React.useCallback((styles: Record<string, string>) => {
    setBrandColorsValues(Object.fromEntries(baseColors.flatMap(color => {
      const value = styles[color.cssVar.slice(2)]
      return value ? [[color.cssVar, value]] : []
    })))
  }, [])

  const applyImportedTheme = React.useCallback((themeData: ImportedTheme, darkMode: boolean) => {
    resetTheme()
    const styles = resolveThemeVariables(themeData, darkMode)
    applyVariables(styles)
    updateBrandColorsFromTheme(styles)
  }, [resetTheme, updateBrandColorsFromTheme])

  const applyTweakcnTheme = React.useCallback((preset: ThemePreset, darkMode: boolean) => {
    applyImportedTheme(preset.styles, darkMode)
  }, [applyImportedTheme])

  const applyTheme = React.useCallback((value: string, darkMode: boolean) => {
    const preset = colorThemes.find(item => item.value === value)?.preset
    if (preset) applyImportedTheme(preset.styles, darkMode)
  }, [applyImportedTheme])

  const applyRadius = React.useCallback((radius: string) => {
    applyVariables({ radius })
  }, [])

  const handleColorChange = React.useCallback((cssVar: string, value: string) => {
    applyVariables({ [cssVar.replace(/^--/, '')]: value })
  }, [])

  return { theme, setTheme, isDarkMode, brandColorsValues, setBrandColorsValues, resetTheme,
    applyTheme, applyTweakcnTheme, applyImportedTheme, applyRadius, handleColorChange, updateBrandColorsFromTheme }
}
