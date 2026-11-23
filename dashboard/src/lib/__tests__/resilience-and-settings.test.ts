import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDraftStart, readDraftStart, rememberDraftStart } from '@/components/gateway/draft-start-recovery'
import { errorReport, failureTitle, isChunkLoadError, loadFailureDescription, retryableKinds } from '@/components/resilience/error-details'
import { settingValue, validSettingValue } from '@/settings/setting-value'
import type { Setting } from '@/settings/registry'
import { GatewayError } from '@/lib/gateway/transport'

afterEach(() => vi.unstubAllGlobals())

describe('draft start recovery', () => {
  function storage(initial: string | null = null, broken = false) {
    const data = new Map<string, string>(initial === null ? [] : [['conker.pending-draft-start.v1', initial]])
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => {
        if (broken) throw new Error('blocked')
        return data.get(key) ?? null
      },
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => {
        if (broken) throw new Error('blocked')
        data.delete(key)
      },
    })
    return data
  }
  const id = 'abcdefghijklmnop'

  it('remembers metadata only and reads it back for the same identity', () => {
    const data = storage()
    rememberDraftStart({ requestId: id, revision: 2, identity: 'me', text: 'secret draft' } as never)
    expect(JSON.parse(data.get('conker.pending-draft-start.v1')!)).toEqual({ requestId: id, revision: 2, identity: 'me' })
    expect(readDraftStart('me')).toEqual({ requestId: id, revision: 2, identity: 'me' })
  })

  it('returns nothing when nothing was saved', () => {
    storage()
    expect(readDraftStart('me')).toBeNull()
  })

  it('discards a record for another identity, a bad id, a bad revision or extra fields', () => {
    for (const value of [
      { requestId: id, revision: 2, identity: 'other' },
      { requestId: 'short', revision: 2, identity: 'me' },
      { requestId: 5, revision: 2, identity: 'me' },
      { requestId: id, revision: 0, identity: 'me' },
      { requestId: id, revision: 1.5, identity: 'me' },
      { requestId: id, revision: 2, identity: 'me', text: 'x' },
      false,
      7,
    ]) {
      const data = storage(JSON.stringify(value))
      expect(readDraftStart('me')).toBeNull()
      expect(data.size).toBe(0)
    }
  })

  it('treats unreadable storage as empty and clears quietly', () => {
    storage('{not json')
    expect(readDraftStart('me')).toBeNull()
    storage(null, true)
    expect(() => clearDraftStart()).not.toThrow()
    const data = storage(JSON.stringify({ requestId: id, revision: 2, identity: 'me' }))
    clearDraftStart()
    expect(data.size).toBe(0)
  })
})

describe('error details', () => {
  it('spots a lazy-load failure after a new build', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /a.js'))).toBe(true)
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
    expect(isChunkLoadError(new Error('Loading CSS chunk vendor-1 failed'))).toBe(true)
    expect(isChunkLoadError(new Error('Something else'))).toBe(false)
  })

  it('writes a report without addresses, query strings or long tokens', () => {
    const token = 'a'.repeat(40)
    const error = new GatewayError('http', 503)
    error.message = `GET /thing?secret=1 failed for ${token}`
    const report = errorReport(error)
    const lines = report.split('\n')
    expect(lines[0]).toBe('Conker dashboard error')
    expect(lines[1]).toMatch(/^Time: \d{4}-\d{2}-\d{2}T/)
    expect(report).toContain('Kind: http (HTTP 503)')
    expect(report).toContain('Error: GatewayError: GET /thing?… failed for [redacted]')
    expect(report).not.toContain(token)
    expect(report).not.toContain('secret=1')
    expect(errorReport(new GatewayError('network'))).toContain('Kind: network\n')
    expect(errorReport('plain string failure ' + token)).toContain('Error: plain string failure [redacted]')
  })

  it('describes the page and browser when they exist', () => {
    vi.stubGlobal('window', { location: { origin: 'https://conker.example', pathname: '/memory' } })
    vi.stubGlobal('navigator', { userAgent: 'TestBrowser/1' })
    const error = new Error('fetch https://conker.example/api?x=1 failed')
    const report = errorReport(error)
    expect(report).toContain('Page: /memory')
    expect(report).toContain('Browser: TestBrowser/1')
    expect(report).toContain('Error: Error: fetch /api?… failed')
    expect(report).not.toContain('conker.example')
  })

  it('titles a failure by kind, with a fallback for other errors', () => {
    expect(failureTitle(new GatewayError('network'))).toBe('Can’t reach your Conker server')
    expect(failureTitle(new GatewayError('rate-limited'))).toBe('Too many attempts')
    expect(failureTitle(new GatewayError('validation'))).toBe('Couldn’t load this')
    expect(failureTitle(new GatewayError('validation'), 'Custom')).toBe('Custom')
    expect(failureTitle(new Error('x'))).toBe('Couldn’t load this')
    expect([...retryableKinds].sort()).toEqual(['aborted', 'dependency', 'http', 'invalid-response', 'network'])
  })

  it('says what to do next after a failed read', () => {
    expect(loadFailureDescription(new GatewayError('network'))).toBe('Check your connection. This refreshes by itself when your server answers again.')
    expect(loadFailureDescription(new GatewayError('dependency'))).toMatch(/^Your server answered, but a service/)
    expect(loadFailureDescription(new GatewayError('aborted'))).toBe('The request stopped before an answer came back. Try again.')
    expect(loadFailureDescription(new GatewayError('verification-required'))).toBe(new GatewayError('verification-required').message)
    expect(loadFailureDescription(new Error('x'))).toBe('Something went wrong while loading this. Try again; if it keeps happening, copy the details.')
  })
})

