import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatMessageRecord, ChatTranscript } from '@/components/chat/transcript'
import type { Action, ChatContract, ChatMessage, MessageAction } from '@/lib/chat/contract'
import { stubResizeObserver } from './jsdom-shims.test'

// The formatter is loaded on first use, which is slow in a cold run: load it once here, with room, so no test waits on it.
beforeAll(async () => {
  await import('@/components/rich-answer')
}, 120_000)

beforeEach(() => {
  stubResizeObserver()
  // Streaming text appears at once instead of word by word.
  document.documentElement.dataset.motion = 'off'
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.motion
})

/** The formatter loads on first use, which takes a while in a cold test run. */
const LAZY = { timeout: 15_000 }

const unsupported: Action = { availability: 'unsupported', reason: '' }
const noActions = (): Record<MessageAction, Action> => ({
  copy: unsupported,
  link: unsupported,
  edit: unsupported,
  retry: unsupported,
  fork: unsupported,
  pin: unsupported,
  rateUp: unsupported,
  rateDown: unsupported,
  redact: unsupported,
  saveArtifact: unsupported,
})
const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg_1',
  sessionId: 'sess_1',
  sequence: 1,
  role: 'user',
  createdAt: '2026-11-23T09:30:00.000Z',
  content: { kind: 'text', text: 'Hello there' },
  agentId: null,
  actions: noActions(),
  ...over,
})
const enabled = (run: () => void | Promise<void>): Action => ({ availability: 'enabled', run })

const record = (value: ChatMessage) =>
  render(
    <MemoryRouter>
      <ChatMessageRecord message={value} />
    </MemoryRouter>,
  )

describe('ChatMessageRecord: the owner’s message', () => {
  it('is an article named by role and place in the chat, with the words kept as typed', () => {
    record(message({ sequence: 3, content: { kind: 'text', text: 'Line one\nLine two' } }))
    const article = screen.getByRole('article', { name: 'user message 3' })
    const words = within(article).getByText('Line one Line two')
    expect(words.className).toContain('whitespace-pre-wrap')
    expect(words.getAttribute('dir')).toBe('auto')
  })

  it('names its time for assistive technology', () => {
    record(message())
    const time = screen.getByRole('article').querySelector('time')!
    expect(time.getAttribute('datetime')).toBe('2026-11-23T09:30:00.000Z')
    expect(time.getAttribute('aria-label')).toBe(new Date('2026-11-23T09:30:00.000Z').toLocaleString())
  })

  it('keeps a long unbroken message inside the bubble', () => {
    const long = 'x'.repeat(500)
    record(message({ content: { kind: 'text', text: long } }))
    expect(screen.getByText(long).className).toContain('[overflow-wrap:anywhere]')
  })

  it('says a record that is not text cannot be shown', () => {
    record(message({ content: { kind: 'unavailable', reason: 'unsupported' } }))
    expect(screen.getByText('This record cannot be displayed as text.')).not.toBeNull()
  })
})

