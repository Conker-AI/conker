import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatComposer, ChatComposerFrame } from '@/components/chat/composer'
import { composerItem, useComposerValue } from '@/components/chat/composer-items'
import type { Action, ChatContract } from '@/lib/chat/contract'
import { stubMatchMedia, stubResizeObserver } from './jsdom-shims.test'

beforeEach(() => {
  stubMatchMedia()
  stubResizeObserver()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const enabled = (run: (...args: never[]) => void = () => undefined): Action<never[]> => ({ availability: 'enabled', run }) as Action<never[]>
const chat = (over: Partial<ChatContract> = {}): ChatContract => ({
  source: 'gateway',
  sessionId: 'sess_1',
  messages: [],
  activeAgentName: 'Conker',
  history: 'ready',
  notice: null,
  error: null,
  draft: '',
  setDraft: { availability: 'enabled', run: () => undefined },
  send: { availability: 'enabled', run: () => undefined },
  checkHistory: { availability: 'enabled', run: () => undefined },
  generation: null,
  submission: { kind: 'idle' },
  ...over,
})
const box = () => screen.getByRole('textbox', { name: 'Message Conker' }) as HTMLTextAreaElement
const send = () => screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement

describe('ChatComposer', () => {
  it('is a form named "Message composer" with a labelled box that names who it writes to', () => {
    render(<ChatComposer chat={chat()} />)
    expect(screen.getByRole('form', { name: 'Message composer' })).not.toBeNull()
    expect(box().placeholder).toBe('Reply to Conker...')
    expect(box().getAttribute('dir')).toBe('auto')
  })

  it('uses the active agent’s name for the label and the placeholder', () => {
    render(<ChatComposer chat={chat({ activeAgentName: 'Researcher' })} />)
    const field = screen.getByRole('textbox', { name: 'Message Researcher' }) as HTMLTextAreaElement
    expect(field.placeholder).toBe('Reply to Researcher...')
  })

  it('shows the draft and reports every edit', () => {
    const run = vi.fn()
    render(<ChatComposer chat={chat({ draft: 'Hello', setDraft: { availability: 'enabled', run } })} />)
    expect(box().value).toBe('Hello')
    fireEvent.change(box(), { target: { value: 'Hello again' } })
    expect(run).toHaveBeenCalledWith('Hello again')
  })

  it('greys the box and drops edits while the draft cannot be set', () => {
    const run = vi.fn()
    render(<ChatComposer chat={chat({ setDraft: { availability: 'disabled', reason: 'Offline' } })} />)
    expect(box().disabled).toBe(true)
    expect(run).not.toHaveBeenCalled()
  })

  it('tells assistive technology how Enter behaves', () => {
    render(<ChatComposer chat={chat()} />)
    expect(box().getAttribute('aria-describedby')).toBe('gateway-composer-help')
    expect(document.getElementById('gateway-composer-help')!.textContent).toBe('Enter to send. Shift+Enter for a new line.')
    expect(box().getAttribute('enterkeyhint')).toBe('send')
  })

  it('on a phone, Enter makes a new line and only the Send button sends', () => {
    stubMatchMedia(['(max-width: 767px)', '(pointer: coarse)'])
    const run = vi.fn()
    render(<ChatComposer chat={chat({ draft: 'Hi', send: { availability: 'enabled', run } })} />)
    expect(document.getElementById('gateway-composer-help')!.textContent).toBe('Enter for a new line. Use the Send button to send.')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(run).not.toHaveBeenCalled()
    fireEvent.click(send())
    expect(run).toHaveBeenCalledTimes(1)
  })

  describe('sending', () => {
    it('sends on Enter, and Shift+Enter leaves the line break alone', () => {
      const run = vi.fn()
      render(<ChatComposer chat={chat({ draft: 'Hi', send: { availability: 'enabled', run } })} />)
      fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })
      expect(run).not.toHaveBeenCalled()
      fireEvent.keyDown(box(), { key: 'Enter' })
      expect(run).toHaveBeenCalledTimes(1)
    })

    it('sends from the button, and the button is a submit button titled "Send message"', () => {
      const run = vi.fn()
      render(<ChatComposer chat={chat({ draft: 'Hi', send: { availability: 'enabled', run } })} />)
      expect(send().type).toBe('submit')
      expect(send().title).toBe('Send message')
      fireEvent.click(send())
      expect(run).toHaveBeenCalledTimes(1)
    })

    it('greys Send with the reason as its title, and does not send, when it is unavailable', () => {
      const run = vi.fn()
      render(<ChatComposer chat={chat({ draft: '', send: { availability: 'disabled', reason: 'Write a message first.' } })} />)
      expect(send().disabled).toBe(true)
      expect(send().title).toBe('Write a message first.')
      fireEvent.keyDown(box(), { key: 'Enter' })
      expect(run).not.toHaveBeenCalled()
    })

    it('does not send, and says why, while voice typing is going', () => {
      const run = vi.fn()
      render(<ChatComposer chat={chat({ draft: 'Hi', send: { availability: 'enabled', run } })} dictating />)
      expect(send().disabled).toBe(true)
      expect(send().title).toBe('Finish voice typing before sending')
      fireEvent.keyDown(box(), { key: 'Enter' })
      expect(run).not.toHaveBeenCalled()
    })
  })

  describe('the length limit', () => {
    it('is quiet at the limit', () => {
      render(<ChatComposer chat={chat({ draft: 'a'.repeat(16_000) })} />)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(box().getAttribute('aria-invalid')).toBeNull()
    })

    it('raises an alert one character over, and marks the box invalid', () => {
      render(<ChatComposer chat={chat({ draft: 'a'.repeat(16_001) })} />)
      expect(screen.getByRole('alert').textContent).toBe('Use 16,000 characters or fewer.')
      expect(box().getAttribute('aria-invalid')).toBe('true')
    })

    it('counts letters the way people do, not code units', () => {
      // 8,001 emoji are 8,001 characters but 16,002 UTF-16 units: a plain .length would wrongly raise the alert.
      render(<ChatComposer chat={chat({ draft: '😀'.repeat(8_001) })} />)
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('while Conker is writing', () => {
    const generation = (phase: 'starting' | 'streaming' | 'stopping' | 'ended', stop: Action = enabled()) => ({ id: 'g', sessionId: 'sess_1', phase, previewText: '', resetVersion: 0, stop })

    it('swaps Send for a Stop button that stops the reply', () => {
      const run = vi.fn()
      render(<ChatComposer chat={chat({ generation: generation('streaming', { availability: 'enabled', run }) })} />)
      expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
      expect(run).toHaveBeenCalledTimes(1)
    })

    it('says Stopping... and greys the button once it was pressed', () => {
      render(<ChatComposer chat={chat({ generation: generation('stopping', { availability: 'disabled', reason: 'Already stopping' }) })} />)
      expect((screen.getByRole('button', { name: 'Stopping...' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('greys Stop when stopping is not available', () => {
      render(<ChatComposer chat={chat({ generation: generation('starting', { availability: 'unsupported', reason: '' }) })} />)
      expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('around the box', () => {
    it('shows its own controls and extra actions on the bar, and replaces the box with a custom input', () => {
      render(<ChatComposer chat={chat()} controls={<button type="button">Agent</button>} actions={<button type="button">Dictate</button>} input={<p>Recording…</p>} />)
      expect(screen.getByRole('button', { name: 'Agent' })).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Dictate' })).not.toBeNull()
      expect(screen.getByText('Recording…')).not.toBeNull()
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('shows feedback under the bar, and nothing when there is none', () => {
      const view = render(<ChatComposerFrame id="c" label="Message" placeholder="Write" value="" onChange={() => undefined} onSend={() => undefined} disabled={false} actions={null} feedback={<p>Saved as a draft</p>} />)
      expect(screen.getByText('Saved as a draft')).not.toBeNull()
      view.unmount()
      render(<ChatComposerFrame id="c" label="Message" placeholder="Write" value="" onChange={() => undefined} onSend={() => undefined} disabled={false} actions={null} />)
      expect(screen.queryByText('Saved as a draft')).toBeNull()
    })

    it('submitting the form sends once and does not reload the page', () => {
      const onSend = vi.fn()
      render(<ChatComposerFrame id="c" label="Message" placeholder="Write" value="Hi" onChange={() => undefined} onSend={onSend} disabled={false} actions={<button type="submit">Go</button>} />)
      expect(fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }))).toBe(false)
      expect(onSend).toHaveBeenCalledTimes(1)
    })
  })
})

describe('ChatComposerFrame: items on the bar', () => {
  function Item({ label, value }: { label: string; value: string | null }) {
    useComposerValue('search', value)
    return <button type="button">{label}</button>
  }
  composerItem(Item, 'search')
  function Spare({ label }: { label: string }) {
    useComposerValue('think', `${label} is on`)
    return <button type="button">{label}</button>
  }
  composerItem(Spare, 'think')

  const frame = (settings: React.ReactNode) =>
    render(<ChatComposerFrame id="c" label="Message" placeholder="Write" value="" onChange={() => undefined} onSend={() => undefined} disabled={false} actions={<button type="button">Dictate</button>} settings={settings} />)

  it('keeps registered items on the bar until the bar is measured as too narrow', () => {
    frame(<Item label="Search" value="Search: Web" />)
    expect(screen.getByRole('button', { name: 'Search' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^More options/ })).toBeNull()
  })

  it('folds an item into a "More options" button that names what is set, when the bar is narrow', async () => {
    stubResizeObserver(300)
    frame(
      <>
        <Item label="Search" value="Search: Web" />
        <Spare label="Think" />
      </>,
    )
    const more = await screen.findByRole('button', { name: 'More options: Think is on · Search: Web' })
    expect(more.getAttribute('title')).toBe('Think is on · Search: Web')
    // Folded items stay mounted so they keep reporting; the bar itself no longer shows them.
    expect(screen.getByText('Think is on · Search: Web', { selector: 'p' })).not.toBeNull()
  })

  it('names the fold with plain "More options" while the folded items have nothing set', async () => {
    stubResizeObserver(300)
    frame(<Item label="Search" value={null} />)
    const more = await screen.findByRole('button', { name: 'More options' })
    expect(more.getAttribute('title')).toBeNull()
    expect(screen.queryByText(/ · /)).toBeNull()
  })

  it('keeps the owner’s own actions on the bar however narrow it gets', async () => {
    stubResizeObserver(300)
    frame(<Item label="Search" value="Search: Web" />)
    await screen.findByRole('button', { name: /^More options/ })
    const bar = screen.getByRole('button', { name: 'Dictate' }).parentElement!
    expect(within(bar).getByRole('button', { name: 'Dictate' })).not.toBeNull()
  })

  it('does not fold anything on a wide bar', async () => {
    stubResizeObserver(900)
    frame(<Item label="Search" value="Search: Web" />)
    await screen.findByRole('button', { name: 'Search' })
    expect(screen.queryByRole('button', { name: /^More options/ })).toBeNull()
  })
})
