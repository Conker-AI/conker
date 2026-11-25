import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnswerFold } from '@/components/chat/answer-fold'
import { codeLines } from '@/components/code-lines'
import { NewChatStart } from '@/components/gateway/new-chat-start'
import { RichAnswer } from '@/components/rich-answer'
import { InboxAttentionContext } from '@/lib/workspace-chrome'
import { publishServerSettings } from '@/settings/server-setting'
import { stubMatchMedia } from './jsdom-shims.test'

/** The owner's chat display settings of round nine (R-F1): each test fails if its reader ignores the value. */
let revision = 9000
function choose(values: Record<string, unknown>) {
  revision += 1
  act(() => publishServerSettings({ revision, values }))
}

/** A ResizeObserver the test fires by hand, the way a real one reports a size. */
const observers: (() => void)[] = []
class HandResizeObserver {
  constructor(callback: () => void) {
    observers.push(callback)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  await import('@/components/rich-answer')
}, 120_000)
beforeEach(() => {
  stubMatchMedia()
  vi.stubGlobal('ResizeObserver', HandResizeObserver)
})
afterEach(() => {
  choose({})
  cleanup()
  observers.length = 0
  vi.unstubAllGlobals()
})

describe('chats.code_numbers', () => {
  const code = '```js\nconst a = 1\n/* two\nlines */\nlet b = 2\n```'

  it('leaves code unnumbered by default, and numbers every line when he turns it on', () => {
    const view = render(<RichAnswer text={code} />)
    expect(view.container.querySelector('pre')?.hasAttribute('data-numbers')).toBe(false)
    expect(view.container.querySelectorAll('.answer-code-line')).toHaveLength(0)
    choose({ 'chats.code_numbers': true })
    const pre = view.container.querySelector('pre')!
    expect(pre.dataset.numbers).toBe('true')
    const lines = [...view.container.querySelectorAll('.answer-code-line')].map(line => line.textContent)
    expect(lines).toEqual(['const a = 1', '/* two', 'lines */', 'let b = 2'])
    // The numbers are the stylesheet's: the text itself (and what Copy takes) is still the code alone.
    expect(pre.textContent).toBe('const a = 1/* twolines */let b = 2')
    expect(pre.style.getPropertyValue('--code-gutter')).toBe('1ch')
  })

  it('keeps the colors of a span that runs over several lines on each of them', () => {
    const lines = codeLines([
      { type: 'element', tagName: 'span', properties: { className: ['hljs-comment'] }, children: [{ type: 'text', value: '/* a\nb */' }] },
      { type: 'text', value: '\n' },
    ])
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject([{ tagName: 'span', children: [{ value: '/* a' }] }])
    expect(lines[1]).toMatchObject([{ tagName: 'span', children: [{ value: 'b */' }] }])
    expect(lines[2]).toEqual([])
  })
})

