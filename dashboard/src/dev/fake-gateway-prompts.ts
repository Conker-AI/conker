/**
 * Development-only prompt templates and the prompt wand, answered like Pi: the four starters, ids
 * and versions, a 409 `revision_conflict` on a stale change, at most 100 templates, and a fill of a
 * template from the draft with the same prompt text Pi builds. Nothing is saved on a server.
 * `conker-fake-fail` = template-stale makes the next change or delete of a template find it already
 * changed on another device (once), so the refusal can be seen.
 */
import { GatewayError } from '@/lib/gateway/transport'
import { compilePrompt, missingRequired, type FieldValue, type PromptTemplate } from '@/lib/chat/prompt-templates'
import { toPromptTemplate, type PiTemplate } from '@/lib/gateway/prompt-templates'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean | readonly string[]> }

const field = (id: string, label: string, type: string, extra: Json = {}) => ({ id, label, type, required: false, multiple: false, ...extra })
const STARTERS: [string, string, string, Json[]][] = [
  [
    'starter-research',
    'Research',
    'Find out about a subject and report back.',
    [
      field('subject', 'Subject', 'longText', { required: true, example: 'Best laptop under $1000 for coding and travel' }),
      field('do', 'Do', 'list', { example: 'Compare battery life' }),
      field('dont', "Don't", 'list', { example: 'Gaming laptops' }),
      field('output', 'Output', 'choice', { options: ['Report', 'Table', 'Slides', 'File'] }),
      field('context', 'Context', 'longText', { example: 'I write Python and travel by train' }),
    ],
  ],
  [
    'starter-bug-report',
    'Bug report',
    'Describe something that broke so it can be found and fixed.',
    [
      field('what', 'What happened', 'longText', { required: true }),
      field('expected', 'What you expected', 'longText'),
      field('steps', 'Steps to reproduce', 'list', { example: 'Open Settings, then Models' }),
      field('where', 'Where', 'shortText', { example: 'Chat composer' }),
      field('severity', 'Severity', 'choice', { options: ['Low', 'Medium', 'High', 'Blocking'] }),
    ],
  ],
  [
    'starter-plan',
    'Plan',
    'Turn a goal into steps.',
    [
      field('goal', 'Goal', 'longText', { required: true }),
      field('deadline', 'Finish by', 'date'),
      field('constraints', 'Constraints', 'list'),
      field('detail', 'Detail', 'choice', { options: ['Outline', 'Step by step', 'With owners and dates'] }),
    ],
  ],
  [
    'starter-email',
    'Email',
    'Draft a message to someone in a chosen tone.',
    [
      field('purpose', 'Purpose', 'longText', { required: true }),
      field('recipient', 'To', 'shortText'),
      field('tone', 'Tone', 'choice', { options: ['Friendly', 'Neutral', 'Formal', 'Firm'] }),
      field('length', 'Length', 'choice', { options: ['Short', 'Medium', 'Long'] }),
      field('include', 'Must include', 'list'),
    ],
  ],
]
const MAX_TEMPLATES = 100
const TEMPLATE_ID = /^(?:tpl_[0-9a-f]{32}|starter-[a-z0-9]+(?:-[a-z0-9]+)*)$/
const refuse = (status: number, code: string): never => {
  throw new GatewayError(status >= 500 ? 'dependency' : 'http', status, undefined, code as GatewayError['code'])
}

