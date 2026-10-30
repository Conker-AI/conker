import type { JsonValue } from './tool-workspace'
import type { EditorRun, GatewayEditorDrafts } from './gateway/editor-drafts'

/**
 * Running a tool by hand: the inputs form made from the tool's input list, what a run's answer
 * means in plain words, and its result in a readable shape. Pure, so the check script runs it.
 */

/** One input as ToolGate lists it; only name, type, required and description are always there. */
export type ToolInput = {
  name: string; type?: string; required?: boolean; description?: string; default?: unknown
  allowed_values?: readonly unknown[]; enum?: readonly unknown[]; item_type?: string
  minimum?: number; maximum?: number; min_length?: number; max_length?: number; min_items?: number; max_items?: number
}
export type RunFieldKind = 'text' | 'long-text' | 'number' | 'integer' | 'switch' | 'choice' | 'list' | 'json'
export type RunField = {
  name: string; label: string; required: boolean; help?: string; kind: RunFieldKind
  /** A choice's value is the option's JSON, so "3" stays a number and "true" a boolean. */
  choices?: { value: string; label: string }[]
  /** A list is one item per line: text or numbers. Lists of anything else are written as JSON. */
  items?: 'text' | 'number' | 'integer'
  /** What a JSON field must hold. */
  shape?: 'object' | 'array'
  min?: number; max?: number; minLength?: number; maxLength?: number; minItems?: number; maxItems?: number
  initial: string | boolean
}
export type RunValues = Record<string, string | boolean>

// ToolGate refuses arguments over 32 KB (editor_runs.Run).
export const ARGUMENT_LIMIT = 32768

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const scalar = (value: unknown): value is string | number | boolean => typeof value === 'string' || typeof value === 'boolean' || finite(value)

/** `include_questions` and `maxResults` read as "Include questions" and "Max results". */
export function inputLabel(name: string) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

/** The form for a tool's inputs, one typed field each, in the tool's order. */
export function runFields(inputs: readonly ToolInput[]): RunField[] {
  return inputs.filter(input => typeof input.name === 'string' && input.name).map(input => {
    const type = (input.type ?? 'string').toLowerCase(), required = input.required === true
    const base = { name: input.name, label: inputLabel(input.name), required, help: input.description?.trim() || undefined,
      min: finite(input.minimum) ? input.minimum : undefined, max: finite(input.maximum) ? input.maximum : undefined,
      minLength: finite(input.min_length) ? input.min_length : undefined, maxLength: finite(input.max_length) ? input.max_length : undefined,
      minItems: finite(input.min_items) ? input.min_items : undefined, maxItems: finite(input.max_items) ? input.max_items : undefined }
    const allowed = (input.allowed_values ?? input.enum ?? []).filter(scalar)
    const fallback = input.default
    if (allowed.length) return { ...base, kind: 'choice', choices: allowed.map(value => ({ value: JSON.stringify(value), label: String(value) })), initial: allowed.some(value => value === fallback) ? JSON.stringify(fallback) : '' }
    if (type === 'boolean') {
      // A required yes/no always has an answer; an optional one can be left out.
      if (required) return { ...base, kind: 'switch', initial: fallback === true }
      return { ...base, kind: 'choice', choices: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], initial: typeof fallback === 'boolean' ? String(fallback) : '' }
    }
    if (type === 'integer' || type === 'number') return { ...base, kind: type, initial: finite(fallback) ? String(fallback) : '' }
    if (type === 'array') {
      const item = (input.item_type ?? 'string').toLowerCase()
      if (item === 'string' || item === 'number' || item === 'integer') {
        const items = item === 'string' ? 'text' : item
        const initial = Array.isArray(fallback) && fallback.every(value => item === 'string' ? typeof value === 'string' : finite(value)) ? fallback.join('\n') : ''
        return { ...base, kind: 'list', items, initial }
      }
      return { ...base, kind: 'json', shape: 'array', initial: Array.isArray(fallback) ? JSON.stringify(fallback, null, 2) : '' }
    }
    if (type === 'object') return { ...base, kind: 'json', shape: 'object', initial: fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? JSON.stringify(fallback, null, 2) : '' }
    const initial = typeof fallback === 'string' ? fallback : ''
    return { ...base, kind: (base.maxLength ?? 0) > 200 ? 'long-text' : 'text', initial }
  })
}

