import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { optionLabel, type Setting, type SettingValue } from './registry'
import { useModels } from './models'
import { OrderedModels } from './ordered-models'

export type ControlProps = { setting: Setting; id: string; value: SettingValue; disabled: boolean; onChange: (value: SettingValue) => void }

/** Controls that sit beside the title on wide screens; the rest take the row's full width. */
export const NARROW = new Set(['toggle', 'select', 'number', 'time', 'date', 'timezone'])

/** Text keeps a local draft and saves when you leave the field or press Enter. */
function useDraft(value: SettingValue) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => { queueMicrotask(() => setDraft(value == null ? '' : String(value))) }, [value])
  return [draft, setDraft] as const
}

function NumberControl({ setting, id, value, disabled, onChange }: ControlProps) {
  const [draft, setDraft] = useDraft(value)
  const [problem, setProblem] = useState('')
  // A step like 0.1 (processors) takes decimals, kept to the step's places; every other number is whole.
  const places = Number.isInteger(setting.step ?? 1) ? 0 : String(setting.step).split('.')[1]?.length ?? 0
  const commit = () => {
    if (draft.trim() === '' && setting.default === null) { setProblem(''); if (value !== null) onChange(null); return }
    const number = places ? Number(Number(draft).toFixed(places)) : Number(draft)
    if (!Number.isFinite(number) || !places && !Number.isInteger(number) || (setting.min !== undefined && number < setting.min) || (setting.max !== undefined && number > setting.max)) {
      setProblem(`Use a ${places ? '' : 'whole '}number from ${setting.min ?? 0} to ${setting.max ?? '∞'}.`); return
    }
    setProblem('')
    if (number !== value) onChange(number)
  }
  return <div className="flex flex-col items-end gap-1">
    <div className="flex items-center gap-2">
      <Input id={id} type="number" inputMode={places ? 'decimal' : 'numeric'} className="w-28 text-right" min={setting.min} max={setting.max} step={setting.step ?? 1} value={draft} disabled={disabled} aria-invalid={Boolean(problem)}
        onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit() }} />
      {setting.unit && <span className="text-sm text-muted-foreground">{setting.unit}</span>}
    </div>
    {problem && <p className="text-xs text-destructive-foreground">{problem}</p>}
  </div>
}

function TextControl({ setting, id, value, disabled, onChange, long }: ControlProps & { long?: boolean }) {
  const [draft, setDraft] = useDraft(value)
  const [problem, setProblem] = useState('')
  const commit = () => {
    const text = draft.trim()
    if (setting.pattern && text && !new RegExp(setting.pattern).test(text)) { setProblem('That value does not have the expected form.'); return }
    setProblem('')
    if (text !== (value ?? '')) onChange(text)
  }
  const shared = { id, value: draft, disabled, maxLength: setting.max_length, 'aria-invalid': Boolean(problem), onChange: (event: { target: { value: string } }) => setDraft(event.target.value), onBlur: commit }
  return <div className="flex flex-col gap-1">
    {long ? <Textarea {...shared} rows={4} /> : <Input {...shared} onKeyDown={event => { if (event.key === 'Enter') commit() }} />}
    {problem && <p className="text-xs text-destructive-foreground">{problem}</p>}
  </div>
}

