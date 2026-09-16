"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ColorPickerProps {
  label: string
  cssVar: string
  value: string
  onChange: (cssVar: string, value: string) => void
}

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  return () => observer.disconnect()
}

function readThemeColor(cssVar: string) {
  // Resolve CSS variable references before converting OKLCH/HSL/RGB to native hex.
  const color = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || !CSS.supports('color', color)) return '#000000'
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return '#' + [red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')
}

export function ColorPicker({ label, cssVar, value, onChange }: ColorPickerProps) {
  const displayColor = React.useSyncExternalStore(subscribeToTheme, () => readThemeColor(cssVar), () => '#000000')

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    onChange(cssVar, newColor)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(cssVar, newValue)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`color-${cssVar}`} className="text-xs font-medium">
        {label}
      </Label>
      <div className="flex items-start gap-2">
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 p-0 overflow-hidden cursor-pointer"
            style={{ backgroundColor: displayColor }}
          >
            <input
              type="color"
              id={`color-${cssVar}`}
              value={displayColor}
              onChange={handleColorChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </Button>
        </div>
        <Input
          type="text"
          aria-label={`${label} color value`}
          placeholder={`${cssVar} value`}
          value={value}
          onChange={handleTextChange}
          className="h-8 text-xs flex-1"
        />
      </div>
    </div>
  )
}
