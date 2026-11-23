import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpReadClassControl } from '@/components/gateway/mcp-read-class'
import type { GatewayMcpClient, McpReadClass, McpTool } from '@/lib/gateway/mcp'
import { GatewayError } from '@/lib/gateway/transport'

afterEach(() => cleanup())

const tool: McpTool = {
  id: 'mcp.weather',
  name: 'Weather',
  description: 'Read the forecast',
  status: 'active',
  authorization: 'owner_confirmation',
  url: 'https://mcp.example.com/weather',
  tool_name: 'get_weather',
  schema_hash: 'a'.repeat(64),
  secret_ref: null,
  version: 3,
  digest: 'b'.repeat(64),
  read_class: 'act_outward',
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function setup(stored: McpReadClass | null = 'act_outward') {
  const answer = deferred<McpTool>()
  const setClass = vi.fn<(tool: McpTool, next: McpReadClass) => Promise<McpTool>>(() => answer.promise)
  const onStored = vi.fn(),
    onReload = vi.fn()
  const view = render(<McpReadClassControl client={{ setClass } as unknown as GatewayMcpClient} tool={{ ...tool, read_class: stored ?? undefined }} onStored={onStored} onReload={onReload} />)
  return { answer, setClass, onStored, onReload, view }
}
const radio = (name: RegExp) => screen.getByRole('radio', { name }) as HTMLElement
const checked = (name: RegExp) => radio(name).getAttribute('aria-checked') === 'true'

describe('MCP read class control', () => {
  it('shows the class ToolGate stored, one of the two choices', () => {
    setup('observe')
    expect(screen.getByRole('radiogroup', { name: 'Before each call' })).toBeTruthy()
    expect(checked(/Runs without asking \(read only\)/)).toBe(true)
    expect(checked(/Asks every time/)).toBe(false)
  })

  it('shows nothing when ToolGate stores no class (a ToolGate from before it)', () => {
    const { view } = setup(null)
    expect(view.container.innerHTML).toBe('')
  })

  it('keeps the stored class while saving and moves only when ToolGate answers', async () => {
    const { answer, setClass, onStored } = setup()
    fireEvent.click(radio(/Runs without asking/))
    expect(setClass).toHaveBeenCalledWith(expect.objectContaining({ id: 'mcp.weather', version: 3 }), 'observe')
    // Not optimistic: the stored choice stays selected, the radios wait, and the password is mentioned.
    expect(checked(/Asks every time/)).toBe(true)
    expect(radio(/Runs without asking/).hasAttribute('data-disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Saving… Conker asks your password first.')
    const saved = { ...tool, read_class: 'observe' as const, version: 4 }
    await act(async () => answer.resolve(saved))
    expect(onStored).toHaveBeenCalledWith(saved)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says only Saving when going back to asking every time', async () => {
    const { answer, setClass } = setup('observe')
    fireEvent.click(radio(/Asks every time/))
    expect(setClass).toHaveBeenCalledWith(expect.anything(), 'act_outward')
    expect(screen.getByRole('status').textContent).toBe('Saving…')
    await act(async () => answer.resolve({ ...tool, version: 4 }))
  })

  it('shows why ToolGate refused Observe and keeps the stored class', async () => {
    const { answer, onStored, onReload } = setup()
    fireEvent.click(radio(/Runs without asking/))
    await act(async () => answer.reject(new GatewayError('http', 422, undefined, 'act_outward_name')))
    expect(screen.getByRole('alert').textContent).toBe('It still asks every time: its name could act. Only a tool named like get_weather or list_emails can run without asking.')
    expect(checked(/Asks every time/)).toBe(true)
    expect(onStored).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved tool' }))
    expect(onReload).toHaveBeenCalledOnce()
  })
})
