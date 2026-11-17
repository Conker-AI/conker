import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutTemplate, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { promptMessage } from '@/lib/gateway/prompt-errors'
import type { EnhanceOptions, PromptEnhanceClient } from '@/lib/gateway/prompt-enhance'
import type { PromptTemplatesClient } from '@/lib/gateway/prompt-templates'
import type { PromptTemplate } from '@/lib/chat/prompt-templates'
import { templateFill, type TemplateFill } from '@/lib/chat/template-fill'
import { composerItem } from '@/components/chat/composer-items'
import { loadTemplates, useTemplateCatalogue } from './template-store'

type Result = { kind: 'done'; original: string; text: string; notes: string[]; modelId: string; template: PromptTemplate | null; fill: TemplateFill | null } | { kind: 'error'; message: string; template: PromptTemplate | null }

const names = (labels: string[]) => labels.join(', ')

/** The wand: rewrites the draft into a clearer prompt, or fills one of his templates from it. It never sends; Undo puts the original back. */
export function PromptEnhanceControl({ client, templates, value, onChange, options, disabled }: { client: PromptEnhanceClient; templates: Pick<PromptTemplatesClient, 'list'>; value: string; onChange: (text: string) => void; options?: Omit<EnhanceOptions, 'signal' | 'templateId'>; disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [open, setOpen] = useState(false)
  const run = useRef(0)
  const catalogue = useTemplateCatalogue()
  const press = async (template: PromptTemplate | null) => {
    const original = value, mine = ++run.current
    setBusy(true); setResult(null); setOpen(false)
    try {
      const next = await client.enhance(original, { ...options, ...(template ? { templateId: template.id } : {}) })
      if (run.current !== mine) return
      onChange(next.text)
      setResult({ kind: 'done', original, text: next.text, notes: next.notes, modelId: next.modelId, template, fill: template ? templateFill(template, next) : null })
    } catch (error) {
      if (run.current !== mine) return
      setResult({ kind: 'error', message: promptMessage(error), template })
    } finally { if (run.current === mine) { setBusy(false); setOpen(true) } }
  }
  const edited = result?.kind === 'done' && value !== result.text
  const close = () => { setResult(null); setOpen(false) }
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next && !result) void loadTemplates(templates) }}>
    <PopoverTrigger render={<Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label="Improve my prompt" title="Improve my prompt" disabled={disabled || busy || !value.trim()} />}>
      <Wand2 className={busy ? 'size-4 animate-pulse motion-reduce:animate-none' : 'size-4'} aria-hidden="true" /><span data-label className="sr-only">Improve my prompt</span>
    </PopoverTrigger>
    <PopoverContent align="end" className="max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto">
      {!result && <>
        <div><p className="text-sm font-medium">Improve my prompt</p><p className="text-xs text-muted-foreground">Nothing is sent. You read the result first.</p></div>
        <Button type="button" variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => void press(null)}><Wand2 aria-hidden="true" /><span>Just rewrite it<span className="block text-xs font-normal text-muted-foreground">Clearer and better organised, same meaning.</span></span></Button>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Or fill a template from your draft</p>
          {catalogue.items.map(item => <Button key={item.id} type="button" variant="ghost" size="sm" className="h-auto w-full justify-start whitespace-normal py-1.5 text-left" onClick={() => void press(item)}><LayoutTemplate aria-hidden="true" /><span>{item.name}{item.description && <span className="block text-xs font-normal text-muted-foreground">{item.description}</span>}</span></Button>)}
          {catalogue.status === 'loading' && !catalogue.items.length && <p role="status" className="text-xs text-muted-foreground">Loading templates…</p>}
          {catalogue.status === 'ready' && !catalogue.items.length && <p className="text-xs text-muted-foreground">No templates yet.</p>}
          {catalogue.status === 'error' && <div className="space-y-1"><p role="alert" className="text-xs text-destructive-foreground">{catalogue.error}</p><Button type="button" size="sm" variant="outline" onClick={() => void loadTemplates(templates)}>Try again</Button></div>}
        </div>
        <Button variant="ghost" size="sm" render={<Link to="/agents?tab=templates" onClick={() => setOpen(false)} />}>Manage templates</Button>
      </>}
      {result?.kind === 'error' && <><p role="alert" className="text-sm text-destructive-foreground">{result.message}</p>
        <div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void press(result.template)}>Try again</Button><Button type="button" size="sm" variant="ghost" onClick={() => setResult(null)}>Choose another way</Button></div></>}
      {result?.kind === 'done' && <>
        <p className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4" aria-hidden="true" />{result.template ? `Filled in ${result.template.name}` : 'Prompt improved'}</p>
        <p className="text-xs text-muted-foreground">Nothing was sent. Read it, edit it, then send when you are happy.</p>
        {result.fill && <div className="space-y-1 text-xs">
          {result.fill.filled.length > 0 && <p>Filled in from your draft: {names(result.fill.filled)}.</p>}
          {result.fill.missing.length > 0 && <p role="status" className="font-medium">Still empty, and needed before you can send: {names(result.fill.missing)}.</p>}
          {result.fill.blank.length > 0 && <p className="text-muted-foreground">Left blank: {names(result.fill.blank)}.</p>}
        </div>}
        {result.notes.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs">{result.notes.map(note => <li key={note}>{note}</li>)}</ul>}
        <details className="text-xs"><summary className="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">Show original</summary><p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted px-2 py-1.5">{result.original}</p></details>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={edited} onClick={() => { onChange(result.original); close() }}>Undo</Button>
          <Button type="button" size="sm" variant="ghost" onClick={close}>Keep</Button>
          {edited && <span className="text-xs text-muted-foreground">You changed it since.</span>}
        </div></>}
    </PopoverContent>
  </Popover>
}
composerItem(PromptEnhanceControl, 'enhance')
