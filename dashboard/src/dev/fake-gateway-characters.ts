/**
 * Development-only companion character for the preview: one profile with saved revisions, history,
 * export, import into a draft, save and restore, each guarded by the expected revision like Pi.
 */
import { createCharacterStudio } from '@/lib/api/character-defaults'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean> }

export function createFakeCharacters(now: () => number, fail: (status: number) => never) {
  let characterRevision = 1
  let character: Json = {
    name: 'Conker', mood: 'Thoughtful · ready to listen', personality: 'Curious and steady. Help me think clearly and stay in control.',
    speakingStyle: 'Warm, direct, and concise. A little dry humour when it fits.', speakingPreset: 'custom',
    portrait: '/conker.png', renderer: 'static', face: 'sprout', tone: 'green',
    emotions: { neutral: 'default', happy: 'portrait', thinking: 'portrait', concerned: 'default', celebrating: 'portrait' },
    studio: createCharacterStudio(),
  }
  const characterHistory: Json[] = [{ revision: 1, created_at: now() - 7200, restored_from: null }]
  const characterVersions = new Map<number, Json>([[1, structuredClone(character)]])
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    if (path === '/api/control/pi/characters/companion' && method === 'GET') {
      const selected = options.query?.revision === undefined ? characterRevision : Number(options.query.revision)
      return { agentId: 'companion', revision: selected, profile: characterVersions.get(selected) ?? fail(404) }
    }
    if (path === '/api/control/pi/characters/companion/history' && method === 'GET') return { results: characterHistory }
    if (path === '/api/control/pi/characters/companion/export' && method === 'GET') {
      const selected = options.query?.revision === undefined ? characterRevision : Number(options.query.revision)
      return { format: 'conker-character', version: 1, character: characterVersions.get(selected) ?? fail(404) }
    }
    if (path === '/api/control/pi/characters/companion/import' && method === 'POST') {
      let raw: Json
      try { raw = JSON.parse(String(options.body?.text ?? '')) as Json } catch { return fail(422) }
      if (raw.format !== 'conker-character' || raw.version !== 1 || !raw.character || typeof raw.character !== 'object') fail(422)
      return { profile: raw.character, note: 'Imported into a draft. Review, then save with the current revision.' }
    }
    if (path === '/api/control/pi/characters/companion/save' && method === 'POST') {
      if (Number(options.body?.expected_revision) !== characterRevision) fail(409)
      character = structuredClone(options.body?.profile as Json); characterRevision += 1
      characterVersions.set(characterRevision, structuredClone(character)); characterHistory.push({ revision: characterRevision, created_at: now(), restored_from: null })
      return { agentId: 'companion', revision: characterRevision, profile: character }
    }
    if (path === '/api/control/pi/characters/companion/restore' && method === 'POST') {
      if (Number(options.body?.expected_revision) !== characterRevision) fail(409)
      const selected = Number(options.body?.revision), prior = characterVersions.get(selected) ?? fail(404)
      character = structuredClone(prior); characterRevision += 1; characterVersions.set(characterRevision, structuredClone(character))
      characterHistory.push({ revision: characterRevision, created_at: now(), restored_from: selected })
      return { agentId: 'companion', revision: characterRevision, profile: character }
    }
    return undefined
  }
}