export function createFakePrompts() {
  const at = Date.now() / 1000
  const items: PiTemplate[] = STARTERS.map(
    ([id, name, description, fields], index) => ({ id, name, description, fields, starter: true, revision: 1, createdAt: at - 86_400 + index / 1000, updatedAt: at - 86_400 + index / 1000 }) as PiTemplate,
  )
  let serial = 0
  const find = (id: string) => {
    const row = TEMPLATE_ID.test(id) ? items.find(item => item.id === id) : undefined
    return row ?? refuse(404, 'template_not_found')
  }
  const body = (options: Request) => options.body ?? {}
  const ordered = () => [...items.filter(item => item.starter), ...items.filter(item => !item.starter).sort((a, b) => b.createdAt - a.createdAt)]
  const checked = (value: Json): Pick<PiTemplate, 'name' | 'description' | 'fields'> => {
    const fields = value.fields
    if (
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.length > 60 ||
      (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 200)) ||
      !Array.isArray(fields) ||
      fields.length < 1 ||
      fields.length > 12 ||
      new Set(fields.map(item => (item as Json).id)).size !== fields.length
    )
      return refuse(422, 'invalid')
    return { name: value.name.trim(), description: String(value.description ?? '').trim(), fields: fields as PiTemplate['fields'] }
  }
  /** Another device saved the template first: its version moves on, once. */
  const elsewhere = (row: PiTemplate) => {
    if (globalThis.sessionStorage?.getItem('conker-fake-fail') !== 'template-stale') return
    try {
      globalThis.sessionStorage.removeItem('conker-fake-fail')
    } catch {
      /* Preview storage is optional. */
    }
    Object.assign(row, { description: 'Changed on another device.', revision: row.revision + 1, updatedAt: Date.now() / 1000 })
  }
  const stale = (row: PiTemplate, expected: unknown) => {
    elsewhere(row)
    if (expected !== undefined && expected !== null && expected !== row.revision) refuse(409, 'revision_conflict')
  }

  /** What the model would take from the draft: a short answer fills each text field, a day names a date field, the first listed option that appears in the draft fills a choice. */
  function fill(template: PromptTemplate, draft: string) {
    const values: Record<string, FieldValue> = {}
    const lower = draft.toLowerCase()
    let main = false
    for (const item of template.fields) {
      if (item.type === 'longText' && !main) {
        values[item.id] = draft
        main = true
      } else if (item.type === 'choice') {
        const hit = (item.options ?? []).find(option => lower.includes(option.toLowerCase()))
        if (hit) values[item.id] = item.multiple ? [hit] : hit
      } else if (item.type === 'list') {
        const lines = draft
          .split(/[\n;]/)
          .map(line => line.trim())
          .filter(Boolean)
        if (/^(do|steps|constraints|include)/.test(item.id) && lines.length > 1) values[item.id] = lines.slice(1)
      }
    }
    return values
  }

  return {
    handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
      if (path === '/api/control/pi/prompts/enhance' && method === 'POST') {
        const text = String(body(options).text ?? '').trim()
        if (!text) return refuse(422, 'invalid')
        const templateId = body(options).templateId
        if (templateId === undefined || templateId === null) {
          return {
            text: `Goal: ${text}\n\nContext: say what you already know and what is unclear.\nOutput: a short answer first, then the reasons.`,
            notes: ['Added a goal, context and the shape of the answer.'],
            modelId: 'preview-drafting',
            templateId: null,
            fields: {},
            missing: [],
          }
        }
        const template = toPromptTemplate(find(String(templateId)))
        const values = fill(template, text)
        if (!Object.keys(values).length) return refuse(422, 'nothing_filled')
        const empty = Object.fromEntries(template.fields.map(item => [item.id, item.type === 'switch' ? false : item.type === 'list' || item.multiple ? [] : '']))
        const merged = { ...empty, ...values }
        return {
          text: compilePrompt(template, merged),
          notes: [`Filled ${Object.keys(values).length} of ${template.fields.length} fields from your draft.`],
          modelId: 'preview-drafting',
          templateId: template.id,
          fields: values,
          missing: missingRequired(template, merged),
        }
      }
      if (path === '/api/control/pi/prompts/templates' && method === 'GET') {
        const page = ordered()
        return { items: page, total: page.length }
      }
      if (path === '/api/control/pi/prompts/templates' && method === 'POST') {
        if (items.length >= MAX_TEMPLATES) return refuse(409, 'too_many')
        const stamp = Date.now() / 1000
        const row: PiTemplate = { id: `tpl_${(++serial).toString(16).padStart(32, '0')}`, ...checked(body(options)), starter: false, revision: 1, createdAt: stamp, updatedAt: stamp }
        items.push(row)
        return { template: row }
      }
      const match = path.match(/^\/api\/control\/pi\/prompts\/templates\/([^/]+?)(\/delete)?$/)
      if (!match) return undefined
      const row = find(match[1])
      if (match[2] && method === 'POST') {
        stale(row, body(options).expected_revision)
        items.splice(items.indexOf(row), 1)
        return { id: row.id, deleted: true }
      }
      if (method === 'GET') return { template: row }
      if (method === 'POST') {
        if (typeof body(options).expected_revision !== 'number') return refuse(422, 'invalid')
        stale(row, body(options).expected_revision)
        Object.assign(row, checked(body(options)), { revision: row.revision + 1, updatedAt: Date.now() / 1000 })
        return { template: row }
      }
      return undefined
    },
  }
}