export function initialValues(fields: readonly RunField[]): RunValues {
  return Object.fromEntries(fields.map(field => [field.name, field.initial]))
}

function number(field: RunField, text: string): number | string {
  const value = Number(text)
  if (!text || !Number.isFinite(value)) return 'Write a number, like 3 or 2.5.'
  if (field.kind === 'integer' || field.items === 'integer') { if (!Number.isInteger(value)) return 'Write a whole number, like 3.' }
  if (field.min !== undefined && value < field.min) return `Use ${field.min} or more.`
  if (field.max !== undefined && value > field.max) return `Use ${field.max} or less.`
  return value
}

function count(field: RunField, items: unknown[]): string | null {
  if (field.minItems !== undefined && items.length < field.minItems) return `Add at least ${field.minItems} ${field.minItems === 1 ? 'item' : 'items'}.`
  if (field.maxItems !== undefined && items.length > field.maxItems) return `Use at most ${field.maxItems} ${field.maxItems === 1 ? 'item' : 'items'}.`
  return null
}

/** One field's value as the tool takes it, or what to fix. An empty optional field is left out. */
function readField(field: RunField, raw: string | boolean | undefined): { value?: JsonValue; error?: string } {
  if (field.kind === 'switch') return { value: raw === true }
  const text = typeof raw === 'string' ? raw : ''
  if (text.trim() === '') return field.required ? { error: field.kind === 'choice' ? 'Choose one.' : field.kind === 'list' ? 'Add at least one item, one per line.' : 'Fill this in.' } : {}
  if (field.kind === 'choice') {
    const known = field.choices?.some(choice => choice.value === text)
    return known ? { value: JSON.parse(text) as JsonValue } : { error: 'Choose one of the options.' }
  }
  if (field.kind === 'number' || field.kind === 'integer') {
    const value = number(field, text.trim())
    return typeof value === 'number' ? { value } : { error: value }
  }
  if (field.kind === 'list') {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const items: JsonValue[] = []
    for (const [index, line] of lines.entries()) {
      if (field.items === 'text') { items.push(line); continue }
      const value = number(field, line)
      if (typeof value !== 'number') return { error: `Line ${index + 1}: ${value}` }
      items.push(value)
    }
    const problem = count(field, items)
    return problem ? { error: problem } : { value: items }
  }
  if (field.kind === 'json') {
    let value: unknown
    try { value = JSON.parse(text) } catch { return { error: field.shape === 'array' ? 'Write a JSON list, like ["a", "b"].' : 'Write a JSON object, like {"key": "value"}.' } }
    if (field.shape === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) return { error: field.shape === 'array' ? 'This must be a list in [ ].' : 'This must be an object in { }.' }
    const problem = Array.isArray(value) ? count(field, value) : null
    return problem ? { error: problem } : { value: value as JsonValue }
  }
  if (field.minLength !== undefined && text.length < field.minLength) return { error: `Use at least ${field.minLength} characters.` }
  if (field.maxLength !== undefined && text.length > field.maxLength) return { error: `Use at most ${field.maxLength} characters.` }
  return { value: text }
}

/** The run's arguments from the form, or every field to fix (nothing is sent until none are left). */
export function readRunInputs(fields: readonly RunField[], values: RunValues): { args: Record<string, JsonValue>; errors: null } | { args: null; errors: Record<string, string> } {
  const args: Record<string, JsonValue> = {}, errors: Record<string, string> = {}
  for (const field of fields) {
    const { value, error } = readField(field, values[field.name])
    if (error) errors[field.name] = error
    else if (value !== undefined) args[field.name] = value
  }
  if (Object.keys(errors).length) return { args: null, errors }
  if (new TextEncoder().encode(JSON.stringify(args)).length > ARGUMENT_LIMIT) return { args: null, errors: { '': 'These inputs are too long to send (32 KB limit). Shorten the longest one.' } }
  return { args, errors: null }
}