function TagsControl({ setting, id, value, disabled, onChange }: ControlProps) {
  const items = Array.isArray(value) ? value : []
  const [draft, setDraft] = useState('')
  const add = () => {
    const next = draft.split(',').map(item => item.trim()).filter(item => item && !items.includes(item))
    setDraft('')
    if (next.length && items.length + next.length <= (setting.max_items ?? 50)) onChange([...items, ...next])
  }
  return <div className="flex flex-col gap-2">
    {items.length > 0 && <ul className="flex flex-wrap gap-1.5">{items.map(item => <li key={item} className="flex items-center gap-1 rounded-md border bg-background py-0.5 pr-0.5 pl-2 text-sm">
      {item}<Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${item}`} disabled={disabled} onClick={() => onChange(items.filter(other => other !== item))}><X /></Button>
    </li>)}</ul>}
    <div className="flex gap-2">
      <Input id={id} value={draft} disabled={disabled} placeholder="Add, then press Enter" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add() } }} />
      <Button type="button" variant="outline" disabled={disabled || !draft.trim()} onClick={add}>Add</Button>
    </div>
  </div>
}

function ModelsControl({ id, value, disabled, onChange, setting }: ControlProps) {
  const { enabled, value: catalogue, error } = useModels()
  const chosen = Array.isArray(value) ? value : []
  if (!catalogue) return <p className="text-sm text-muted-foreground">{error || 'Loading models…'}</p>
  return <OrderedModels id={id} chosen={chosen} options={enabled.map(model => ({ id: model.id, label: model.name }))} max={setting.max_items ?? 5} disabled={disabled}
    empty="None chosen: the talking model does this job." placeholder={chosen.length ? 'Add a backup model' : 'Add a model'} onChange={onChange} />
}

function SliderControl({ setting, value, disabled, onChange }: ControlProps) {
  const [draft, setDraft] = useState(typeof value === 'number' ? value : 50)
  useEffect(() => { if (typeof value === 'number') queueMicrotask(() => setDraft(value)) }, [value])
  const first = (next: number | readonly number[]) => Array.isArray(next) ? next[0] : next as number
  return <div className="flex flex-col gap-2">
    <Slider value={draft} min={setting.min ?? 0} max={setting.max ?? 100} step={setting.step ?? 10} disabled={disabled} getAriaLabel={() => setting.title}
      onValueChange={next => setDraft(first(next))} onValueCommitted={next => { if (first(next) !== value) onChange(first(next)) }} />
    {setting.ends && <div className="flex justify-between text-xs text-muted-foreground"><span>{setting.ends[0]}</span><span>{setting.ends[1]}</span></div>}
  </div>
}

function TimeZoneControl({ id, value, disabled, onChange }: ControlProps) {
  const zones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone') } catch { return [] } }, [])
  return <Select value={String(value ?? '')} disabled={disabled} onValueChange={next => { if (next) onChange(String(next)) }} items={zones.map(zone => ({ value: zone, label: zone.replaceAll('_', ' ') }))}>
    <SelectTrigger id={id} className="w-full sm:w-64"><SelectValue /></SelectTrigger>
    <SelectContent>{zones.map(zone => <SelectItem key={zone} value={zone}>{zone.replaceAll('_', ' ')}</SelectItem>)}</SelectContent>
  </Select>
}

/** The one control for a setting's type. */
export function SettingControl(props: ControlProps) {
  const { setting, id, value, disabled, onChange } = props
  switch (setting.type) {
    case 'toggle':
      return <Switch id={id} checked={value === true} disabled={disabled} onCheckedChange={checked => onChange(checked)} />
    case 'select': {
      // The menu works in strings; numbers (minutes, percent) map back to their real value.
      const options = setting.options ?? []
      return <Select value={String(value)} disabled={disabled} items={options.map(option => ({ value: String(option.value), label: option.label }))}
        onValueChange={next => { const chosen = options.find(option => String(option.value) === next); if (chosen && chosen.value !== value) onChange(chosen.value) }}>
        <SelectTrigger id={id} className="w-full sm:w-56"><SelectValue>{optionLabel(setting, value)}</SelectValue></SelectTrigger>
        <SelectContent>{options.map(option => <SelectItem key={String(option.value)} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    }
    case 'list': {
      const chosen = Array.isArray(value) ? value : []
      return <div role="group" aria-labelledby={`${id}-title`} className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">{(setting.options ?? []).map(option => {
        const optionId = `${id}-${option.value}`
        return <Label key={String(option.value)} htmlFor={optionId} className="flex items-center gap-2.5 font-normal">
          <Checkbox id={optionId} checked={chosen.includes(String(option.value))} disabled={disabled}
            onCheckedChange={checked => onChange(checked ? [...chosen, String(option.value)] : chosen.filter(item => item !== option.value))} />{option.label}
        </Label>
      })}</div>
    }
    case 'number':
      return <NumberControl {...props} />
    case 'slider':
      return <SliderControl {...props} />
    case 'time':
      return <Input id={id} type="time" className="w-36" value={String(value ?? '')} disabled={disabled} onChange={event => { if (event.target.value) onChange(event.target.value) }} />
    case 'date':
      return <div className="flex items-center gap-2">
        <Input id={id} type="date" className="w-40" value={String(value ?? '')} disabled={disabled} onChange={event => onChange(event.target.value || null)} />
        {value && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>Clear</Button>}
      </div>
    case 'timezone':
      return <TimeZoneControl {...props} />
    case 'text':
      return <TextControl {...props} />
    case 'textarea':
      return <TextControl {...props} long />
    case 'tags':
      return <TagsControl {...props} />
    case 'models':
      return <ModelsControl {...props} />
    default:
      return null
  }
}
