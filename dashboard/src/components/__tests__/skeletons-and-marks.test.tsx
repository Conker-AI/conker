import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IdentityMark } from '@/components/brand/identity-mark'
import { AppLoading, ChatSkeleton, ListSkeleton, PageSkeleton } from '@/components/resilience/skeletons'

afterEach(() => cleanup())

const mark = (container: HTMLElement) => container.querySelector('[data-slot="identity-mark"]')

describe('loading skeletons', () => {
  it('announces a list while it loads, six rows by default', () => {
    const { container } = render(<ListSkeleton />)
    expect(screen.getByRole('status', { name: 'Loading…' })).not.toBeNull()
    // Each row is an icon tile, two bars and a time bar.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6 * 4)
  })

  it('takes a row count and a label, and keeps a custom class', () => {
    const { container } = render(<ListSkeleton rows={2} label="Loading chats" className="px-4" />)
    const list = screen.getByRole('status', { name: 'Loading chats' })
    expect(list.className).toContain('px-4')
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2 * 4)
  })

  it('announces a page that is opening, as busy', () => {
    render(<PageSkeleton />)
    const page = screen.getByRole('status', { name: 'Opening…' })
    expect(page.getAttribute('aria-busy')).toBe('true')
  })

  it('takes its own label and class for a page', () => {
    render(<PageSkeleton label="Opening Memory" className="p-2" />)
    const page = screen.getByRole('status', { name: 'Opening Memory' })
    expect(page.className).toContain('p-2')
  })

  it('announces a conversation while it opens, with the composer placeholder', () => {
    const { container } = render(<ChatSkeleton className="gap-1" />)
    const chat = screen.getByRole('status', { name: 'Opening the conversation…' })
    expect(chat.getAttribute('aria-busy')).toBe('true')
    expect(chat.className).toContain('gap-1')
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3)
  })

  it('names the app on first paint', () => {
    render(<AppLoading />)
    expect(screen.getByRole('status', { name: 'Opening Conker' }).tagName).toBe('MAIN')
  })
})

describe('IdentityMark', () => {
  it('is decorative: hidden from screen readers', () => {
    const { container } = render(<IdentityMark kind="tool" />)
    expect(mark(container)?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws the service logo when a brand is given, and says which in data-brand', () => {
    const { container } = render(<IdentityMark brand="github" kind="tool" name="Repo" />)
    expect(mark(container)?.getAttribute('data-brand')).toBe('github')
    expect(mark(container)?.querySelector('svg path')?.getAttribute('d')).toBeTruthy()
    expect(mark(container)?.textContent).toBe('')
    expect(mark(container)?.querySelector('svg path')?.hasAttribute('fill-rule')).toBe(false)
  })

  it('draws a logo that needs the even-odd fill rule with that rule set', () => {
    const { container } = render(<IdentityMark brand="openai" />)
    expect(mark(container)?.querySelector('svg path')?.getAttribute('fill-rule')).toBe('evenodd')
  })

  it('draws the kind icon when there is no logo', () => {
    const { container } = render(<IdentityMark kind="agent" name="Helper" />)
    expect(mark(container)?.querySelector('svg')).not.toBeNull()
    expect(mark(container)?.hasAttribute('data-brand')).toBe(false)
    expect(mark(container)?.textContent).toBe('')
  })

  it('falls back to the first letter or digit of the name, upper case', () => {
    const { container } = render(<IdentityMark name="  «morning» brief" />)
    expect(mark(container)?.textContent).toBe('M')
  })

  it('counts a digit as a letter', () => {
    const { container } = render(<IdentityMark name="3 jobs" />)
    expect(mark(container)?.textContent).toBe('3')
  })

  it('shows a question mark when there is nothing to draw', () => {
    const { container, rerender } = render(<IdentityMark />)
    expect(mark(container)?.textContent).toBe('?')
    rerender(<IdentityMark name="—" />)
    expect(mark(container)?.textContent).toBe('?')
  })

  it('has three sizes and keeps a custom class', () => {
    const { container, rerender } = render(<IdentityMark kind="job" />)
    expect(mark(container)?.className).toContain('size-8')
    rerender(<IdentityMark kind="job" size="sm" />)
    expect(mark(container)?.className).toContain('size-6')
    rerender(<IdentityMark kind="job" size="lg" className="ml-2" />)
    expect(mark(container)?.className).toContain('size-10')
    expect(mark(container)?.className).toContain('ml-2')
  })
})
