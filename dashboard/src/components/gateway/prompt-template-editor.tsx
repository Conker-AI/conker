import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { FormActions, OverlayBody } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { blankField, editorFrom, FIELD_TYPE_HINTS, FIELD_TYPE_LABELS, isChanged, toDraft, type EditorField, type EditorState } from '@/lib/chat/template-editor'
import { isStaleTemplate, promptMessage } from '@/lib/gateway/prompt-errors'
import { FIELD_TYPES, TEMPLATE_LIMITS, type FieldType, type PiTemplate, type PromptTemplatesClient } from '@/lib/gateway/prompt-templates'

type Props = {
  client: PromptTemplatesClient
  /** The template being edited; null makes a new one. */
  template: PiTemplate | null
  initial: EditorState
  onSaved: (template: PiTemplate) => void
  onCancel: () => void
  onPending: (pending: boolean) => void
}

const typeItems = FIELD_TYPES.map(value => ({ value, label: FIELD_TYPE_LABELS[value] }))

function FieldEditor({ field, index, count, disabled, onChange, onMove, onRemove }: { field: EditorField; index: number; count: number; disabled: boolean; onChange: (next: EditorField) => void; onMove: (by: -1 | 1) => void; onRemove: () => void }) {
  const name = field.label.trim() || `Field ${index + 1}`
  const id = (part: string) => `${field.key}-${part}`
  return <fieldset className="space-y-3 rounded-lg border p-3" disabled={disabled}>
    <legend className="px-1 text-xs font-medium text-muted-foreground">Field {index + 1}</legend>
    <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
      <div className="space-y-1.5"><Label htmlFor={id('label')}>Label</Label><Input id={id('label')} value={field.label} maxLength={TEMPLATE_LIMITS.label} onChange={event => onChange({ ...field, label: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={id('type')}>Kind</Label>
        <Select value={field.type} items={typeItems} onValueChange={value => { if (value) onChange({ ...field, type: value as FieldType, ...(value === 'choice' ? {} : { multiple: false, optionsText: '' }) }) }}>
          <SelectTrigger id={id('type')} className="w-full"><SelectValue>{FIELD_TYPE_LABELS[field.type]}</SelectValue></SelectTrigger>
          <SelectContent>{typeItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">{FIELD_TYPE_HINTS[field.type]}</p>
    {field.type === 'choice' && <div className="space-y-1.5"><Label htmlFor={id('options')}>Options, one per line</Label>
      <Textarea id={id('options')} rows={3} value={field.optionsText} onChange={event => onChange({ ...field, optionsText: event.target.value })} />
      <div className="flex items-center gap-2"><Switch id={id('multiple')} checked={field.multiple} onCheckedChange={checked => onChange({ ...field, multiple: checked })} /><Label htmlFor={id('multiple')} className="text-sm font-normal">Allow several options</Label></div></div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor={id('example')}>Example (optional)</Label><Input id={id('example')} value={field.example} maxLength={TEMPLATE_LIMITS.hint} onChange={event => onChange({ ...field, example: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={id('help')}>Hint (optional)</Label><Input id={id('help')} value={field.help} maxLength={TEMPLATE_LIMITS.hint} onChange={event => onChange({ ...field, help: event.target.value })} /></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto flex items-center gap-2"><Switch id={id('required')} checked={field.required} onCheckedChange={checked => onChange({ ...field, required: checked })} /><Label htmlFor={id('required')} className="text-sm font-normal">Needed before the request can be sent</Label></div>
      <Button type="button" size="icon" variant="ghost" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp aria-hidden="true" /></Button>
      <Button type="button" size="icon" variant="ghost" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown aria-hidden="true" /></Button>
      <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${name}`} disabled={count === 1} onClick={onRemove}><Trash2 aria-hidden="true" /></Button>
    </div>
  </fieldset>
}

/** Make or change one template: its name, description and 1 to 12 typed fields. Pi needs the version you read to accept a change; a stale one is refused and your edits stay. */
export function PromptTemplateEditor({ client, template, initial, onSaved, onCancel, onPending }: Props) {
  const [state, setState] = useState(initial)
  const [revision, setRevision] = useState(template?.revision ?? 0)
  const [pending, setPending] = useState(false), [problems, setProblems] = useState<string[]>([]), [stale, setStale] = useState(false), [error, setError] = useState<string | null>(null)
  const [baseline, setBaseline] = useState(initial)
  const patch = (next: Partial<EditorState>) => { setState(current => ({ ...current, ...next })); setProblems([]); setError(null) }
  const setField = (key: string, next: EditorField) => patch({ fields: state.fields.map(field => field.key === key ? next : field) })
  const move = (index: number, by: -1 | 1) => { const fields = [...state.fields]; [fields[index], fields[index + by]] = [fields[index + by], fields[index]]; patch({ fields }) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    const { draft, problems: found } = toDraft(state)
    if (!draft) { setProblems(found); return }
    setPending(true); onPending(true); setError(null); setStale(false)
    try {
      const saved = template ? await client.update(template.id, draft, revision) : await client.create(draft)
      onSaved(saved)
    } catch (cause) {
      if (isStaleTemplate(cause)) setStale(true)
      setError(promptMessage(cause))
    } finally { setPending(false); onPending(false) }
  }
  // After a stale refusal: read Pi's current copy. Either drop the edits for it, or keep them and save over it.
  const loadLatest = async (keepEdits: boolean) => {
    if (!template || pending) return
    setPending(true); onPending(true)
    try {
      const latest = await client.get(template.id)
      setRevision(latest.revision); setStale(false); setProblems([])
      if (keepEdits) setError('Your edits are kept. Save again to replace the newer version.')
      else { const fresh = editorFrom(latest); setState(fresh); setBaseline(fresh); setError(null) }
    } catch (cause) { setError(promptMessage(cause)) }
    finally { setPending(false); onPending(false) }
  }
  const atLimit = state.fields.length >= TEMPLATE_LIMITS.fields
  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
    <OverlayBody>
      <div className="space-y-1.5"><Label htmlFor="template-name">Name</Label><Input id="template-name" value={state.name} maxLength={TEMPLATE_LIMITS.name} disabled={pending} onChange={event => patch({ name: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="template-description">What it is for (optional)</Label><Input id="template-description" value={state.description} maxLength={TEMPLATE_LIMITS.description} disabled={pending} onChange={event => patch({ description: event.target.value })} /></div>
      <div className="space-y-3">
        <p className="text-sm font-medium">Fields <span className="font-normal text-muted-foreground">{state.fields.length} of {TEMPLATE_LIMITS.fields}</span></p>
        {state.fields.map((field, index) => <FieldEditor key={field.key} field={field} index={index} count={state.fields.length} disabled={pending} onChange={next => setField(field.key, next)} onMove={by => move(index, by)} onRemove={() => patch({ fields: state.fields.filter(item => item.key !== field.key) })} />)}
        <Button type="button" variant="outline" size="sm" disabled={pending || atLimit} onClick={() => patch({ fields: [...state.fields, blankField()] })}><Plus aria-hidden="true" />Add a field</Button>
        {atLimit && <p className="text-xs text-muted-foreground">That is the most a template can hold.</p>}
      </div>
      {problems.length > 0 && <div role="alert" className="space-y-1 text-sm text-destructive-foreground"><p>Fix this first:</p><ul className="list-disc pl-5">{problems.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive-foreground"><p>{error}{stale ? ' Your edits are still here.' : ''}</p>{stale && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void loadLatest(false)}>Load the latest version</Button><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void loadLatest(true)}>Keep my edits</Button></div>}</div>}
    </OverlayBody>
    <FormActions inset>
      <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending || (template !== null && !stale && !isChanged(state, baseline))}>{pending ? 'Saving…' : template ? 'Save changes' : 'Save template'}</Button>
    </FormActions>
  </form>
}
