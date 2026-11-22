import { describe, expect, it } from 'vitest'
import { dueLabel } from '../due-date'
import { skillLabel } from '../skill-label'
import { toolDraftId } from '../tool-draft-id'
import { isQueryEdit } from '../command-query'
import { splitActionLabel } from '../route-actions'
import { cn } from '../utils'

describe('skillLabel', () => {
  it('turns a file name into words', () => expect(skillLabel('meeting-notes')).toBe('Meeting notes'))
  it('handles dots and underscores', () => expect(skillLabel('weekly_review.v2')).toBe('Weekly review v2'))
  it('leaves a readable name alone', () => expect(skillLabel('Meeting Notes')).toBe('Meeting Notes'))
})

describe('toolDraftId', () => {
  it('makes a slug with the suffix', () => expect(toolDraftId('Send an Email!', 'abcd12')).toBe('send-an-email-abcd12'))
  it('drops accents', () => expect(toolDraftId('Café menu', 'abcd')).toBe('cafe-menu-abcd'))
  it('falls back to tool for an empty name', () => expect(toolDraftId('???', 'abcd')).toBe('tool-abcd'))
  it('starts with a letter', () => expect(toolDraftId('123 go', 'abcd')).toBe('tool-123-go-abcd'))
  it('cuts a long name without a trailing dash', () => expect(toolDraftId(`${'a'.repeat(39)} b`, 'abcd')).toBe(`${'a'.repeat(39)}-abcd`))
  it('refuses a bad suffix', () => expect(() => toolDraftId('x', 'AB')).toThrow(RangeError))
})

describe('dueLabel', () => {
  it('writes a day the way people say it', () => expect(dueLabel('2026-11-20')).toMatch(/20/))
  it('returns an unreadable day as it came', () => expect(dueLabel('soon')).toBe('soon'))
})

describe('isQueryEdit', () => {
  it('counts typing and clearing', () => {
    for (const reason of ['input-change', 'input-clear', 'clear-press']) expect(isQueryEdit(reason)).toBe(true)
  })
  it('ignores picks and navigation', () => {
    for (const reason of ['item-press', 'list-navigation']) expect(isQueryEdit(reason)).toBe(false)
  })
})

describe('splitActionLabel', () => {
  it('keeps words as the label and elements as icons', () => {
    const icon = { $$typeof: Symbol.for('react.transitional.element'), type: 'svg', key: null, props: {} }
    const { label, icons } = splitActionLabel(['  New', ' chat ', icon as never, 3])
    expect(label).toBe('New chat 3')
    expect(icons).toHaveLength(1)
  })
})

describe('cn', () => {
  it('merges conflicting classes', () => expect(cn('p-2', 'p-4', undefined)).toBe('p-4'))
})