describe('chats.citations', () => {
  const text = 'Light scatters [1](citation:rayleigh) and blue scatters most [2](citation:missing). Again [1](citation:rayleigh).'
  const citations = [{ id: 'rayleigh', label: 'Rayleigh scattering' }]

  it('shows numbers in the text by default and no list', () => {
    render(<RichAnswer text={text} citations={citations} sources="inline" />)
    expect(screen.getAllByRole('button', { name: 'Source: Rayleigh scattering' })).toHaveLength(2)
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull()
  })

  it('moves sources to a list at the end, each once and in order, or leaves them out', () => {
    const view = render(<RichAnswer text={text} citations={citations} sources="footnotes" />)
    const list = screen.getByRole('region', { name: 'Sources' })
    expect([...list.querySelectorAll('li')].map(item => item.textContent)).toEqual(['Rayleigh scattering', 'Source unavailable'])
    expect(view.container.querySelector('p')?.textContent).toBe('Light scatters  and blue scatters most . Again .')
    cleanup()
    render(<RichAnswer text={text} citations={citations} sources="hidden" />)
    expect(screen.queryByRole('button', { name: /^Source/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull()
  })
})

describe('chats.fold_after', () => {
  /** An answer whose drawn height the test sets, as if it filled `lines` lines of 20 px. */
  function answer(lines: number) {
    const view = render(
      <AnswerFold>
        <p style={{ lineHeight: '20px' }}>A long answer</p>
      </AnswerFold>,
    )
    const body = view.container.querySelector<HTMLElement>('[data-answer-body]')!
    Object.defineProperty(body, 'offsetHeight', { configurable: true, get: () => lines * 20 })
    act(() => observers.forEach(report => report()))
    return view
  }

  it('never folds by default', () => {
    answer(400)
    expect(screen.queryByRole('button', { name: 'Show the whole answer' })).toBeNull()
  })

  it('folds an answer longer than his limit to that many lines, and opens it on request', () => {
    choose({ 'chats.fold_after': 10 })
    const view = answer(40)
    const clip = view.container.querySelector<HTMLElement>('[data-answer-body]')!.parentElement!
    expect(clip.style.maxHeight).toBe('200px')
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole answer' }))
    expect(clip.style.maxHeight).toBe('')
    expect(screen.getByRole('button', { name: 'Fold the answer' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('opens when focus moves into the folded part, so focus is never hidden', () => {
    choose({ 'chats.fold_after': 10 })
    const view = answer(40)
    const clip = view.container.querySelector<HTMLElement>('[data-answer-body]')!.parentElement!
    const text = view.container.querySelector('p')!
    text.tabIndex = 0
    clip.getBoundingClientRect = () => ({ bottom: 200 }) as DOMRect
    text.getBoundingClientRect = () => ({ bottom: 400 }) as DOMRect
    fireEvent.focus(text)
    expect(clip.style.maxHeight).toBe('')
  })

  it('leaves a short answer, or one a single line over, whole', () => {
    choose({ 'chats.fold_after': 10 })
    answer(10)
    expect(screen.queryByRole('button', { name: 'Show the whole answer' })).toBeNull()
  })
})

describe('chats.start', () => {
  const start = (waiting: number | null, typed = false, onPick = vi.fn()) => {
    render(
      <MemoryRouter>
        <InboxAttentionContext.Provider value={waiting}>
          <NewChatStart disabled={false} typed={typed} onPick={onPick} />
        </InboxAttentionContext.Provider>
      </MemoryRouter>,
    )
    return onPick
  }

  it('shows nothing above the box by default', () => {
    start(3)
    expect(document.body.textContent).toBe('')
  })

  it('greets him by the time of day', () => {
    choose({ 'chats.start': 'greeting' })
    start(0)
    expect(screen.getByText(/^Good (morning|afternoon|evening|night)/)).not.toBeNull()
  })

  it('sums up today with what waits in the Inbox, and says so while that is not known', () => {
    choose({ 'chats.start': 'summary' })
    start(null)
    expect(screen.getByRole('status').textContent).toBe('Checking what waits for you…')
    cleanup()
    start(3)
    expect(screen.getByRole('status').textContent).toBe('3 things wait for you in the Inbox.')
    expect(screen.getByRole('link', { name: 'Open the Inbox' }).getAttribute('href')).toBe('/inbox')
    cleanup()
    start(0)
    expect(screen.getByRole('status').textContent).toBe('Nothing waits for you in the Inbox.')
    expect(screen.queryByRole('link', { name: 'Open the Inbox' })).toBeNull()
  })

  it('offers one suggested request that only fills the box, and steps aside once he types', () => {
    choose({ 'chats.start': 'suggestion' })
    const onPick = start(0)
    fireEvent.click(screen.getByRole('button', { name: /^Try:/ }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toMatch(/^Help me /)
    cleanup()
    start(0, true)
    expect(screen.queryByRole('button', { name: /^Try:/ })).toBeNull()
  })
})
