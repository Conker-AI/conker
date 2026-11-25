import { describe, expect, it } from 'vitest'
import { loadShared, SHARE_KEY, takeShared, type ShareStorage } from '../share-capture'
import { keepSent, readSent } from '../share-sent'

function memory(initial: Record<string, string> = {}): ShareStorage & { items: Record<string, string> } {
  const items = { ...initial }
  return {
    items,
    getItem: key => items[key] ?? null,
    setItem: (key, value) => void (items[key] = value),
    removeItem: key => void delete items[key],
  }
}
const ID = `share_${'a'.repeat(32)}`

describe('the sent share', () => {
  it('keeps the exact text and its id, and still reads as the share', () => {
    const storage = memory()
    keepSent(storage, { text: '  a link & more\n', requestId: ID })
    expect(readSent(storage)).toEqual({ text: '  a link & more\n', requestId: ID })
    expect(loadShared(storage)?.text).toBe('a link & more')
  })

  it('a new share replaces it', () => {
    const storage = memory()
    keepSent(storage, { text: 'Old', requestId: ID })
    takeShared({ pathname: '/share', search: '?text=New', hash: '' }, '', storage, () => {})
    expect(readSent(storage)).toBeNull()
    expect(loadShared(storage)?.text).toBe('New')
  })

  it('ignores anything it did not write', () => {
    for (const value of [
      'nope',
      JSON.stringify({ title: '', text: 'x', url: '' }),
      JSON.stringify({ sent: 'x', requestId: 'short' }),
      JSON.stringify({ sent: '   ', requestId: ID }),
      JSON.stringify({ sent: 'x'.repeat(2001), requestId: ID }),
    ])
      expect(readSent(memory({ [SHARE_KEY]: value }))).toBeNull()
  })

  it('survives blocked storage', () => {
    const blocked: ShareStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    expect(() => keepSent(blocked, { text: 'x', requestId: ID })).not.toThrow()
    expect(readSent(blocked)).toBeNull()
    expect(readSent(null)).toBeNull()
  })
})