// --- What a run's answer means ---------------------------------------------------------------

export type RunAnswer = EditorRun['response']
export type RunState = 'working' | 'done' | 'failed' | 'approval' | 'unknown'
export type RunOutcome = { state: Exclude<RunState, 'working'>; reason: string | null; requestId: string | null }
/** The state words every screen uses (patterns.md); "Result unknown" as Activity says it. */
export const RUN_STATE: Record<RunState, string> = { working: 'Running', done: 'Done', failed: 'Failed', approval: 'Waiting for your OK', unknown: 'Result unknown' }

const refused: Record<string, string> = {
  LOCKED_DOWN: 'Tools are locked down on your server, so it didn’t run.',
  POLICY_DENIED: 'Conker’s key isn’t allowed to run this tool, so it didn’t run.',
  TOOL_UNAVAILABLE: 'This tool isn’t active on your server, so it didn’t run.',
  VALIDATION_ERROR: 'Your server didn’t accept these inputs, so it didn’t run. Check them and try again.',
  APPROVAL_INVALID: 'The approval was declined or ran out, so it didn’t run. Run it again to ask again.',
  REQUEST_REJECTED: 'Your server turned this run down, so it didn’t run.',
}

/** ToolGate's answer in the state words every screen uses; never "done" unless it says OK. */
export function runOutcome(answer: RunAnswer): RunOutcome {
  if (answer.code === 'OK') return { state: 'done', reason: null, requestId: null }
  if (answer.code === 'CONFIRMATION_REQUIRED') return { state: 'approval', reason: null, requestId: answer.request_id ?? null }
  if (answer.code === 'OUTCOME_UNKNOWN' || answer.code === 'IN_PROGRESS') return { state: 'unknown', reason: null, requestId: null }
  if (answer.code === 'WORKFLOW_FAILED') {
    const step = answer.steps?.find(item => item.status === 'failed')
    const inner = answer.result && typeof answer.result === 'object' && !Array.isArray(answer.result) ? (answer.result as Record<string, unknown>).message : undefined
    const why = step?.error ?? (typeof inner === 'string' ? inner : null)
    return { state: 'failed', reason: step ? `It stopped at “${step.label}”${why ? `: ${why}` : '.'}` : why ?? 'It stopped before it finished.', requestId: null }
  }
  return { state: 'failed', reason: refused[answer.code] ?? 'Your server turned this run down, so it didn’t run.', requestId: null }
}

/** A finished editor workflow wraps its output as `{code: "OK", result}`; show the output itself. */
export function runResult(answer: RunAnswer): unknown {
  const value = answer.result
  if (value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).code === 'OK' && 'result' in value) return (value as Record<string, unknown>).result
  return value
}

// --- The result, readable ----------------------------------------------------------------------

export type ResultView =
  | { kind: 'empty'; title?: string }
  | { kind: 'text'; text: string; title?: string }
  | { kind: 'list'; items: string[]; title?: string }
  | { kind: 'fields'; fields: { label: string; value: string }[]; title?: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; total: number; title?: string }
  | { kind: 'json'; text: string; title?: string }

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const cell = (value: unknown) => value === null || value === undefined ? '' : scalar(value) ? String(value) : Array.isArray(value) && value.every(scalar) ? clip(value.join(', '), 200) : clip(JSON.stringify(value), 200)
const clip = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text
export const TABLE_COLUMNS = 8, TABLE_ROWS = 50

