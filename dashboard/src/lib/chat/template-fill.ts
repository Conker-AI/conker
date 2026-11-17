import type { PromptTemplate } from './prompt-templates'

/** What Pi's wand did with a template: the fields it filled from the draft, the ones it left empty, and the required ones still empty. */
export type TemplateFill = { filled: string[]; blank: string[]; missing: string[] }

/** Labels in the template's own order. `fields` is Pi's accepted values by field id; `missing` is Pi's list of required labels still empty. */
export function templateFill(template: PromptTemplate, reply: { fields?: Record<string, unknown>; missing?: string[] }): TemplateFill {
  const missing = reply.missing ?? []
  const filled = template.fields.filter(field => field.id in (reply.fields ?? {})).map(field => field.label)
  const blank = template.fields.map(field => field.label).filter(label => !filled.includes(label) && !missing.includes(label))
  return { filled, blank, missing }
}
