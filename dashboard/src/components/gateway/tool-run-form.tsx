import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { RunField, RunValues } from '@/lib/tool-run'

const NOT_SET = '__not_set__'

/** What to write, for fields whose shape isn't obvious from the box alone. */
function shapeHint(field: RunField) {
  if (field.kind === 'list') return field.items === 'text' ? 'One per line.' : 'One number per line.'
  if (field.kind === 'json') return field.shape === 'array' ? 'Written as JSON, for example ["a", "b"].' : 'Written as JSON, for example {"key": "value"}.'
  return null
}

/** One typed field per tool input; the label says when it can be left empty. */
export function RunInputsForm({ id, fields, values, errors, disabled, onChange }: {
  id: string; fields: readonly RunField[]; values: RunValues; errors: Record<string, string>; disabled: boolean
  onChange: (name: string, value: string | boolean) => void
}) {
  return <div className="flex flex-col gap-4">{fields.map(field => {
    const control = `${id}-${field.name}`, error = errors[field.name], hint = shapeHint(field)
    const help = [field.help, hint].filter(Boolean).join(' ')
    const describedBy = [help && `${control}-help`, error && `${control}-error`].filter(Boolean).join(' ') || undefined
    const common = { id: control, disabled, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy }
    const text = typeof values[field.name] === 'string' ? values[field.name] as string : ''
    let input
    if (field.kind === 'switch') {
      input = <div className="flex min-h-(--control-height) items-center gap-3"><Switch {...common} checked={values[field.name] === true} onCheckedChange={checked => onChange(field.name, checked)} /><span className="text-sm" aria-hidden="true">{values[field.name] === true ? 'Yes' : 'No'}</span></div>
    } else if (field.kind === 'choice') {
      const choices = [...field.required ? [] : [{ value: NOT_SET, label: 'Not set' }], ...field.choices ?? []]
      input = <Select value={text || (field.required ? null : NOT_SET)} disabled={disabled} items={choices} onValueChange={value => onChange(field.name, value === null || value === NOT_SET ? '' : String(value))}>
        <SelectTrigger {...common} className="w-full sm:max-w-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>{choices.map(choice => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent>
      </Select>
    } else if (field.kind === 'text' || field.kind === 'number' || field.kind === 'integer') {
      input = <Input {...common} value={text} maxLength={field.maxLength} inputMode={field.kind === 'text' ? undefined : 'decimal'} autoComplete="off" onChange={event => onChange(field.name, event.target.value)} />
    } else {
      input = <Textarea {...common} value={text} rows={field.kind === 'long-text' ? 4 : 3} maxLength={field.maxLength} spellCheck={field.kind === 'json' ? false : undefined}
        className={field.kind === 'json' ? 'font-mono text-sm' : undefined} onChange={event => onChange(field.name, event.target.value)} />
    }
    return <div key={field.name} className="flex flex-col gap-2">
      <Label htmlFor={control}>{field.label}{field.required ? '' : <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
      {input}
      {help && <p id={`${control}-help`} className="text-sm leading-5 text-muted-foreground">{help}</p>}
      {error && <p id={`${control}-error`} className="text-sm leading-5 text-destructive-foreground">{error}</p>}
    </div>
  })}</div>
}