describe('ChatMessageRecord: the action bar', () => {
  const group = () => screen.getByRole('group', { name: 'Message actions' })

  it('has no copy or link buttons, and no menu, when the message supports none', () => {
    record(message())
    expect(within(group()).queryAllByRole('button')).toHaveLength(0)
  })

  it('copies the message and says so', async () => {
    const run = vi.fn()
    record(message({ actions: { ...noActions(), copy: enabled(run) } }))
    fireEvent.click(within(group()).getByRole('button', { name: 'Copy message' }))
    expect((await screen.findByRole('status')).textContent).toBe('Message copied.')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('says the clipboard is unavailable when copying fails', async () => {
    record(message({ actions: { ...noActions(), copy: enabled(() => Promise.reject(new Error('denied'))) } }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    expect((await screen.findByRole('status')).textContent).toBe('Clipboard unavailable. Select the message text to copy it.')
  })

  it('copies a link, and warns that it needs sign-in', async () => {
    record(message({ actions: { ...noActions(), link: enabled(() => undefined) } }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy message link' }))
    expect((await screen.findByRole('status')).textContent).toBe('Local message link copied. Sign-in is required to open it.')
  })

  it('shows a disabled action with its reason in the name, and does nothing when pressed', () => {
    record(message({ actions: { ...noActions(), copy: { availability: 'disabled', reason: 'Nothing to copy yet.' } } }))
    const button = screen.getByRole('button', { name: 'Copy message: Nothing to copy yet.' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('collects the other actions in a "More message actions" menu, with the reason under a disabled one', async () => {
    const retry = vi.fn()
    record(message({ role: 'assistant', content: { kind: 'text', text: 'An answer' }, actions: { ...noActions(), retry: enabled(retry), fork: { availability: 'disabled', reason: 'This chat is closed.' }, pin: enabled(() => undefined) } }))
    fireEvent.click(screen.getByRole('button', { name: 'More message actions' }))
    const items = (await screen.findAllByRole('menuitem')).map(item => item.textContent)
    expect(items).toEqual(['Retry', 'ForkThis chat is closed.', 'Pin'])
    const fork = screen.getByRole('menuitem', { name: /^Fork/ })
    expect(fork.getAttribute('aria-disabled') ?? fork.getAttribute('data-disabled')).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry' }))
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
  })

  it('says an action failed when a menu action throws', async () => {
    record(message({ role: 'assistant', content: { kind: 'text', text: 'An answer' }, actions: { ...noActions(), retry: enabled(() => Promise.reject(new Error('no'))) } }))
    fireEvent.click(screen.getByRole('button', { name: 'More message actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Retry' }))
    expect(await screen.findByText('Retry failed. Please try again.')).not.toBeNull()
  })

  it('has no menu when every other action is unsupported', () => {
    record(message({ actions: { ...noActions(), copy: enabled(() => undefined) } }))
    expect(screen.queryByRole('button', { name: 'More message actions' })).toBeNull()
  })
})

describe('ChatMessageRecord: Conker’s answer', () => {
  it('shows who answered, when, and the saved turn details, above the formatted text', async () => {
    record(message({ id: 'msg_2', sequence: 2, role: 'assistant', agentId: 'companion', content: { kind: 'text', text: 'Here is **bold** advice.' }, details: 'Claude · 2.1 s' }))
    const article = screen.getByRole('article', { name: 'assistant message 2' })
    expect(within(article).getByText('Conker')).not.toBeNull()
    expect(within(article).getByText(/Claude · 2\.1 s/)).not.toBeNull()
    expect(await within(article).findByText('bold', {}, LAZY)).not.toBeNull()
    expect(screen.queryByText('Formatting response…')).toBeNull()
  })

  it('names another agent by its own name', async () => {
    record(message({ role: 'assistant', agentId: 'agent_7', agentName: 'Researcher', content: { kind: 'text', text: 'Found it.' } }))
    expect(screen.getByText('Researcher')).not.toBeNull()
    await screen.findByText('Found it.', {}, LAZY)
  })

  it('says a message could not be shown without leaving a blank', () => {
    record(message({ role: 'assistant', content: { kind: 'unavailable', reason: 'unsupported' } }))
    expect(screen.getByText('This record cannot be displayed as text.')).not.toBeNull()
  })

  it('folds a memory status under the answer until opened, and checks it on request', () => {
    const run = vi.fn()
    const memory = { label: 'Memory: waiting', description: 'Conker has not confirmed saving this yet.', checking: false, refresh: enabled(run), memoryId: null, undo: unsupported }
    record(message({ role: 'assistant', content: { kind: 'text', text: 'Noted.' }, memory }))
    const summary = screen.getByText('Memory: waiting')
    expect(summary.closest('details')!.open).toBe(false)
    fireEvent.click(summary)
    expect(screen.getByText('Conker has not confirmed saving this yet.')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check memory status' }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('greys the memory check while it is being checked, or when it cannot run', () => {
    const memory = { label: 'Memory: waiting', description: 'd', checking: true, refresh: enabled(() => undefined), memoryId: null, undo: unsupported }
    record(message({ role: 'assistant', content: { kind: 'text', text: 'Noted.' }, memory }))
    const button = screen.getByRole('button', { name: 'Checking…', hidden: true }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    cleanup()
    record(message({ role: 'assistant', content: { kind: 'text', text: 'Noted.' }, memory: { ...memory, checking: false, refresh: { availability: 'disabled', reason: 'Offline' } } }))
    expect((screen.getByRole('button', { name: 'Check memory status', hidden: true }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ChatMessageRecord: system and tool records', () => {
  it('folds a system record to one line that opens to its text', () => {
    record(message({ role: 'system', sequence: 5, content: { kind: 'text', text: 'Context was summarised.' } }))
    const summary = screen.getByText('System record · 5')
    expect(summary.closest('details')!.open).toBe(false)
    fireEvent.click(summary)
    expect(screen.getByText('Context was summarised.')).not.toBeNull()
  })

  it('shows a tool step with readable text as a tool row', () => {
    record(message({ role: 'tool', sequence: 6, content: { kind: 'text', text: JSON.stringify({ tool: 'sandbox.run', result: { exitCode: 0, stdout: 'ok' } }) } }))
    expect(document.querySelector('summary[aria-label="Tool Run, Done, step 6"]')).not.toBeNull()
  })

  it('names a tool record whose text is gone', () => {
    record(message({ role: 'tool', sequence: 7, content: { kind: 'unavailable', reason: 'unsupported' } }))
    expect(screen.getByText('Tool record · 7')).not.toBeNull()
  })
})

describe('ChatTranscript', () => {
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
  const transcript = (value: ChatContract) =>
    render(
      <MemoryRouter>
        <ChatTranscript chat={value} />
      </MemoryRouter>,
    )

  it('says so when a ready chat has no messages', () => {
    transcript(chat())
    expect(screen.getByText('No saved messages in this conversation.')).not.toBeNull()
  })

  it('says it is loading history, and does not claim the chat is empty', () => {
    transcript(chat({ history: 'loading' }))
    expect(screen.getByRole('status').textContent).toBe('Loading saved history…')
    expect(screen.queryByText('No saved messages in this conversation.')).toBeNull()
  })

  it('shows a load failure with a retry that reads history again', () => {
    const run = vi.fn()
    transcript(chat({ history: 'error', checkHistory: { availability: 'enabled', run } }))
    expect(screen.getByText('Messages didn’t load')).not.toBeNull()
    expect(screen.getByText('Your draft is safe. This refreshes by itself when your server answers again.')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('offers no retry when history cannot be checked', () => {
    transcript(chat({ history: 'error', checkHistory: { availability: 'disabled', reason: 'Offline' } }))
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('keeps the messages it has when a later history read fails', () => {
    transcript(chat({ history: 'error', messages: [message()] }))
    expect(screen.queryByText('Messages didn’t load')).toBeNull()
    expect(screen.getByText('Hello there')).not.toBeNull()
  })

  it('shows a notice as a status and an error as an alert', () => {
    transcript(chat({ notice: 'Reconnected.', error: 'The last reply failed.' }))
    expect(screen.getByRole('status').textContent).toBe('Reconnected.')
    expect(screen.getByRole('alert').textContent).toBe('The last reply failed.')
  })

  it('lists many messages in order, each findable by its place in the chat', () => {
    const many = Array.from({ length: 40 }, (_, index) => message({ id: `msg_${index}`, sequence: index + 1, content: { kind: 'text', text: `Note ${index + 1}` } }))
    transcript(chat({ messages: many }))
    expect(screen.getAllByRole('article')).toHaveLength(40)
    expect(screen.getByRole('article', { name: 'user message 40' })).not.toBeNull()
    expect(screen.queryByText('No saved messages in this conversation.')).toBeNull()
  })

  it('shows a tool request and its record as the one tool row', () => {
    const request = message({ id: 'a', sequence: 1, role: 'assistant', content: { kind: 'text', text: JSON.stringify({ tool: 'sandbox.run', args: { code: 'print(1)' } }) } })
    const result = message({ id: 'b', sequence: 2, role: 'tool', content: { kind: 'text', text: JSON.stringify({ tool: 'sandbox.run', result: { exitCode: 0, stdout: '1' } }) } })
    transcript(chat({ messages: [request, result] }))
    expect(screen.queryByRole('article', { name: 'assistant message 1' })).toBeNull()
    expect(document.querySelector('summary[aria-label="Tool Run, Done, step 2"]')).not.toBeNull()
  })

  it('highlights the message the link points at', () => {
    transcript(chat({ messages: [message({ id: 'msg_a' }), message({ id: 'msg_b', sequence: 2, content: { kind: 'text', text: 'Pointed at' } })], focusedMessageId: 'msg_b' }))
    expect(document.getElementById('record-msg_b')!.className).toContain('bg-muted')
    expect(document.getElementById('record-msg_a')!.className).not.toContain('bg-muted')
  })

  it('shows a sent message that is waiting for saved history', () => {
    transcript(chat({ submission: { kind: 'sending', inputSaved: false, attempt: { requestedSessionId: 'sess_1', input: { kind: 'text', text: 'Still on its way' } } } }))
    const waiting = screen.getByRole('article', { name: 'Submitted message awaiting saved history' })
    expect(within(waiting).getByText('Still on its way')).not.toBeNull()
    expect(within(waiting).getByRole('status').textContent).toBe('Waiting for saved history')
    expect(screen.queryByText('No saved messages in this conversation.')).toBeNull()
  })

  it('does not repeat a sent message whose input is already saved', () => {
    transcript(chat({ submission: { kind: 'sending', inputSaved: true, attempt: { requestedSessionId: 'sess_1', input: { kind: 'text', text: 'Saved already' } } } }))
    expect(screen.queryByRole('article', { name: 'Submitted message awaiting saved history' })).toBeNull()
  })

  it.each([
    ['starting', 'Conker is writing…', 'true'],
    ['streaming', 'Conker is writing…', 'true'],
    ['stopping', 'Stopping…', 'true'],
    ['ended', 'Saving reply…', 'false'],
  ] as const)('says what a %s reply is doing', (phase, words, busy) => {
    const generation = { id: 'g1', sessionId: 'sess_1', phase, previewText: '', resetVersion: 0, stop: unsupported }
    transcript(chat({ generation }))
    const article = screen.getByRole('article', { name: 'Conker is writing' })
    expect(article.getAttribute('aria-busy')).toBe(busy)
    expect(within(article).getByRole('status').textContent).toBe(words)
  })

  it('shows the reply as it is written, under the agent’s name', async () => {
    const generation = { id: 'g1', sessionId: 'sess_1', phase: 'streaming' as const, previewText: 'The answer so far', resetVersion: 0, stop: unsupported }
    transcript(chat({ activeAgentName: 'Researcher', generation }))
    expect(screen.getByRole('article', { name: 'Researcher is writing' })).not.toBeNull()
    expect(await screen.findByText('The answer so far', {}, LAZY)).not.toBeNull()
  })

  it('does not say the chat is empty while a reply is being written', () => {
    const generation = { id: 'g1', sessionId: 'sess_1', phase: 'starting' as const, previewText: '', resetVersion: 0, stop: unsupported }
    transcript(chat({ generation }))
    expect(screen.queryByText('No saved messages in this conversation.')).toBeNull()
  })

  it('shows a saved turn’s outcome with its words, status and controls', () => {
    const accept = vi.fn()
    const outcomes = [
      {
        id: 'o1',
        title: 'Reply was cut short',
        description: 'The model stopped before finishing.',
        consequence: 'Nothing was changed.',
        recordedAt: '2026-11-23T09:30:00.000Z',
        status: 'Checked: still cut short',
        controls: [
          { label: 'Try again', primary: true, action: { availability: 'enabled', run: accept } as Action },
          { label: 'Leave it', action: { availability: 'disabled', reason: 'Not now' } as Action },
        ],
      },
    ]
    transcript(chat({ outcomes }))
    const section = screen.getByRole('region', { name: 'Reply was cut short' })
    for (const text of ['The model stopped before finishing.', 'Nothing was changed.', 'Checked: still cut short']) expect(within(section).getByText(text)).not.toBeNull()
    fireEvent.click(within(section).getByRole('button', { name: 'Try again' }))
    expect(accept).toHaveBeenCalledTimes(1)
    expect((within(section).getByRole('button', { name: 'Leave it' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows an outcome with no status and no controls without empty gaps', () => {
    const outcomes = [{ id: 'o2', title: 'Saved', description: 'It is saved.', consequence: 'Nothing else.', recordedAt: '2026-11-23T09:30:00.000Z', controls: [] }]
    transcript(chat({ outcomes }))
    const section = screen.getByRole('region', { name: 'Saved' })
    expect(within(section).queryByRole('status')).toBeNull()
    expect(within(section).queryByRole('button')).toBeNull()
  })

  it('updates when more messages arrive', async () => {
    const view = transcript(chat({ messages: [message()] }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await act(async () => {
      view.rerender(
        <MemoryRouter>
          <ChatTranscript chat={chat({ messages: [message(), message({ id: 'msg_2', sequence: 2, content: { kind: 'text', text: 'Another one' } })] })} />
        </MemoryRouter>,
      )
    })
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})
