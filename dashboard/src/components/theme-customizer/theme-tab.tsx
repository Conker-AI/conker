import { useCustomizerPreferences } from "./preferences"

import { Palette, Dices, Upload, ExternalLink, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useThemeManager } from '@/hooks/use-theme-manager'
import { useCircularTransition } from '@/hooks/use-circular-transition'
import { colorThemes, tweakcnThemes } from '@/config/theme-data'
import { radiusOptions, baseColors } from '@/config/theme-customizer-constants'
import { ColorPicker } from '@/components/color-picker'
import type { ImportedTheme } from '@/types/theme-customizer'
import React from 'react'
import { cn } from "@/lib/utils"
import "./circular-transition.css"
import { resolveThemeVariables } from "@/lib/theme-resolution"

interface ThemeTabProps {
  className?: string
  selectedTheme: string
  setSelectedTheme: (theme: string) => void
  selectedTweakcnTheme: string
  setSelectedTweakcnTheme: (theme: string) => void
  selectedRadius: string
  setSelectedRadius: (radius: string) => void
  setImportedTheme: (theme: ImportedTheme | null) => void
  onImportClick: () => void
}

export function ThemeTab({
  className,
  selectedTheme,
  setSelectedTheme,
  selectedTweakcnTheme,
  setSelectedTweakcnTheme,
  selectedRadius,
  setSelectedRadius,
  setImportedTheme,
  onImportClick
}: ThemeTabProps) {
  const { isDarkMode } = useThemeManager()
  const { colors, setColors, importedTheme } = useCustomizerPreferences()
  const activeTheme = importedTheme ?? (selectedTheme
    ? colorThemes.find(item => item.value === selectedTheme)?.preset.styles
    : tweakcnThemes.find(item => item.value === selectedTweakcnTheme)?.preset.styles)
  const resolved = activeTheme ? resolveThemeVariables(activeTheme, isDarkMode) : {}
  const handleColorChange = (key: string, value: string) => {
    if (CSS.supports("color", value)) setColors({ ...colors, [key]: value })
  }
  const { toggleTheme } = useCircularTransition()

  const handleRandomShadcn = () => {
    // Apply a random shadcn theme
    const randomTheme = colorThemes[Math.floor(Math.random() * colorThemes.length)]
    setSelectedTheme(randomTheme.value)
    setSelectedTweakcnTheme("") // Clear tweakcn selection
    setImportedTheme(null) // Clear imported theme
  }

  const handleRandomTweakcn = () => {
    // Apply a random tweakcn theme
    const randomTheme = tweakcnThemes[Math.floor(Math.random() * tweakcnThemes.length)]
    setSelectedTweakcnTheme(randomTheme.value)
    setSelectedTheme("") // Clear shadcn selection
    setImportedTheme(null) // Clear imported theme
  }

  const handleRadiusSelect = (radius: string) => {
    setSelectedRadius(radius)
  }

  const handleLightMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDarkMode === false) return
    toggleTheme(event)
  }

  const handleDarkMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDarkMode === true) return
    toggleTheme(event)
  }

  return (
    <div className={cn("grid gap-6 p-4 lg:grid-cols-2 [&>[data-slot=separator]]:hidden", className)}>


      {/* Shadcn UI Theme Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Shadcn UI Theme Presets</Label>
          <Button variant="outline" size="sm" onClick={handleRandomShadcn} className="cursor-pointer">
            <Dices className="h-3.5 w-3.5 mr-1.5" />
            Random
          </Button>
        </div>

        <Select value={selectedTheme} onValueChange={(value) => {
          setSelectedTheme(value)
          setSelectedTweakcnTheme("") // Clear tweakcn selection
                setImportedTheme(null) // Clear imported theme
        }}>
          <SelectTrigger aria-label="Theme preset" className="w-full cursor-pointer">
            <SelectValue placeholder="Choose Shadcn Theme" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <div className="p-2">
              {colorThemes.map((theme) => (
                <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.primary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.secondary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.accent }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.muted }}
                      />
                    </div>
                    <span>{theme.name}</span>
                  </div>
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Tweakcn Theme Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Tweakcn Theme Presets</Label>
          <Button variant="outline" size="sm" onClick={handleRandomTweakcn} className="cursor-pointer">
            <Dices className="h-3.5 w-3.5 mr-1.5" />
            Random
          </Button>
        </div>

        <Select value={selectedTweakcnTheme} onValueChange={(value) => {
          setSelectedTweakcnTheme(value)
          setSelectedTheme("") // Clear shadcn selection
                setImportedTheme(null) // Clear imported theme
        }}>
          <SelectTrigger aria-label="Tweakcn preset" className="w-full cursor-pointer">
            <SelectValue placeholder="Choose Tweakcn Theme" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <div className="p-2">
              {tweakcnThemes.map((theme) => (
                <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.primary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.secondary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.accent }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme.preset.styles.light.muted }}
                      />
                    </div>
                    <span>{theme.name}</span>
                  </div>
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Radius Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium">Corners</Label>
          <Button variant={selectedRadius ? "outline" : "secondary"} size="sm" aria-pressed={!selectedRadius} onClick={() => setSelectedRadius("")}>Use theme radius</Button>
        </div>
        <p className="text-xs text-muted-foreground">{selectedRadius ? "Your corner override applies across themes." : "Corners follow the selected theme."}</p>
        <div className="grid grid-cols-5 gap-2">
          {radiusOptions.map((option) => (
            <div
              key={option.value}
              role="button"
              tabIndex={0}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click() } }}
              className={`relative cursor-pointer rounded-md p-3 border transition-colors ${
                selectedRadius === option.value
                  ? "border-primary"
                  : "border-border hover:border-input"
              }`}
              aria-label={`Radius ${option.name}`}
              aria-pressed={selectedRadius === option.value}
              onClick={() => handleRadiusSelect(option.value)}
            >
              <div className="text-center">
                <div className="text-xs font-medium">{option.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Mode Section */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Mode</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={!isDarkMode ? "secondary" : "outline"}
            size="sm"
            onClick={handleLightMode}
            className="cursor-pointer mode-toggle-button relative overflow-hidden"
          >
            <Sun className="h-4 w-4 mr-1 transition-transform duration-300" />
            Light
          </Button>
          <Button
            variant={isDarkMode ? "secondary" : "outline"}
            size="sm"
            onClick={handleDarkMode}
            className="cursor-pointer mode-toggle-button relative overflow-hidden"
          >
            <Moon className="h-4 w-4 mr-1 transition-transform duration-300" />
            Dark
          </Button>
        </div>
      </div>

      <Separator />

      {/* Import Theme Button */}
      <div className="space-y-3">
        <Button
          variant="outline"
          size="lg"
          onClick={onImportClick}
          className="w-full cursor-pointer"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Import Theme
        </Button>
      </div>

      {/* Accent & token colors Section */}
      <Accordion type="single" collapsible className="w-full border-b rounded-lg">
        <AccordionItem value="brand-colors" className="border border-border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-accent transition-colors">
            <Label className="text-sm font-medium cursor-pointer">Accent & token colors</Label>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-muted">
            {baseColors.map((color) => (
              <div key={color.cssVar} className="flex items-center justify-between">
                <ColorPicker
                  label={color.name}
                  cssVar={color.cssVar}
                  value={colors[color.cssVar] || resolved[color.cssVar.slice(2)] || ""}
                  onChange={handleColorChange}
                />
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Tweakcn */}
      <div className="p-4 bg-muted rounded-lg space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Advanced Customization</span>
        </div>
        <p className="text-xs text-muted-foreground">
          For advanced theme customization with real-time preview, visual color picker, and hundreds of prebuilt themes, visit{" "}
          <a
            href="https://tweakcn.com/editor/theme"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium cursor-pointer"
          >
            tweakcn.com
          </a>
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full cursor-pointer"
          onClick={() => window.open('https://tweakcn.com/editor/theme', '_blank')}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Open Tweakcn
        </Button>
      </div>
    </div>
  )
}
