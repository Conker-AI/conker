import { useRef, useState } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { gatewayError } from '@/lib/gateway/transport'
import type { EnhanceOptions, PromptEnhanceClient } from '@/lib/gateway/prompt-enhance'
import { composerOutlined } from './composer-select'

type Result = { kind: 'done'; original: string; text: string; notes: string[]; modelId: string } | { kind: 'error'; message: string }

/** The wand: rewrites the draft into a clearer prompt. It never sends; Undo puts the original back. */
export function PromptEnhanceControl({ client, value, onChange, options, disabled }: { client: PromptEnhanceClient; value: string; onChange: (text: string) => void; options?: Omit<EnhanceOptions, 'signal'>; disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [open, setOpen] = useState(false)
  const run = useRef(0)
  const press = async () => {
    const original = value, mine = ++run.current
    setBusy(true); setResult(null)
    try {
      const next = await client.enhance(original, options)
      if (run.current !== mine) return
      onChange(next.text); setResult({ kind: 'done', original, text: next.text, notes: next.notes, modelId: next.modelId })
    } catch (error) {
      if (run.current !== mine) return
      setResult({ kind: 'error', message: gatewayError(error).message })
    } finally { if (run.current === mine) { setBusy(false); setOpen(true) } }
  }
  const edited = result?.kind === 'done' && value !== result.text
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button type="button" size="icon" variant="ghost" className={`${composerOutlined} size-9 shrink-0 rounded-full`} aria-label="Improve my prompt" title="Improve my prompt" disabled={disabled || busy || !value.trim()} onClick={event => { if (!result) { event.preventDefault(); void press() } }} />}>
      <Wand2 className={busy ? 'size-4 animate-pulse motion-reduce:animate-none' : 'size-4'} aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
      {result?.kind === 'error' && <><p role="alert" className="text-sm text-destructive-foreground">{result.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => { setResult(null); setOpen(false); void press() }}>Try again</Button></>}
      {result?.kind === 'done' && <>
        <p className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4" aria-hidden="true" />Prompt improved</p>
        <p className="text-xs text-muted-foreground">Nothing was sent. Read it, edit it, then send when you are happy.</p>
        {result.notes.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs">{result.notes.map(note => <li key={note}>{note}</li>)}</ul>}
        <details className="text-xs"><summary className="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">Show original</summary><p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-2 py-1.5">{result.original}</p></details>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={edited} onClick={() => { onChange(result.original); setResult(null); setOpen(false) }}>Undo</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setResult(null); setOpen(false) }}>Keep</Button>
          {edited && <span className="text-xs text-muted-foreground">You changed it since.</span>}
        </div></>}
    </PopoverContent>
  </Popover>
}
