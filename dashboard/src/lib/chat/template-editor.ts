import { FIELD_TYPES, TEMPLATE_LIMITS, type FieldType, type PiTemplate, type PiTemplateField, type TemplateDraft } from '@/lib/gateway/prompt-templates'

/** One field as the editor holds it. `id` is Pi's own and never shown; a new field gets one from its label when the template is saved. */
export type EditorField = { key: string; id: string | null; label: string; type: FieldType; required: boolean; multiple: boolean; example: string; help: string; optionsText: string }
export type EditorState = { name: string; description: string; fields: EditorField[] }

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  shortText: 'Short text',
  longText: 'Long text',
  list: 'List',
  choice: 'Choice',
  number: 'Number',
  date: 'Date',
  switch: 'Yes or no',
}
export const FIELD_TYPE_HINTS: Record<FieldType, string> = {
  shortText: 'One line.',
  longText: 'Several lines.',
  list: 'Items added one by one.',
  choice: 'Pick from options you list.',
  number: 'A number.',
  date: 'A day.',
  switch: 'Left out of the request unless it is on.',
}
let counter = 0
const nextKey = () => `field-${++counter}`

export const blankField = (): EditorField => ({ key: nextKey(), id: null, label: '', type: 'shortText', required: false, multiple: false, example: '', help: '', optionsText: '' })
export const blankTemplate = (): EditorState => ({ name: '', description: '', fields: [{ ...blankField(), label: 'Request', type: 'longText', required: true }] })

export function editorFrom(template: PiTemplate): EditorState {
  return {
    name: template.name,
    description: template.description,
    fields: template.fields.map(field => ({
      key: nextKey(),
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      multiple: field.multiple,
      example: field.example ?? '',
      help: field.help ?? '',
      optionsText: (field.options ?? []).join('\n'),
    })),
  }
}

const optionList = (text: string) =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

/** A field id from its label: letters and digits, camel case, never starting with a digit, not already taken. */
export function fieldIdFor(label: string, taken: ReadonlySet<string>): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  let base = words.map((word, index) => (index ? word[0].toUpperCase() + word.slice(1) : word[0].toLowerCase() + word.slice(1))).join('')
  if (!/^[A-Za-z]/.test(base)) base = `field${base}`
  base = base.slice(0, TEMPLATE_LIMITS.fieldId - 3)
  let id = base,
    number = 2
  while (taken.has(id)) id = `${base}${number++}`
  return id
}

/** The draft Pi gets, or the plain sentences that say what to fix. Pi checks everything again. */
export function toDraft(state: EditorState): { draft: TemplateDraft | null; problems: string[] } {
  const problems: string[] = []
  const name = state.name.trim(),
    description = state.description.trim()
  if (!name) problems.push('Give the template a name.')
  else if (name.length > TEMPLATE_LIMITS.name) problems.push(`The name has at most ${TEMPLATE_LIMITS.name} characters.`)
  if (description.length > TEMPLATE_LIMITS.description) problems.push(`The description has at most ${TEMPLATE_LIMITS.description} characters.`)
  if (!state.fields.length) problems.push('Add at least one field.')
  if (state.fields.length > TEMPLATE_LIMITS.fields) problems.push(`A template has at most ${TEMPLATE_LIMITS.fields} fields.`)
  const taken = new Set(state.fields.flatMap(field => (field.id ? [field.id] : [])))
  const fields: PiTemplateField[] = []
  state.fields.forEach((field, index) => {
    const where = field.label.trim() ? `The field "${field.label.trim()}"` : `Field ${index + 1}`
    const label = field.label.trim()
    if (!label) problems.push(`${where} needs a label.`)
    else if (label.length > TEMPLATE_LIMITS.label) problems.push(`${where} has a label of more than ${TEMPLATE_LIMITS.label} characters.`)
    if (field.example.trim().length > TEMPLATE_LIMITS.hint || field.help.trim().length > TEMPLATE_LIMITS.hint) problems.push(`${where} has an example or hint of more than ${TEMPLATE_LIMITS.hint} characters.`)
    const options = field.type === 'choice' ? optionList(field.optionsText) : []
    if (field.type === 'choice') {
      if (!options.length) problems.push(`${where} needs at least one option, one per line.`)
      if (options.length > TEMPLATE_LIMITS.options) problems.push(`${where} has at most ${TEMPLATE_LIMITS.options} options.`)
      if (options.some(option => option.length > TEMPLATE_LIMITS.option)) problems.push(`${where} has an option of more than ${TEMPLATE_LIMITS.option} characters.`)
      if (new Set(options.map(option => option.toLocaleLowerCase())).size !== options.length) problems.push(`${where} lists the same option twice.`)
    }
    const id = field.id ?? fieldIdFor(label || 'field', taken)
    taken.add(id)
    const example = field.example.trim(),
      help = field.help.trim()
    fields.push({ id, label, type: field.type, required: field.required, multiple: field.type === 'choice' && field.multiple, ...(example ? { example } : {}), ...(help ? { help } : {}), ...(field.type === 'choice' ? { options } : {}) })
  })
  return { draft: problems.length ? null : { name, description, fields }, problems }
}

export const isFieldType = (value: unknown): value is FieldType => FIELD_TYPES.includes(value as FieldType)

/** True when the editor holds something other than the template it was opened from. */
export function isChanged(state: EditorState, from: EditorState): boolean {
  const flat = (editor: EditorState) => JSON.stringify([editor.name.trim(), editor.description.trim(), editor.fields.map(f => [f.id, f.label, f.type, f.required, f.multiple, f.example, f.help, f.optionsText])])
  return flat(state) !== flat(from)
}
