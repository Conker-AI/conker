import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cardLabels, cardTemplates, isCardTemplate } from '../inbox-buttons'
import { RECENT_CHATS_LIMIT, readOpenedChats, rememberOpenedChat } from '../recent-chats'
import { createRefreshState, initialRefreshState } from '../refresh-state'
import { migrateRadiusPreference, normalizeThemeVariables, resolveThemeVariables } from '../theme-resolution'

describe('inbox buttons', () => {
  it('has a yes and a no for every template', () => {
    for (const name of cardTemplates) {
      expect(cardLabels[name].yes).toBeTruthy()
      expect(cardLabels[name].no).toBeTruthy()
    }
  })
  it('recognises only known templates', () => {
    expect(isCardTemplate('send')).toBe(true)
    expect(isCardTemplate('nuke')).toBe(false)
    expect(isCardTemplate(3)).toBe(false)
  })
})

describe('recent chats', () => {
  const data = new Map<string, string>()
  beforeEach(() => {
    data.clear()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) } })
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('lists the newest first and moves a reopened chat to the front', () => {
    rememberOpenedChat('a', 1)
    rememberOpenedChat('b', 2)
    rememberOpenedChat('a', 3)
    expect(readOpenedChats()).toEqual([
      { id: 'a', at: 3 },
      { id: 'b', at: 2 },
    ])
  })
  it('keeps only the limit', () => {
    for (let i = 0; i < RECENT_CHATS_LIMIT + 5; i++) rememberOpenedChat(`c${i}`, i + 1)
    expect(readOpenedChats()).toHaveLength(RECENT_CHATS_LIMIT)
  })
  it('ignores a bad id', () => {
    rememberOpenedChat('no spaces allowed')
    expect(readOpenedChats()).toEqual([])
  })
  it('survives damaged storage', () => {
    data.set('conker.recent-chats', 'not json')
    expect(readOpenedChats()).toEqual([])
    data.set('conker.recent-chats', '{"a":1}')
    expect(readOpenedChats()).toEqual([])
    data.set('conker.recent-chats', JSON.stringify([{ id: 'ok', at: 5 }, { id: 'x', at: -1 }, { id: 7, at: 5 }, null]))
    expect(readOpenedChats()).toEqual([{ id: 'ok', at: 5 }])
  })
  it('does nothing without storage', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(readOpenedChats()).toEqual([])
    expect(() => rememberOpenedChat('a')).not.toThrow()
  })
})

describe('refresh state', () => {
  it('starts idle and each store is its own', () => {
    const one = createRefreshState(),
      two = createRefreshState()
    one.setState({ status: 'done' })
    expect(one.getState().status).toBe('done')
    expect(two.getState()).toEqual(initialRefreshState)
  })
})

describe('theme resolution', () => {
  it('wraps bare colour channels in hsl()', () => expect(normalizeThemeVariables({ background: '0 0% 100%', radius: '0.5rem' })).toEqual({ background: 'hsl(0 0% 100%)', radius: '0.5rem' }))
  it('lets the dark values win only in dark', () => {
    const theme = { light: { primary: '1 2% 3%' }, dark: { primary: '4 5% 6%' } }
    expect(resolveThemeVariables(theme, false).primary).toBe('hsl(1 2% 3%)')
    expect(resolveThemeVariables(theme, true).primary).toBe('hsl(4 5% 6%)')
  })
  it('copies letter-spacing and the sidebar background', () => {
    const styles = resolveThemeVariables({ light: { 'letter-spacing': '0.1em', 'sidebar-background': 'red' }, dark: {} }, false)
    expect(styles['tracking-normal']).toBe('0.1em')
    expect(styles.sidebar).toBe('red')
  })
  it('derives the shadow scale from its parameters and keeps explicit ones', () => {
    const styles = resolveThemeVariables({ light: { 'shadow-opacity': '2', 'shadow-md': 'mine' }, dark: {} }, false)
    expect(styles['shadow-md']).toBe('mine')
    expect(styles['shadow-lg']).toContain('1.00')
    expect(resolveThemeVariables({ light: { 'shadow-opacity': 'x' }, dark: {} }, false)['shadow-xl']).toContain('0.10')
  })
  it('keeps only a changed radius', () => {
    expect(migrateRadiusPreference('0.625rem')).toBe('')
    expect(migrateRadiusPreference('1rem')).toBe('1rem')
    expect(migrateRadiusPreference(4)).toBe('')
  })
})
