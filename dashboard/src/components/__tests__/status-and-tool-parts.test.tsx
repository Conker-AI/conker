import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatFeatureError } from '@/components/chat/chat-feature-error'
import { ToolRecord } from '@/components/chat/tool-record'
import { StatusBadge } from '@/components/status-badge'

afterEach(() => cleanup())

describe('StatusBadge', () => {
  it('shows its words with a decorative dot that screen readers skip', () => {
    render(<StatusBadge>Connected</StatusBadge>)
    const badge = screen.getByText('Connected')
    expect(badge.textContent).toBe('Connected')
    const dot = badge.querySelector('span')!
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(dot.textContent).toBe('')
  })

  it.each([
    ['neutral', 'bg-muted-foreground'],
    ['live', 'bg-success'],
    ['warning', 'bg-warning'],
  ] as const)('paints the %s tone with its own dot', (tone, dotClass) => {
    render(<StatusBadge tone={tone}>Status</StatusBadge>)
    expect(screen.getByText('Status').querySelector('span')!.className).toContain(dotClass)
  })

  it('colours the chip only for the live and warning tones', () => {
    render(
      <>
        <StatusBadge tone="live">Live</StatusBadge>
        <StatusBadge tone="warning">Careful</StatusBadge>
        <StatusBadge>Idle</StatusBadge>
      </>,
    )
    expect(screen.getByText('Live').className).toContain('text-success-foreground')
    expect(screen.getByText('Live').className).not.toContain('text-warning-foreground')
    expect(screen.getByText('Careful').className).toContain('text-warning-foreground')
    expect(screen.getByText('Careful').className).not.toContain('text-success-foreground')
    expect(screen.getByText('Idle').className).not.toContain('success')
    expect(screen.getByText('Idle').className).not.toContain('warning')
  })

  it('keeps a long label whole inside the chip', () => {
    const long = 'Waiting for the owner to finish setting up every connected service on this server'
    render(<StatusBadge tone="warning">{long}</StatusBadge>)
    expect(screen.getByText(long)).not.toBeNull()
  })
})

describe('ChatFeatureError', () => {
  const show = (text: string, className?: string) =>
    render(
      <MemoryRouter>
        <ChatFeatureError text={text} className={className} />
      </MemoryRouter>,
    )

  it('is an alert with the message', () => {
    show('This chat is closed.')
    expect(screen.getByRole('alert').textContent).toBe('This chat is closed.')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it.each([
    ['No model is set up for this.', 'Choose a model'],
    ['That model is not set up.', 'Open Models'],
    ['The model for this is not available right now.', 'Open Models'],
  ])('links "%s" to where it is fixed', (text, label) => {
    show(text)
    const link = within(screen.getByRole('alert')).getByRole('link', { name: label })
    expect(link.getAttribute('href')).toBe('/settings?tab=models')
  })

  it('shows a message of its own with no link, even a long one', () => {
    const long = 'The server answered with something this page does not know how to put in words. '.repeat(6).trim()
    show(long)
    expect(screen.getByRole('alert').textContent).toBe(long)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('adds the caller class beside its own', () => {
    show('Nope.', 'mt-1')
    expect(screen.getByRole('alert').className).toContain('mt-1')
    expect(screen.getByRole('alert').className).toContain('text-xs')
  })
})

describe('ToolRecord', () => {
  const show = (text: string, sequence = 4) =>
    render(
      <MemoryRouter>
        <ToolRecord text={text} sequence={sequence} />
      </MemoryRouter>,
    )
  /** The folded row, found by its accessible name. */
  const row = (name: string) => {
    const found = Array.from(document.querySelectorAll('summary')).find(node => node.getAttribute('aria-label') === name)
    if (!found) throw new Error(`No tool row named "${name}"`)
    return found as HTMLElement
  }

  it('folds a finished command to one row named by tool, outcome and step', () => {
    show(JSON.stringify({ tool: 'sandbox.run_code', result: { exitCode: 0, stdout: 'hello\nworld', durationMs: 250 } }))
    const summary = row('Tool Run code, Done, step 4')
    expect(within(summary).getByText('Run code')).not.toBeNull()
    expect(within(summary).getByText('Done')).not.toBeNull()
    expect(within(summary).getByText('hello')).not.toBeNull()
    expect(within(summary).getByText('250 ms')).not.toBeNull()
  })

  it('writes a long run in seconds', () => {
    show(JSON.stringify({ tool: 'sandbox.run', result: { exitCode: 0, stdout: 'ok', durationMs: 12_345 } }))
    expect(screen.getByText('12.3 s')).not.toBeNull()
  })

  it('keeps the output and the raw record folded until opened', () => {
    show(JSON.stringify({ tool: 'sandbox.run', result: { exitCode: 0, stdout: 'line one\nline two' } }))
    const details = screen.getByText('Advanced').closest('details')!
    expect(details.open).toBe(false)
    // The output block, then the raw record inside the closed Advanced section.
    expect(screen.getByText('line one\nline two', { normalizer: text => text }).tagName).toBe('PRE')
    fireEvent.click(screen.getByText('Advanced'))
    expect(details.open).toBe(true)
    expect(screen.getByText(/"exitCode": 0/).tagName).toBe('PRE')
  })

  it('marks a failed command and shows its error text', () => {
    show(JSON.stringify({ tool: 'sandbox.run', ok: false, result: { exitCode: 2, stderr: 'boom: no such file', stdout: '' } }))
    expect(row('Tool Run, Failed, step 4')).not.toBeNull()
    expect(screen.getAllByText('boom: no such file').length).toBeGreaterThan(0)
  })

  it('marks a timeout and a declined step in their own words', () => {
    show(JSON.stringify({ tool: 'sandbox.run', result: { timedOut: true } }), 7)
    expect(row('Tool Run, Timed out, step 7')).not.toBeNull()
    cleanup()
    show(JSON.stringify({ tool: 'files.write', declined: true }), 8)
    expect(row('Tool Write, Declined, step 8')).not.toBeNull()
  })

  it('names a record it cannot read "Tool", Unknown, and shows its first line', () => {
    show('just some text\nsecond line')
    expect(row('Tool Tool, Unknown, step 4')).not.toBeNull()
    expect(screen.getAllByText('just some text').length).toBeGreaterThan(0)
  })

  it('cuts a very long first line to one short row', () => {
    show('x'.repeat(300))
    const shown = within(row('Tool Tool, Unknown, step 4')).getByText(/^x+…$/)
    expect(shown.textContent!.length).toBe(80)
  })

  it('does not repeat the status word as a summary', () => {
    show(JSON.stringify({ tool: 'files.write', ok: true }))
    expect(within(row('Tool Write, Done, step 4')).getAllByText('Done')).toHaveLength(1)
  })

  it('points a run of another agent at its chat', () => {
    show(JSON.stringify({ tool: 'conker.run_agent', result: { status: 'done', agentName: 'Researcher', sessionId: 'sess 1' } }))
    expect(row('Tool Ran Researcher, Done, step 4')).not.toBeNull()
    expect(screen.getByText('Answered in its own chat')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Open its chat', hidden: true }).getAttribute('href')).toBe('/chat?session=sess%201')
  })

  it('shows a memory search by its count only', () => {
    show(JSON.stringify({ tool: 'conker.recall', result: { status: 'found', count: 3 } }))
    expect(row('Tool Searched memory, Done, step 4')).not.toBeNull()
    expect(screen.getByText('3 found')).not.toBeNull()
  })
})
