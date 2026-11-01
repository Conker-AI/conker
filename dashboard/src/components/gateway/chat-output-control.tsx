import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverPopup } from '@/components/ui/popover'
import { Select, SelectButton, SelectPopup, SelectItem } from '@/components/ui/select'
import { AlignLeft } from 'lucide-react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { OutputFormat, OutputLength, ChatOutput } from '@/lib/gateway/chat-names'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

const formatOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'text', label: 'Text' },
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
  { value: 'document', label: 'Document' },
  { value: 'code', label: 'Code' },
  { value: 'json', label: 'JSON' },
] as const

const lengthOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
] as const

const languageOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
] as const

/** Output settings for this chat, in the composer settings row. */
export function ChatOutputControl({ control, sessionId, disabled }: { control: GatewayControlClient; sessionId: string; disabled: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [output, setOutput] = useState<ChatOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadOutput = async () => {
    if (!control || !sessionId) return

    setIsLoading(true)
    setError(null)
    try {
      const data = await control.chatNames.output(sessionId)
      setOutput(data)
    } catch (err) {
      setError(chatFeatureMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const saveOutput = async (updates: { format?: OutputFormat; length?: OutputLength; language?: string }) => {
    if (!control || !sessionId || !output) return

    try {
      const newOutput = await control.chatNames.saveOutput(
        sessionId,
        {
          format: updates.format ?? output.output.format,
          length: updates.length ?? output.output.length,
          language: updates.language ?? output.output.language,
        },
        output.revision
      )
      setOutput(newOutput)
      setError(null)
    } catch (err) {
      setError(chatFeatureMessage(err))
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      loadOutput()
    }
  }

  // Build trigger text
  const getTriggerText = () => {
    if (!output) return 'Output'

    const parts = []
    if (output.output.format !== 'auto') {
      const format = formatOptions.find(f => f.value === output.output.format)
      parts.push(format?.label || output.output.format)
    }
    if (output.output.length !== 'auto') {
      const length = lengthOptions.find(l => l.value === output.output.length)
      parts.push(length?.label || output.output.length)
    }
    if (output.output.language !== 'auto') {
      const language = languageOptions.find(l => l.value === output.output.language)
      parts.push(language?.label || output.output.language || '')
    }

    return parts.length > 0 ? parts.join(' · ') : 'Output'
  }

  // Add current language if it's not in the standard list
  const getLanguageOptions = () => {
    if (!output || output.output.language === 'auto') return languageOptions

    const hasCustom = !languageOptions.some(opt => opt.value === output.output.language)
    if (!hasCustom) return languageOptions

    return [...languageOptions, { value: output.output.language, label: output.output.language || '' }]
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="gap-1"
        >
          <AlignLeft className="h-3 w-3" />
          <span>{getTriggerText()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverPopup className="w-80 p-4">
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-4">Loading...</div>
        ) : output ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">Format</label>
              <Select value={output.output.format} onValueChange={(value) => saveOutput({ format: value as OutputFormat })}>
                <SelectButton className="mt-1" size="sm" />
                <SelectPopup>
                  {formatOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Length</label>
              <Select value={output.output.length} onValueChange={(value) => saveOutput({ length: value as OutputLength })}>
                <SelectButton className="mt-1" size="sm" />
                <SelectPopup>
                  {lengthOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Language</label>
              <Select value={output.output.language} onValueChange={(value) => saveOutput({ language: value })}>
                <SelectButton className="mt-1" size="sm" />
                <SelectPopup>
                  {getLanguageOptions().map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                    ))}
                </SelectPopup>
              </Select>
            </div>

            {error && (
              <p role="alert" className="text-xs text-destructive">{error}</p>
            )}
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            {error || 'Failed to load settings'}
          </div>
        )}
      </PopoverPopup>
    </Popover>
  )
}