/** Text as text, a list of records as a table, flat records as fields; anything else as JSON. */
export function resultView(value: unknown, title?: string, depth = 0): ResultView {
  if (value === null || value === undefined || value === '') return { kind: 'empty', title }
  if (scalar(value)) return { kind: 'text', text: String(value), title }
  if (Array.isArray(value)) {
    if (!value.length) return { kind: 'list', items: [], title }
    if (value.every(scalar)) return { kind: 'list', items: value.map(String), title }
    if (value.every(plain)) {
      const columns = [...new Set(value.flatMap(row => Object.keys(row)))].slice(0, TABLE_COLUMNS)
      return { kind: 'table', columns, rows: value.slice(0, TABLE_ROWS).map(row => columns.map(column => cell(row[column]))), total: value.length, title }
    }
  } else if (plain(value)) {
    const keys = Object.keys(value)
    // `{deadlines: [...]}` reads as a titled table, not as JSON around it.
    if (keys.length === 1 && depth < 2) return resultView(value[keys[0]], inputLabel(keys[0]), depth + 1)
    if (keys.length && keys.length <= 20 && keys.every(key => value[key] === null || scalar(value[key]))) return { kind: 'fields', fields: keys.map(key => ({ label: inputLabel(key), value: cell(value[key]) })), title }
  }
  return { kind: 'json', text: JSON.stringify(value, null, 2), title }
}

/** The inputs a run used, in one short line: "Chat: Study group · Days: 3". */
export function inputsLine(args: Record<string, unknown>) {
  const parts = Object.entries(args).map(([key, value]) => `${inputLabel(key)}: ${clip(cell(value) || '—', 40)}`)
  return parts.length ? clip(parts.join(' · '), 120) : 'No inputs'
}

// --- Which saved draft a published tool came from ------------------------------------------------

const WORKFLOW_TOOL = /^workflow:(editor-[a-f0-9]{32}):([1-9][0-9]{0,8}):([a-f0-9]{64})$/
export type WorkflowTool = { automationId: string; version: number; digest: string }
export type RunTarget = { draftId: string; version: number; digest: string; available: boolean; authorization: 'auto' | 'owner_confirmation' }

/** A tool made in Tools shows in the tool list as `workflow:<automation>:<version>:<digest>`. */
export function workflowTool(id: string): WorkflowTool | null {
  const match = WORKFLOW_TOOL.exec(id)
  return match ? { automationId: match[1], version: Number(match[2]), digest: match[3] } : null
}

/** ToolGate names a published draft `editor-` and the first 32 hex digits of its id's SHA-256. */
export async function automationIdFor(draftId: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(draftId)))
  return `editor-${[...digest].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)}`
}

/**
 * The draft a published tool came from, since the run route takes the draft's id. The draft whose
 * id hashes to the tool's name is asked first, and only its publications (same automation, version
 * and digest) confirm it; if none matches, every saved draft is asked. Null when none has it.
 */
export async function findRunTarget(drafts: Pick<GatewayEditorDrafts, 'list' | 'publications'>, tool: WorkflowTool, signal?: AbortSignal): Promise<RunTarget | null> {
  const ids: string[] = []
  let after: string | undefined
  for (let page = 0; page < 20; page++) {
    const result = await drafts.list(after, signal)
    ids.push(...result.items.map(item => item.id))
    if (!result.next_after) break
    after = result.next_after
  }
  const hashes = await Promise.all(ids.map(automationIdFor))
  const likely = ids.filter((_, index) => hashes[index] === tool.automationId)
  const rest = ids.filter((_, index) => hashes[index] !== tool.automationId)
  for (const batch of [likely, ...Array.from({ length: Math.ceil(rest.length / 6) }, (_, index) => rest.slice(index * 6, index * 6 + 6))]) {
    const found = await Promise.all(batch.map(async id => ({ id, items: await drafts.publications(id, signal) })))
    for (const { id, items } of found) {
      const match = items.find(item => item.automation_id === tool.automationId && item.version === tool.version && item.digest === tool.digest)
      if (match) return { draftId: id, version: match.version, digest: match.digest, available: match.available, authorization: match.authorization }
    }
  }
  return null
}
