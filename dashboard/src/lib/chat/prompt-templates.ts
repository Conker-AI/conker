export type FieldType = 'shortText' | 'longText' | 'list' | 'choice' | 'number' | 'date' | 'switch'
export type TemplateField = { id: string; label: string; type: FieldType; required?: boolean; example?: string; help?: string; options?: readonly string[]; multiple?: boolean }
export type PromptTemplate = { id: string; name: string; description: string; fields: readonly TemplateField[] }
export type FieldValue = string | string[] | boolean
export type TemplateValues = Record<string, FieldValue>

export function emptyValues(template: PromptTemplate): TemplateValues {
  const values: TemplateValues = {}
  for (const field of template.fields) {
    switch (field.type) {
      case 'shortText':
      case 'longText':
      case 'number':
      case 'date':
        values[field.id] = ''
        break
      case 'list':
        values[field.id] = []
        break
      case 'choice':
        values[field.id] = field.multiple ? [] : ''
        break
      case 'switch':
        values[field.id] = false
        break
    }
  }
  return values
}

export function missingRequired(template: PromptTemplate, values: TemplateValues): string[] {
  const missing: string[] = []
  for (const field of template.fields) {
    if (!field.required) continue
    const value = values[field.id]
    if (field.type === 'switch') {
      if (value === false) missing.push(field.label)
    } else if (field.type === 'list' || (field.type === 'choice' && field.multiple)) {
      if (!Array.isArray(value) || value.length === 0) missing.push(field.label)
    } else {
      if (!value || (typeof value === 'string' && value.trim() === '')) missing.push(field.label)
    }
  }
  return missing
}

export function compilePrompt(template: PromptTemplate, values: TemplateValues): string {
  const lines: string[] = [`${template.name} request`]
  const blocks: string[] = []

  for (const field of template.fields) {
    const value = values[field.id]
    let isEmpty = false

    switch (field.type) {
      case 'switch':
        if (value === true) {
          blocks.push(`${field.label}: Yes`)
        } else {
          isEmpty = true
        }
        break
      case 'list':
        if (Array.isArray(value) && value.length > 0) {
          const trimmedItems = value.map(item => item.trim()).filter(item => item.length > 0)
          if (trimmedItems.length > 0) {
            const blockLines = [`${field.label}:`]
            for (const item of trimmedItems) {
              blockLines.push(`- ${item}`)
            }
            blocks.push(blockLines.join('\n'))
          } else {
            isEmpty = true
          }
        } else {
          isEmpty = true
        }
        break
      case 'choice':
        if (field.multiple) {
          if (Array.isArray(value) && value.length > 0) {
            blocks.push(`${field.label}: ${value.join(', ')}`)
          } else {
            isEmpty = true
          }
        } else {
          if (value && typeof value === 'string' && value.trim() !== '') {
            blocks.push(`${field.label}: ${value.trim()}`)
          } else {
            isEmpty = true
          }
        }
        break
      case 'longText':
        if (value && typeof value === 'string' && value.trim() !== '') {
          blocks.push(`${field.label}:\n${value.trim()}`)
        } else {
          isEmpty = true
        }
        break
      default:
        if (value && typeof value === 'string' && value.trim() !== '') {
          blocks.push(`${field.label}: ${value.trim()}`)
        } else {
          isEmpty = true
        }
        break
    }

    if (!isEmpty) {
      blocks.push('')
    }
  }

  if (blocks.length > 0) {
    lines.push('', ...blocks.slice(0, -1))
  }

  return lines.join('\n')
}