const base = (extra: Partial<Setting> = {}): Setting => ({
  id: 's',
  title: 'T',
  description: 'D',
  type: 'toggle',
  default: false,
  tier: 'basic',
  scope: 'global',
  effect: 'live',
  keywords: [],
  related: [],
  group: 'g',
  section: 's',
  ...extra,
})

describe('setting values', () => {
  it('accepts null only when the default is null', () => {
    expect(validSettingValue(base({ default: null, type: 'text' }), null)).toBe(true)
    expect(validSettingValue(base({ default: false }), null)).toBe(false)
  })

  it('checks toggles, numbers and sliders', () => {
    expect(validSettingValue(base(), true)).toBe(true)
    expect(validSettingValue(base(), 1)).toBe(false)
    const number = base({ type: 'number', default: 5, min: 1, max: 10 })
    expect(validSettingValue(number, 5)).toBe(true)
    expect(validSettingValue(number, 0)).toBe(false)
    expect(validSettingValue(number, 11)).toBe(false)
    expect(validSettingValue(number, Number.NaN)).toBe(false)
    expect(validSettingValue(number, '5')).toBe(false)
    expect(validSettingValue(base({ type: 'number', default: 1 }), -5000)).toBe(true)
    const slider = base({ type: 'slider', default: 50 })
    expect(validSettingValue(slider, 100)).toBe(true)
    expect(validSettingValue(slider, 101)).toBe(false)
    expect(validSettingValue(slider, -1)).toBe(false)
    const whole = base({ type: 'number', default: 2, step: 1 })
    expect(validSettingValue(whole, 3)).toBe(true)
    expect(validSettingValue(whole, 2.5)).toBe(false)
    expect(validSettingValue(base({ type: 'number', default: 2, step: 0.5 }), 2.25)).toBe(true)
  })

  it('checks selects and lists against the options', () => {
    const options = [
      { value: 'a', label: 'A' },
      { value: 2, label: 'Two' },
    ]
    expect(validSettingValue(base({ type: 'select', default: 'a', options }), 2)).toBe(true)
    expect(validSettingValue(base({ type: 'select', default: 'a', options }), 'z')).toBe(false)
    expect(validSettingValue(base({ type: 'select', default: 'a' }), 'a')).toBe(false)
    const list = base({ type: 'list', default: [], options, max_items: 2 })
    expect(validSettingValue(list, ['a', 2])).toBe(true)
    expect(validSettingValue(list, ['a', 'a'])).toBe(false)
    expect(validSettingValue(list, ['z'])).toBe(false)
    expect(validSettingValue(list, 'a')).toBe(false)
    expect(validSettingValue(base({ type: 'list', default: [] }), ['a'])).toBe(false)
    expect(
      validSettingValue(
        base({
          type: 'list',
          default: [],
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ],
          max_items: 2,
        }),
        ['a', 'b', 'c'],
      ),
    ).toBe(false)
  })

  it('checks tags, models and text, with length, count and pattern limits', () => {
    const tags = base({ type: 'tags', default: [], max_length: 3, max_items: 2 })
    expect(validSettingValue(tags, ['ab', 'cd'])).toBe(true)
    expect(validSettingValue(tags, ['abcd'])).toBe(false)
    expect(validSettingValue(tags, ['a', 'b', 'c'])).toBe(false)
    expect(validSettingValue(tags, ['a', 'a'])).toBe(false)
    expect(validSettingValue(tags, [1])).toBe(false)
    expect(validSettingValue(base({ type: 'models', default: [] }), ['x'.repeat(500)])).toBe(true)
    const text = base({ type: 'text', default: '', max_length: 5, pattern: '^[a-z]+$' })
    expect(validSettingValue(text, 'abc')).toBe(true)
    expect(validSettingValue(text, 'abcdef')).toBe(false)
    expect(validSettingValue(text, 'AB')).toBe(false)
    expect(validSettingValue(text, 5)).toBe(false)
    expect(validSettingValue(base({ type: 'timezone', default: '' }), 'Europe/Paris')).toBe(true)
    expect(validSettingValue(base({ type: 'time', default: '', pattern: '(' }), '10:00')).toBe(false)
  })

  it('never accepts a saved value for a custom setting', () => expect(validSettingValue(base({ type: 'custom', default: null }), 'x')).toBe(false))

  it('uses the saved value only when it fits, else the default', () => {
    const entry = base({ type: 'number', default: 5, min: 1, max: 10 })
    expect(settingValue(entry, 7, 5)).toBe(7)
    expect(settingValue(entry, 70, 5)).toBe(5)
    expect(settingValue(entry, undefined, 5)).toBe(5)
    expect(settingValue(null, 7, 5)).toBe(5)
  })

  it('before the registry loads, trusts a value of the same kind as the default', () => {
    expect(settingValue(undefined, 9, 5)).toBe(9)
    expect(settingValue(undefined, Number.NaN, 5)).toBe(5)
    expect(settingValue(undefined, 'x', 5)).toBe(5)
    expect(settingValue(undefined, ['a'], [])).toEqual(['a'])
    expect(settingValue(undefined, [1], [])).toEqual([])
    expect(settingValue(undefined, 'a', [])).toEqual([])
    expect(settingValue(undefined, 'x', null)).toBeNull()
    expect(settingValue(undefined, true, false)).toBe(true)
  })
})
