"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TaskDialogContent, OverlayBody, FormActions } from '@/components/design-system'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ImportedTheme } from '@/types/theme-customizer'

interface ImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (theme: ImportedTheme) => void
}

export function ImportModal({ open, onOpenChange, onImport }: ImportModalProps) {
  const [importText, setImportText] = React.useState("")
  const [error, setError] = React.useState("")

  const processImport = () => {
    try {
      if (!importText.trim()) {
        setError("Paste the theme CSS before importing.")
        return
      }

      // Parse CSS content into light and dark theme variables
      const lightTheme: Record<string, string> = {}
      const darkTheme: Record<string, string> = {}
      
      // Split CSS into sections
      const cssText = importText.replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      
      // Extract :root section (light theme)
      const rootMatch = cssText.match(/:root\s*\{([^}]+)\}/)
      if (rootMatch) {
        const rootContent = rootMatch[1]
        const variableMatches = rootContent.matchAll(/--([^:]+):\s*([^;]+);/g)
        for (const match of variableMatches) {
          const [, variable, value] = match
          lightTheme[variable.trim()] = value.trim()
        }
      }
      
      // Extract .dark section (dark theme)
      const darkMatch = cssText.match(/\.dark\s*\{([^}]+)\}/)
      if (darkMatch) {
        const darkContent = darkMatch[1]
        const variableMatches = darkContent.matchAll(/--([^:]+):\s*([^;]+);/g)
        for (const match of variableMatches) {
          const [, variable, value] = match
          darkTheme[variable.trim()] = value.trim()
        }
      }
      
      if (!Object.keys(lightTheme).length && !Object.keys(darkTheme).length) {
        setError("No theme variables found. Include a :root or .dark block with CSS variables.")
        return
      }
      // Store the imported theme
      const importedThemeData = { light: lightTheme, dark: darkTheme }
      onImport(importedThemeData)
      
      onOpenChange(false)
      setImportText("")
      setError("")
    } catch {
      setError("The CSS could not be imported. Check the theme blocks and try again.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <TaskDialogContent size="wide" title="Import theme" description="Paste :root (light) and .dark theme blocks with CSS variables. The theme follows your selected appearance mode." onInteractOutside={event => event.preventDefault()}>
        <OverlayBody>
          <div className="space-y-2">
            <Label htmlFor="theme-css">Theme CSS</Label>
            <Textarea
              id="theme-css"
              className="min-h-48 font-mono text-sm"
              aria-invalid={!!error}
              aria-describedby={error ? "theme-import-error" : undefined}
              placeholder={`:root {
  --background: 0 0% 100%;
  --foreground: oklch(0.52 0.13 144.17);
  --primary: #3e2723;
  /* And more */
}
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: hsl(37.50 36.36% 95.69%);
  --primary: rgb(46, 125, 50);
  /* And more */
}`}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setError("") }}
            />
          </div>
          {error && <p id="theme-import-error" role="alert" className="text-sm text-destructive">{error}</p>}
        </OverlayBody>
          <FormActions inset>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={processImport} disabled={!importText.trim()} className="cursor-pointer">
              Import Theme
            </Button>
          </FormActions>
      </TaskDialogContent>
    </Dialog>
  )
}
