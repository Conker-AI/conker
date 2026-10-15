import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'
import { validateSkillIds } from './skills'

export type DraftValue = {
  text: string; modelId: string | null; skillIds: string[]; think: boolean
  researchMode: 'off' | 'web' | 'deep'
  title: string; agentId: string | null
  privacy: { memoryDisabled?: boolean; harnessDisabled?: boolean }
}
export type SavedDraft = DraftValue & { sessionId: string | null; taskId: string | null; revision: number; updatedAt: number | null }
export type DraftStart = { requestId: string; sessionId: string; contentStatus: 'available' | 'forgotten'; sourceRevision: number | null; draftRevision: number | null }
export const emptyDraft = (): DraftValue => ({ text: '', modelId: null, skillIds: [], think: false, researchMode: 'off', title: '', agentId: null, privacy: {} })
/** Unchanged explicit overrides survive edits to another switch; removing a restriction inherits setup. */
export function mergeDraftPrivacy(previous: DraftValue['privacy'], next: { memoryDisabled: boolean; harnessDisabled: boolean }): DraftValue['privacy'] {
  const result = { ...previous }
  for (const key of ['memoryDisabled', 'harnessDisabled'] as const) {
    if (next[key] === Boolean(previous[key])) continue
    if (next[key]) result[key] = true
    else delete result[key]
  }
  return result
}
const ID = /^[A-Za-z0-9_-]{1,128}$/
const fail = (): never => { throw new GatewayError('invalid-response') }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail()
const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fail()
const string = (value: unknown, max: number): string => typeof value === 'string' && [...value].length <= max ? value : fail()
const id = (value: unknown): string => typeof value === 'string' && ID.test(value) ? value : fail()
const boolean = (value: unknown): boolean => typeof value === 'boolean' ? value : fail()
const inputId = (value: string) => { if (!ID.test(value)) throw new GatewayError('validation'); return value }

export function draftPath(key: string): string {
  if (key === 'new') return '/api/control/pi/drafts/new'
  const [session, task, extra] = key.split('/')
  if (extra !== undefined || !session || task === '') throw new GatewayError('validation')
  return `/api/control/pi/drafts/${inputId(session)}${task ? `/tasks/${inputId(task)}` : ''}`
}
export function parseDraft(value: unknown, key: string): SavedDraft {
  const row = object(value), [session, task] = key.split('/')
  if (row.schemaVersion !== 1 || row.content_status !== 'available' || row.session_id !== (key === 'new' ? null : session) || row.task_id !== (task ?? null)) return fail()
  const defaults = emptyDraft(), privacy = row.privacy === undefined ? {} : object(row.privacy)
  const researchMode = row.research_mode
  if (!['off', 'web', 'deep'].includes(String(researchMode))) return fail()
  let skillIds: string[]
  try { skillIds = validateSkillIds(row.skill_ids as string[]) } catch { return fail() }
  const agentId = row.agent_id === undefined ? defaults.agentId : row.agent_id === null ? null : string(row.agent_id, 64)
  if (agentId !== null && !/^(?:companion|agent_[0-9a-f]{32})$/.test(agentId)) return fail()
  const updatedAt = row.updated_at === null ? null : row.updated_at
  if (updatedAt !== null && (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0)) return fail()
  return { text: string(row.text, 100_000), modelId: row.model_id === null ? null : string(row.model_id, 200), skillIds, think: boolean(row.think), researchMode: researchMode as DraftValue['researchMode'],
    title: row.title === undefined ? '' : string(row.title, 1024), agentId, privacy: { ...(privacy.memoryDisabled === undefined ? {} : { memoryDisabled: boolean(privacy.memoryDisabled) }), ...(privacy.harnessDisabled === undefined ? {} : { harnessDisabled: boolean(privacy.harnessDisabled) }) },
    sessionId: key === 'new' ? null : id(row.session_id), taskId: row.task_id === null ? null : id(row.task_id), revision: count(row.revision), updatedAt }
}
export function draftBody(key: string, value: DraftValue, revision: number): Record<string, unknown> {
  if (!Number.isSafeInteger(revision) || revision < 0 || typeof value.text !== 'string' || [...value.text].length > 16_000 || typeof value.think !== 'boolean' || !['off', 'web', 'deep'].includes(value.researchMode) || value.modelId !== null && (typeof value.modelId !== 'string' || !value.modelId.length || value.modelId.length > 200)) throw new GatewayError('validation')
  const body = { expected_revision: revision, text: value.text, model_id: value.modelId, skill_ids: validateSkillIds(value.skillIds), think: value.think, research_mode: value.researchMode,
    ...(key === 'new' ? { title: value.title, agent_id: value.agentId, privacy: value.privacy } : {}) }
  if (key === 'new' && ([...value.title].length > 1024 || value.agentId !== null && !/^(?:companion|agent_[0-9a-f]{32})$/.test(value.agentId) || Object.entries(value.privacy).some(([key, value]) => !['memoryDisabled', 'harnessDisabled'].includes(key) || typeof value !== 'boolean'))) throw new GatewayError('validation')
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 65_536) throw new GatewayError('too-large')
  return body
}
export function parseDraftStart(value: unknown, requestId: string): DraftStart {
  const row = object(value)
  if (row.schemaVersion !== 1 || row.request_id !== requestId || !['available', 'forgotten'].includes(String(row.content_status))) return fail()
  const forgotten = row.content_status === 'forgotten'
  const sourceRevision = forgotten ? null : count(row.source_revision), draftRevision = forgotten ? null : count(row.draft_revision)
  if (!forgotten && (!sourceRevision || !draftRevision)) return fail()
  return { requestId, sessionId: id(row.session_id), contentStatus: forgotten ? 'forgotten' : 'available', sourceRevision, draftRevision }
}
export function createGatewayDraftClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async load(key: string, signal?: AbortSignal) { return parseDraft(await auth.request(draftPath(key), { signal }), key) },
    async save(key: string, value: DraftValue, revision: number, signal?: AbortSignal) { return parseDraft(await auth.request(draftPath(key), { method: 'POST', body: draftBody(key, value, revision), signal }), key) },
    async start(requestId: string, revision: number, signal?: AbortSignal) {
      inputId(requestId)
      if (requestId.length < 16 || !Number.isSafeInteger(revision) || revision < 1) throw new GatewayError('validation')
      const receipt = parseDraftStart(await auth.request('/api/control/pi/drafts/new/start', { method: 'POST', body: { request_id: requestId, expected_revision: revision }, signal }), requestId)
      if (receipt.contentStatus === 'available' && receipt.sourceRevision !== revision) return fail()
      return receipt
    },
    async checkStart(requestId: string, signal?: AbortSignal) {
      inputId(requestId); if (requestId.length < 16) throw new GatewayError('validation')
      return parseDraftStart(await auth.request(`/api/control/pi/drafts/new/start/${requestId}`, { signal }), requestId)
    },
  }
}
export type GatewayDraftClient = ReturnType<typeof createGatewayDraftClient>
