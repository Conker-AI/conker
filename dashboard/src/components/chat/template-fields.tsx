import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { X } from 'lucide-react'
import type { PromptTemplate, TemplateValues, TemplateField } from '@/lib/chat/prompt-templates'

export function TemplateFields({ 
  template, 
  values, 
  onChange, 
  disabled = false, 
  onSubmit 
}: {
  template: PromptTemplate
  values: TemplateValues
  onChange: (values: TemplateValues) => void
  disabled?: boolean
  onSubmit?: () => void
}) {
  const [listInputs, setListInputs] = useState<Record<string, string>>({})

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.()
    }
  }

  const handleListAdd = (fieldId: string) => {
    const input = listInputs[fieldId] || ''
    const trimmed = input.trim()
    if (!trimmed) return
    
    const current = (values[fieldId] as string[]) || []
    onChange({ ...values, [fieldId]: [...current, trimmed] })
    setListInputs({ ...listInputs, [fieldId]: '' })
  }

  const handleListRemove = (fieldId: string, index: number) => {
    const current = (values[fieldId] as string[]) || []
    const updated = current.filter((_, i) => i !== index)
    onChange({ ...values, [fieldId]: updated })
  }

  const handleChoiceToggle = (fieldId: string, option: string, field: TemplateField) => {
    if (field.multiple) {
      const current = (values[fieldId] as string[]) || []
      const updated = current.includes(option)
        ? current.filter(item => item !== option)
        : [...current, option]
      onChange({ ...values, [fieldId]: updated })
    } else {
      const current = values[fieldId] as string
      onChange({ ...values, [fieldId]: current === option ? '' : option })
    }
  }

  const renderField = (field: TemplateField) => {
    const value = values[field.id]
    const fieldId = `template-${template.id}-${field.id}`

    switch (field.type) {
      case 'shortText':
      case 'number':
      case 'date':
        return (
          <div className="flex items-center gap-2 py-2">
            <Label htmlFor={fieldId} className="w-28 shrink-0 text-xs text-muted-foreground">
              {field.label}
              {field.required && <span className="ml-1">required</span>}
            </Label>
            <Input
              id={fieldId}
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              value={value as string || ''}
              onChange={e => onChange({ ...values, [field.id]: e.target.value })}
              placeholder={field.example}
              disabled={disabled}
              onKeyDown={handleKeyDown}
            />
          </div>
        )

      case 'longText':
        return (
          <div className="border-t py-2">
            <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
              {field.label}
              {field.required && <span className="ml-1">required</span>}
            </Label>
            <Textarea
              id={fieldId}
              rows={2}
              value={value as string || ''}
              onChange={e => onChange({ ...values, [field.id]: e.target.value })}
              placeholder={field.example}
              disabled={disabled}
              onKeyDown={handleKeyDown}
            />
          </div>
        )

      case 'list': {
        const listItems = (value as string[]) || []
        return (
          <div className="border-t py-2">
            <Label htmlFor={`${fieldId}-add`} className="text-xs text-muted-foreground">
              {field.label}
              {field.required && <span className="ml-1">required</span>}
            </Label>
            {listItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2 mt-1">
                <span className="text-sm flex-1">{item}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleListRemove(field.id, index)}
                  disabled={disabled}
                  aria-label={`Remove ${item}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Input
              id={`${fieldId}-add`}
              placeholder="Add item"
              value={listInputs[field.id] || ''}
              onChange={e => setListInputs({ ...listInputs, [field.id]: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleListAdd(field.id)
                } else {
                  handleKeyDown(e)
                }
              }}
              disabled={disabled}
              className="mt-1"
            />
          </div>
        )
      }

      case 'choice': {
        const selectedValue = field.multiple ? (value as string[]) || [] : (value as string) || ''
        return (
          <div className="border-t py-2">
            <div role="group" aria-label={field.label} className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {field.label}
                {field.required && <span className="ml-1">required</span>}
              </Label>
              <div className="flex flex-wrap gap-1">
                {(field.options || []).map(option => (
                  <Button
                    key={option}
                    size="sm"
                    variant={field.multiple ? 
                      (selectedValue as string[]).includes(option) ? 'secondary' : 'ghost' :
                      selectedValue === option ? 'secondary' : 'ghost'
                    }
                    onClick={() => handleChoiceToggle(field.id, option, field)}
                    disabled={disabled}
                    aria-pressed={field.multiple ? 
                      (selectedValue as string[]).includes(option) :
                      selectedValue === option
                    }
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )
      }

      case 'switch':
        return (
          <div className="flex items-center gap-2 py-2 border-t">
            <Label htmlFor={fieldId} className="text-sm">
              {field.label}
              {field.required && <span className="ml-1">required</span>}
            </Label>
            <Switch
              id={fieldId}
              checked={value as boolean || false}
              onCheckedChange={checked => onChange({ ...values, [field.id]: checked })}
              disabled={disabled}
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-0">
      {template.fields.map((field, index) => (
        <div key={field.id}>
          {index > 0 && field.type !== 'shortText' && field.type !== 'number' && field.type !== 'date' && field.type !== 'switch' && <div className="border-t" />}
          {renderField(field)}
        </div>
      ))}
    </div>
  )
}