import { validateCharacter } from './api/character'
import type { Character } from './api/client'

export type CharacterLibrary = { selected: string; entries: { id: string; profile: Character }[] }
export function readCharacterLibrary(raw: string | null, fallback: Character): CharacterLibrary {
  const initial = { selected: 'default', entries: [{ id: 'default', profile: fallback }] }
  if (!raw) return initial
  try {
    const data = JSON.parse(raw)
    const entries: CharacterLibrary['entries'] = []
    const candidates = Array.isArray(data.entries) ? data.entries : Object.entries(data.profiles ?? {}).map(([id, profile]) => ({ id, profile }))
    for (const candidate of candidates) {
      try {
        if (typeof candidate.id !== 'string' || !candidate.id || entries.some(entry => entry.id === candidate.id)) continue
        entries.push({ id: candidate.id, profile: validateCharacter(candidate.profile) })
      } catch { /* A damaged entry must not hide other characters. */ }
    }
    if (!entries.length) return initial
    return { selected: entries.some(entry => entry.id === data.selected) ? data.selected : entries[0].id, entries }
  } catch { return initial }
}
export function updateCharacterLibrary(library: CharacterLibrary, value: Character): CharacterLibrary {
  const profile = validateCharacter(value)
  return { ...library, entries: library.entries.map(entry => entry.id === library.selected ? { ...entry, profile } : entry) }
}
