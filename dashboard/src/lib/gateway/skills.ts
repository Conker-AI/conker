import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

export const skillIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SKILL_MAX_CHARACTERS = 32_000
// Keep space for the exact-operation verification envelope within the 64 KiB request cap.
export const SKILL_BROWSER_MAX_BYTES = 60 * 1024
export function skillImportBytes(markdown: string, expectedRevision: number, expectedId?: string) {
  return new TextEncoder().encode(JSON.stringify({ markdown, expected_revision: expectedRevision, ...(expectedId ? { expected_id: expectedId } : {}) })).byteLength
}
export type SkillMetadata = { id: string; name: string; description: string; revision: number; enabled: boolean; sha256: string; createdAt: number; updatedAt: number }
export type SkillRecord = SkillMetadata & { markdown: string }
const invalid = (): never => { throw new GatewayError('invalid-response') }
export function validateSkillIds(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || id.length > 64 || !skillIdPattern.test(id))) throw new GatewayError('validation')
  return [...ids]
}
export function parseSkill(value: unknown): SkillMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id.length > 64 || !skillIdPattern.test(row.id) || row.name !== row.id || typeof row.description !== 'string' || row.description.length > 1024 || typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.enabled !== 'boolean' || typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256) || typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt) || typeof row.updatedAt !== 'number' || !Number.isFinite(row.updatedAt)) return invalid()
  return { id: row.id, name: row.name, description: row.description, revision: row.revision, enabled: row.enabled, sha256: row.sha256, createdAt: row.createdAt, updatedAt: row.updatedAt }
}
export function parseSkills(value: unknown): SkillMetadata[] {
  if (!value || typeof value !== 'object') return invalid()
  const row = value as Record<string, unknown>
  if (row.schemaVersion !== 1 || !Array.isArray(row.results) || row.results.length > 1000) return invalid()
  const results = row.results.map(parseSkill)
  if (new Set(results.map(item => item.id)).size !== results.length) return invalid()
  return results
}
function parseRecord(value: unknown): SkillRecord {
  const metadata = parseSkill(value), markdown = (value as Record<string, unknown>).markdown
  if (typeof markdown !== 'string' || [...markdown].length > SKILL_MAX_CHARACTERS) return invalid()
  return { ...metadata, markdown }
}
function validId(id: string) {
  if (id.length > 64 || !skillIdPattern.test(id)) throw new GatewayError('validation')
  return id
}
export function createGatewaySkillsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async list(signal?: AbortSignal) { return parseSkills(await auth.request('/api/control/pi/skills', { signal })) },
    async get(id: string, signal?: AbortSignal) {
      const saved = parseRecord(await auth.request(`/api/control/pi/skills/${validId(id)}`, { signal }))
      if (saved.id !== id) return invalid()
      return saved
    },
    async import(markdown: string, expectedRevision: number, expectedId?: string) {
      if (!markdown.trim() || [...markdown].length > SKILL_MAX_CHARACTERS || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new GatewayError('validation')
      if (expectedId !== undefined) validId(expectedId)
      if (skillImportBytes(markdown, expectedRevision, expectedId) > SKILL_BROWSER_MAX_BYTES) throw new GatewayError('too-large')
      const saved = parseRecord(await auth.request('/api/control/pi/skills/import', { method: 'POST', body: { markdown, expected_revision: expectedRevision, ...(expectedId ? { expected_id: expectedId } : {}) } }))
      if (expectedId && saved.id !== expectedId) return invalid()
      return saved
    },
    async setEnabled(id: string, enabled: boolean, expectedRevision: number) {
      if (typeof enabled !== 'boolean' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new GatewayError('validation')
      const saved = parseRecord(await auth.request(`/api/control/pi/skills/${validId(id)}/state`, { method: 'POST', body: { enabled, expected_revision: expectedRevision } }))
      if (saved.id !== id) return invalid()
      return saved
    },
  }
}
export type GatewaySkillsClient = ReturnType<typeof createGatewaySkillsClient>
