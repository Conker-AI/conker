export type FieldType = 'shortText' | 'longText' | 'list' | 'choice' | 'number' | 'date' | 'switch'
export type TemplateField = { id: string; label: string; type: FieldType; required?: boolean; example?: string; help?: string; options?: readonly string[]; multiple?: boolean }
export type PromptTemplate = { id: string; name: string; description: string; fields: readonly TemplateField[] }
export type FieldValue = string | string[] | boolean
export type TemplateValues = Record<string, FieldValue>
export const PROMPT_LIMIT = 16000

export const builtinTemplates: readonly PromptTemplate[] = [
  {
    id: 'research',
    name: 'Research',
    description: 'Find out about a subject and report back.',
    fields: [
      { id: 'subject', label: 'Subject', type: 'longText', required: true, example: 'Best laptop under $1000 for coding and travel' },
      { id: 'do', label: 'Do', type: 'list', example: 'Compare battery life' },
      { id: 'dont', label: 'Don\'t', type: 'list', example: 'Gaming laptops' },
      { id: 'output', label: 'Output', type: 'choice', options: ['Report', 'Table', 'Slides', 'File'] },
      { id: 'context', label: 'Context', type: 'longText', example: 'I write Python and travel by train' }
    ] as const
  },
  {
    id: 'writing',
    name: 'Writing',
    description: 'Draft text for someone in a chosen tone.',
    fields: [
      { id: 'topic', label: 'What to write', type: 'longText', required: true },
      { id: 'audience', label: 'Audience', type: 'shortText' },
      { id: 'tone', label: 'Tone', type: 'choice', options: ['Friendly', 'Neutral', 'Formal', 'Persuasive'] },
      { id: 'length', label: 'Length', type: 'choice', options: ['Short', 'Medium', 'Long'] },
      { id: 'include', label: 'Must include', type: 'list' }
    ] as const
  },
  {
    id: 'code',
    name: 'Code',
    description: 'Write or change code.',
    fields: [
      { id: 'task', label: 'Task', type: 'longText', required: true },
      { id: 'language', label: 'Language', type: 'shortText', example: 'TypeScript' },
      { id: 'constraints', label: 'Constraints', type: 'list' },
      { id: 'tests', label: 'Include tests', type: 'switch' }
    ] as const
  },
  {
    id: 'analysis',
    name: 'Analysis',
    description: 'Weigh options and recommend one.',
    fields: [
      { id: 'question', label: 'Question', type: 'longText', required: true },
      { id: 'options', label: 'Options', type: 'list' },
      { id: 'criteria', label: 'Criteria', type: 'list' },
      { id: 'deadline', label: 'Decide by', type: 'date' }
    ] as const
  },
  {
    id: 'summary',
    name: 'Summary',
    description: 'Shorten something long.',
    fields: [
      { id: 'source', label: 'Text to summarize', type: 'longText', required: true },
      { id: 'format', label: 'Format', type: 'choice', options: ['Paragraph', 'Bullet points', 'One line'] },
      { id: 'maxWords', label: 'Maximum words', type: 'number' }
    ] as const
  }
] as const

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