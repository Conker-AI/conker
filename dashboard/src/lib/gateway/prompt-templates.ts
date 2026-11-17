import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'
import type { PromptTemplate, TemplateField as FormField } from '@/lib/chat/prompt-templates'

/** Pi's limits on a template (docs/prompt-templates.md). The editor stops at them; Pi checks again. */
export const TEMPLATE_LIMITS = { templates: 100, fields: 12, name: 60, description: 200, label: 40, hint: 200, options: 20, option: 60, fieldId: 32 } as const
export const FIELD_TYPES = ['shortText', 'longText', 'list', 'choice', 'number', 'date', 'switch'] as const
export type FieldType = typeof FIELD_TYPES[number]
export const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/
const TEMPLATE_ID = /^(?:tpl_[0-9a-f]{32}|starter-[a-z0-9]+(?:-[a-z0-9]+)*)$/

const field = z.object({
  id: z.string().regex(FIELD_ID_PATTERN), label: z.string().min(1).max(TEMPLATE_LIMITS.label), type: z.enum(FIELD_TYPES),
  required: z.boolean(), multiple: z.boolean(),
  example: z.string().max(TEMPLATE_LIMITS.hint).nullish(), help: z.string().max(TEMPLATE_LIMITS.hint).nullish(),
  options: z.array(z.string().max(TEMPLATE_LIMITS.option)).min(1).max(TEMPLATE_LIMITS.options).nullish(),
}).strict()
const template = z.object({
  id: z.string().regex(TEMPLATE_ID), name: z.string().min(1).max(TEMPLATE_LIMITS.name), description: z.string().max(TEMPLATE_LIMITS.description),
  fields: z.array(field).min(1).max(TEMPLATE_LIMITS.fields), starter: z.boolean(), revision: z.number().int().min(1), createdAt: z.number(), updatedAt: z.number(),
}).strict()
const page = z.object({ items: z.array(template).max(TEMPLATE_LIMITS.templates), total: z.number().int().min(0) }).strict()
const receipt = z.object({ template }).strict()
const deleted = z.object({ id: z.string().regex(TEMPLATE_ID), deleted: z.boolean() }).strict()

export type PiTemplateField = z.infer<typeof field>
export type PiTemplate = z.infer<typeof template>
export type TemplatePage = z.infer<typeof page>
export type TemplateReceipt = z.infer<typeof receipt>
export type TemplateDeleted = z.infer<typeof deleted>
/** What the editor sends: the name, description and fields of one template. */
export type TemplateDraft = { name: string; description: string; fields: PiTemplateField[] }

/** Pi leaves unset hints out or sends null; the composer form wants them missing. */
export function toPromptTemplate(item: PiTemplate): PromptTemplate {
  const fields: FormField[] = item.fields.map(({ example, help, options, ...rest }) => ({
    ...rest, ...(example ? { example } : {}), ...(help ? { help } : {}), ...(options ? { options } : {}),
  }))
  return { id: item.id, name: item.name, description: item.description, fields }
}

const parse = <T,>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError('invalid-response')
  return result.data
}
const route = (id: string) => {
  if (!TEMPLATE_ID.test(id)) throw new GatewayError('validation')
  return `/api/control/pi/prompts/templates/${id}`
}

/** Pi's prompt templates: the owner's forms for a request. Saving one grants nothing, so the signed-in session is enough. */
export function createPromptTemplatesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    /** The starters first, then his own, newest first. */
    async list(signal?: AbortSignal): Promise<TemplatePage> {
      return parse(page, await auth.request('/api/control/pi/prompts/templates', { signal }))
    },
    async get(id: string, signal?: AbortSignal): Promise<PiTemplate> {
      return parse(receipt, await auth.request(route(id), { signal })).template
    },
    async create(draft: TemplateDraft): Promise<PiTemplate> {
      return parse(receipt, await auth.request('/api/control/pi/prompts/templates', { method: 'POST', body: draft })).template
    },
    /** Replaces the template; a stale revision is a 409 `revision_conflict`. */
    async update(id: string, draft: TemplateDraft, expectedRevision: number): Promise<PiTemplate> {
      return parse(receipt, await auth.request(route(id), { method: 'POST', body: { ...draft, expected_revision: expectedRevision } })).template
    },
    /** Deletes it, a starter too: a deleted starter does not come back. */
    async remove(id: string, expectedRevision: number): Promise<TemplateDeleted> {
      const result = parse(deleted, await auth.request(`${route(id)}/delete`, { method: 'POST', body: { expected_revision: expectedRevision } }))
      if (result.id !== id || !result.deleted) throw new GatewayError('invalid-response')
      return result
    },
  }
}

export type PromptTemplatesClient = ReturnType<typeof createPromptTemplatesClient>
