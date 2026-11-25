import { describe, expect, it, vi } from 'vitest'
import { clearShared, keepShared, loadShared, readShared, SHARE_KEY, SHARE_LIMIT, sharedText, takeShared, type ShareStorage } from '@/lib/share-capture'

function memory(initial: Record<string, string> = {}): ShareStorage & { items: Record<string, string> } {
  const items = { ...initial }
  return { items, getItem: key => items[key] ?? null, setItem: (key, value) => void (items[key] = value), removeItem: key => void delete items[key] }
}
const broken: ShareStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}
const at = (search: string, pathname = '/share', hash = '') => ({ pathname, search, hash })

describe('share target', () => {
  it('reads title, text and link from the address, trimmed and without NUL characters', () => {
    expect(readShared('?title=%20Article%20&text=Read%00%20this&url=https%3A%2F%2Fexample.com%2Fa')).toEqual({ title: 'Article', text: 'Read this', url: 'https://example.com/a' })
    expect(readShared('?text=only')).toEqual({ title: '', text: 'only', url: '' })
    expect(readShared('?preview-delay=50')).toBeNull()
    expect(readShared(`?text=${'a'.repeat(30_000)}`)?.text).toHaveLength(20_000)
  })

  it('moves a share from the address into this tab and keeps other parameters', () => {
    const storage = memory(),
      replace = vi.fn()
    expect(takeShared(at('?text=hello&preview-delay=5&url=https%3A%2F%2Fx.test', '/share/', '#top'), '', storage, replace)).toEqual({ title: '', text: 'hello', url: 'https://x.test' })
    expect(replace).toHaveBeenCalledWith('/share/?preview-delay=5#top')
    expect(loadShared(storage)).toEqual({ title: '', text: 'hello', url: 'https://x.test' })
    takeShared(at('?title=t'), '', storage, replace)
    expect(replace).toHaveBeenLastCalledWith('/share')
  })

  it('honours the base path and ignores every other page', () => {
    const storage = memory(),
      replace = vi.fn()
    expect(takeShared(at('?text=a', '/app/share'), '/app/', storage, replace)).not.toBeNull()
    expect(takeShared(at('?text=a', '/chat'), '', storage, replace)).toBeNull()
    expect(takeShared(at('', '/share'), '', storage, replace)).toBeNull()
    expect(takeShared(at('?text=a', '/'), '', storage, replace)).toBeNull()
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('leaves the address alone when this tab cannot keep the share, so nothing is lost', () => {
    const replace = vi.fn()
    expect(takeShared(at('?text=a'), '', null, replace)).toBeNull()
    expect(takeShared(at('?text=a'), '', broken, replace)).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('loads only a well-formed share and clears it', () => {
    expect(loadShared(null)).toBeNull()
    expect(loadShared(memory())).toBeNull()
    expect(loadShared(memory({ [SHARE_KEY]: '{bad' }))).toBeNull()
    expect(loadShared(memory({ [SHARE_KEY]: '"text"' }))).toBeNull()
    expect(loadShared(memory({ [SHARE_KEY]: JSON.stringify({ title: '', text: 3, url: '' }) }))).toBeNull()
    expect(loadShared(broken)).toBeNull()
    const storage = memory({ [SHARE_KEY]: JSON.stringify({ title: 'a', text: 'b', url: 'c' }) })
    clearShared(storage)
    expect(storage.items).toEqual({})
    expect(() => clearShared(broken)).not.toThrow()
    expect(() => clearShared(null)).not.toThrow()
  })

  it('keeps the text being saved with its request id, and drops a malformed id', () => {
    const storage = memory({ [SHARE_KEY]: JSON.stringify({ title: 'a', text: 'b', url: 'c' }) })
    const id = `share_${'a'.repeat(32)}`
    keepShared(storage, 'edited text', id)
    expect(loadShared(storage)).toEqual({ title: '', text: 'edited text', url: '', requestId: id })
    keepShared(storage, 'x', 'bad id!')
    expect(loadShared(storage)).toEqual({ title: '', text: 'x', url: '' })
    expect(() => keepShared(broken, 'x', id)).not.toThrow()
    expect(() => keepShared(null, 'x', id)).not.toThrow()
  })

  it('joins title, text and link once each', () => {
    expect(sharedText({ title: 'Title', text: 'Body', url: 'https://x.test' })).toBe('Title\nBody\nhttps://x.test')
    expect(sharedText({ title: 'Title', text: 'Title and more https://x.test', url: 'https://x.test' })).toBe('Title and more https://x.test')
    expect(sharedText({ title: 'https://x.test', text: '', url: 'https://x.test' })).toBe('https://x.test')
    expect(sharedText({ title: '', text: '', url: '' })).toBe('')
    expect(SHARE_LIMIT).toBe(2000)
  })
})
