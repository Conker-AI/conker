import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatComposerFrame } from '@/components/chat/composer'
import { ToolRecord } from '@/components/chat/tool-record'
import { ComposerModeProvider, useComposerMode } from '@/components/gateway/mode-control'
import { RichAnswer } from '@/components/rich-answer'
import { publishServerSettings } from '@/settings/server-setting'
import { stubMatchMedia, stubResizeObserver } from './jsdom-shims.test'

/** The owner's chat settings the dashboard reads (R-F1 round three): each test fails if its reader ignores the value. */
let revision = 1000
function choose(values: Record<string, unknown>) {
  revision += 1
  act(() => publishServerSettings({ revision, values }))
}

beforeEach(() => {
  stubMatchMedia()
  stubResizeObserver()
})
afterEach(() => {
  choose({})
  cleanup()
  vi.unstubAllGlobals()
})

function composer() {
  const onSend = vi.fn()
  render(<ChatComposerFrame id="c" label="Message Conker" placeholder="" value="Hi" onChange={() => undefined} onSend={onSend} disabled={false} actions={null} />)
  return { onSend, box: screen.getByRole('textbox', { name: 'Message Conker' }) as HTMLTextAreaElement }
}

describe('chats.spellcheck', () => {
  it('marks spelling while on and stops when he turns it off', () => {
    const { box } = composer()
    expect(box.getAttribute('spellcheck')).toBe('true')
    choose({ 'chats.spellcheck': false })
    expect(box.getAttribute('spellcheck')).toBe('false')
  })
})

describe('chats.send_with', () => {
  it('sends on Enter by default', () => {
    const { onSend, box } = composer()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('with Ctrl+Enter, Enter makes a new line and Ctrl or Cmd + Enter sends', () => {
    choose({ 'chats.send_with': 'ctrl_enter' })
    const { onSend, box } = composer()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledTimes(2)
    expect(document.getElementById('c-help')?.textContent).toBe('Enter for a new line. Ctrl+Enter to send.')
    expect(box.getAttribute('enterkeyhint')).toBe('enter')
  })
})

describe('chats.code_wrap', () => {
  it('wraps long code lines only when he asks', async () => {
    render(<RichAnswer text={'```text\n' + 'x'.repeat(300) + '\n```'} />)
    const code = await screen.findByLabelText('text code')
    expect(code.hasAttribute('data-wrap')).toBe(false)
    choose({ 'chats.code_wrap': true })
    expect(code.hasAttribute('data-wrap')).toBe(true)
  })
})

describe('chats.tool_calls', () => {
  const text = JSON.stringify({ tool: 'research.web', status: 'ok', output: 'Found it' })
  const show = () =>
    render(
      <MemoryRouter>
        <ToolRecord text={text} sequence={3} />
      </MemoryRouter>,
    )

  it('is folded by default, open when he says so, and left out when hidden', () => {
    const { container } = show()
    expect(container.querySelector('details')?.open).toBe(false)
    cleanup()
    choose({ 'chats.tool_calls': 'expanded' })
    expect(show().container.querySelector('details')?.open).toBe(true)
    cleanup()
    choose({ 'chats.tool_calls': 'hidden' })
    expect(show().container.querySelector('details')).toBeNull()
  })
})

describe('chats.default_mode', () => {
  function Probe() {
    return <p>{useComposerMode()?.current}</p>
  }
  const mount = () =>
    render(
      <ComposerModeProvider text="" think={false} research="off" thinkAvailable harnessDisabled={false} sessionId={null} disabled={false} modelId="" setModel={() => undefined} propose={vi.fn()} apply={vi.fn()}>
        <Probe />
      </ComposerModeProvider>,
    )

  it('starts a composer in Auto, or in the mode he chose', () => {
    mount()
    expect(screen.getByText('auto')).not.toBeNull()
    cleanup()
    choose({ 'chats.default_mode': 'deep' })
    mount()
    expect(screen.getByText('deep')).not.toBeNull()
  })
})
