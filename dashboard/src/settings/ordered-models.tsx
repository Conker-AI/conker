import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type ModelOption = { id: string; label: string; disabled?: boolean }

/** Models tried in order: numbered rows that move up, down or out, and a select that adds the next one. */
export function OrderedModels({ id, chosen, options, max, disabled, empty, placeholder, onChange }: {
  id: string; chosen: string[]; options: ModelOption[]; max: number; disabled: boolean; empty: string; placeholder: string; onChange: (next: string[]) => void
}) {
  const label = (modelId: string) => options.find(model => model.id === modelId)?.label ?? modelId
  const left = options.filter(model => !chosen.includes(model.id))
  const move = (index: number, by: number) => { const next = [...chosen]; [next[index], next[index + by]] = [next[index + by], next[index]]; onChange(next) }
  return <div className="flex flex-col gap-2">
    {chosen.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p>
      : <ol className="flex flex-col divide-y rounded-lg border">{chosen.map((modelId, index) => <li key={modelId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 pr-1.5 pl-3 text-sm">
        <span className="flex min-w-40 flex-1 gap-2"><span className="w-5 shrink-0 text-muted-foreground tabular-nums">{index + 1}</span><span className="min-w-0 truncate">{label(modelId)}</span></span>
        <span className="ml-auto flex">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${label(modelId)} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${label(modelId)} down`} disabled={disabled || index === chosen.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${label(modelId)}`} disabled={disabled} onClick={() => onChange(chosen.filter(other => other !== modelId))}><X /></Button>
        </span>
      </li>)}</ol>}
    {left.some(model => !model.disabled) && chosen.length < max && <Select value={null} disabled={disabled} onValueChange={next => { if (next) onChange([...chosen, String(next)]) }} items={left.map(model => ({ value: model.id, label: model.label }))}>
      <SelectTrigger id={id} className="w-full sm:w-72"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{left.map(model => <SelectItem key={model.id} value={model.id} disabled={model.disabled}>{model.label}</SelectItem>)}</SelectContent>
    </Select>}
  </div>
}
