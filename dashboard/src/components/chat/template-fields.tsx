import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PromptTemplate, TemplateValues, TemplateField } from '@/lib/chat/prompt-templates'

const required = <span className="ml-1 text-xs text-muted-foreground">required</span>

export function TemplateFields({ template, values, onChange, disabled = false, onSubmit }: {
  template: PromptTemplate; values: TemplateValues; onChange: (values: TemplateValues) => void; disabled?: boolean; onSubmit?: () => void
}) {
  const [listInputs, setListInputs] = useState<Record<string, string>>({})
  const handleKeyDown = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onSubmit?.() } }
  const handleListAdd = (fieldId: string) => {
    const trimmed = (listInputs[fieldId] || '').trim(); if (!trimmed) return
    onChange({ ...values, [fieldId]: [...((values[fieldId] as string[]) || []), trimmed] }); setListInputs({ ...listInputs, [fieldId]: '' })
  }
  const handleListRemove = (fieldId: string, index: number) => onChange({ ...values, [fieldId]: ((values[fieldId] as string[]) || []).filter((_, i) => i !== index) })
  const handleChoiceToggle = (fieldId: string, option: string, field: TemplateField) => {
    if (field.multiple) { const cur = (values[fieldId] as string[]) || []; onChange({ ...values, [fieldId]: cur.includes(option) ? cur.filter(o => o !== option) : [...cur, option] }) }
    else { const cur = values[fieldId] as string; onChange({ ...values, [fieldId]: cur === option ? '' : option }) }
  }
  const renderField = (field: TemplateField) => {
    const value = values[field.id], fieldId = `template-${template.id}-${field.id}`
    switch (field.type) {
      case 'shortText': case 'number': case 'date':
        return <div className="flex items-center gap-2 py-2">
          <Label htmlFor={fieldId} className="w-28 shrink-0 text-xs text-muted-foreground">{field.label}{field.required && required}</Label>
          <Input id={fieldId} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={value as string || ''} onChange={e => onChange({ ...values, [field.id]: e.target.value })} placeholder={field.example} disabled={disabled} onKeyDown={handleKeyDown} />
        </div>
      case 'longText':
        return <div className="py-2">
          <Label htmlFor={fieldId} className="text-xs text-muted-foreground">{field.label}{field.required && required}</Label>
          <Textarea id={fieldId} rows={2} value={value as string || ''} onChange={e => onChange({ ...values, [field.id]: e.target.value })} placeholder={field.example} disabled={disabled} onKeyDown={handleKeyDown} />
        </div>
      case 'list': {
        const listItems = (value as string[]) || []
        return <div className="py-2">
          <Label htmlFor={`${fieldId}-add`} className="text-xs text-muted-foreground">{field.label}{field.required && required}</Label>
          {listItems.map((item, index) => <div key={index} className="flex items-center gap-2 mt-1"><span className="text-sm flex-1">{item}</span><Button type="button" size="icon" variant="ghost" onClick={() => handleListRemove(field.id, index)} disabled={disabled} aria-label={`Remove ${item}`}><X className="h-3 w-3" /></Button></div>)}
          <Input id={`${fieldId}-add`} placeholder="Add item" value={listInputs[field.id] || ''} onChange={e => setListInputs({ ...listInputs, [field.id]: e.target.value })} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onSubmit?.() } else if (e.key === 'Enter') { e.preventDefault(); handleListAdd(field.id) } }} disabled={disabled} className="mt-1" />
        </div>
      }
      case 'choice': {
        const selectedValue = field.multiple ? (value as string[]) || [] : (value as string) || ''
        return <div className="py-2"><div role="group" aria-label={field.label} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{field.label}{field.required && required}</Label>
          <div className="flex flex-wrap gap-1">{(field.options || []).map(option => <Button key={option} type="button" size="sm" variant={field.multiple ? (selectedValue as string[]).includes(option) ? 'secondary' : 'ghost' : selectedValue === option ? 'secondary' : 'ghost'} onClick={() => handleChoiceToggle(field.id, option, field)} disabled={disabled} aria-pressed={field.multiple ? (selectedValue as string[]).includes(option) : selectedValue === option}>{option}</Button>)}</div>
        </div></div>
      }
      case 'switch':
        return <div className="flex items-center gap-2 py-2">
          <Label htmlFor={fieldId} className="text-xs text-muted-foreground">{field.label}{field.required && required}</Label>
          <Switch id={fieldId} checked={value as boolean || false} onCheckedChange={checked => onChange({ ...values, [field.id]: checked })} disabled={disabled} />
        </div>
      default: return null
    }
  }
  return <div>{template.fields.map((field, index) => <div key={field.id} className={cn(index > 0 && 'border-t')}>{renderField(field)}</div>)}</div>
}