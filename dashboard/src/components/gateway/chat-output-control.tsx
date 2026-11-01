import { useRef, useState } from 'react'
import { AlignLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { ChatOutput, OutputFormat, OutputLength } from '@/lib/gateway/chat-names'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import { GatewayError } from '@/lib/gateway/transport'

const formats = [['auto', 'Auto'], ['text', 'Text'], ['list', 'List'], ['table', 'Table'], ['document', 'Document'], ['code', 'Code'], ['json', 'JSON']] as const
const lengths = [['auto', 'Auto'], ['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']] as const
const languages = [['auto', 'Auto'], ['en', 'English'], ['ru', 'Russian'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish']] as const

const items = (pairs: readonly (readonly [string, string])[]) => pairs.map(([value, label]) => ({ value, label }))
const labelOf = (pairs: readonly (readonly [string, string])[], value: string) => pairs.find(([code]) => code === value)?.[1] ?? value

/** The trigger names only what is not Auto, for example "List · Short". */
function summary(output: ChatOutput['output'] | undefined) {
  if (!output) return 'Output'
  const parts = [
    output.format !== 'auto' && labelOf(formats, output.format),
    output.length !== 'auto' && labelOf(lengths, output.length),
    output.language !== 'auto' && labelOf(languages, output.language),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Output'
}

function Field({ label, value, options, disabled, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; disabled: boolean; onChange: (value: string) => void }) {
  return <div className="space-y-1">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select value={value} disabled={disabled} items={items(options)} onValueChange={next => { if (next !== null) onChange(next) }}>
      <SelectTrigger size="sm" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([code, text]) => <SelectItem key={code} value={code}>{text}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}

/** Output settings for this chat, in the composer settings row. */
export function ChatOutputControl({ control, sessionId, disabled, onChanged }: { control: GatewayControlClient; sessionId: string; disabled: boolean; onChanged: () => void }) {
  // Saving output settings changes nothing in the chat history, so there is nothing to reload.
  void onChanged
  const [saved, setSaved] = useState<ChatOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef(0)

  const load = async (keepError = '') => {
    const ticket = ++latest.current
    setLoading(true)
    setError(keepError)
    try {
      const result = await control.chatNames.output(sessionId)
      if (ticket === latest.current) setSaved(result)
    } catch (failure) {
      if (ticket === latest.current) setError(chatFeatureMessage(failure))
    } finally {
      if (ticket === latest.current) setLoading(false)
    }
  }

  const change = async (update: Partial<ChatOutput['output']>) => {
    if (!saved) return
    setSaving(true)
    setError('')
    try {
      setSaved(await control.chatNames.saveOutput(sessionId, { ...saved.output, ...update }, saved.revision))
    } catch (failure) {
      const message = chatFeatureMessage(failure)
      // A conflict means another tab changed it: show what is stored now, and say so.
      if (failure instanceof GatewayError && failure.code === 'revision_conflict') await load(message)
      else setError(message)
    } finally {
      setSaving(false)
    }
  }

  const output = saved?.output
  const language = output && languages.some(([code]) => code === output.language) ? languages : output ? [...languages, [output.language, output.language] as const] : languages

  return <Popover onOpenChange={open => { if (open) void load() }}>
    <PopoverTrigger render={<Button variant="ghost" size="sm" disabled={disabled} className="min-w-0 px-2 text-sm text-muted-foreground" />}>
      <AlignLeft /><span className="truncate">{summary(output)}</span>
    </PopoverTrigger>
    <PopoverContent align="start" side="top" className="w-72 max-w-[calc(100vw-1rem)]">
      <div className="space-y-3">
        {loading && !output ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" />Loading…</p>
          : output ? <>
            <Field label="Format" value={output.format} options={formats} disabled={saving || loading} onChange={value => void change({ format: value as OutputFormat })} />
            <Field label="Length" value={output.length} options={lengths} disabled={saving || loading} onChange={value => void change({ length: value as OutputLength })} />
            <Field label="Language" value={output.language} options={language} disabled={saving || loading} onChange={value => void change({ language: value })} />
          </> : null}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </PopoverContent>
  </Popover>
}
