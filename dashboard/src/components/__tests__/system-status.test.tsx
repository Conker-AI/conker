import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GatewaySystemStatus } from '@/components/gateway/system-status'
import type { GatewayControlClient, GatewayDiagnostics } from '@/lib/gateway/control'

afterEach(() => cleanup())

type Finding = GatewayDiagnostics['findings'][number]
const finding = (id: Finding['id'], area: Finding['area'], over: Partial<Finding> = {}): Finding => ({ id, area, label: `Label for ${id}`, status: 'ok', observedStatus: 'ok', detail: `Detail for ${id}`, recovery: null, ...over })
const AREAS: [Finding['id'], Finding['area']][] = [
  ['owner-login', 'access'],
  ['runtime', 'services'],
  ['owner-channel', 'services'],
  ['store', 'services'],
  ['memory', 'services'],
  ['local-model', 'models'],
  ['hosted-model', 'models'],
  ['actions', 'services'],
]
function report(over: Partial<Finding>[] | Record<string, Partial<Finding>> = {}, summary = { attention: 0, ok: 8, optional: 0 }): GatewayDiagnostics {
  const by = Array.isArray(over) ? {} : over
  return {
    schemaVersion: 1,
    status: summary.attention ? 'attention' : 'ok',
    generatedAt: '2026-11-23T10:00:00.000Z',
    summary,
    findings: AREAS.map(([id, area]) => finding(id, area, by[id])),
  }
}

function show(diagnostics: GatewayControlClient['diagnostics']) {
  const client = { diagnostics, hostOps: { receipts: () => new Promise(() => undefined) } } as unknown as GatewayControlClient
  render(
    <MemoryRouter>
      <GatewaySystemStatus client={client} />
    </MemoryRouter>,
  )
}
const refresh = () => screen.getByRole('button', { name: 'Refresh Server' }) as HTMLButtonElement

describe('GatewaySystemStatus', () => {
  it('says it is checking, and holds the refresh button, while the first report is on its way', async () => {
    let resolve: (value: GatewayDiagnostics) => void = () => undefined
    show(vi.fn().mockReturnValue(new Promise<GatewayDiagnostics>(done => (resolve = done))))
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Checking connected services…')
    expect(refresh().disabled).toBe(true)
    await act(async () => resolve(report()))
    expect(screen.queryByText('Checking connected services…')).toBeNull()
    expect(refresh().disabled).toBe(false)
  })

  it('has one level 1 heading for the page, kept for screen readers', async () => {
    show(vi.fn().mockResolvedValue(report()))
    await screen.findByText('Core checks passed')
    expect(screen.getByRole('heading', { level: 1, name: 'Server' })).not.toBeNull()
  })

  it('says the core checks passed when everything is fine, with the counts', async () => {
    show(vi.fn().mockResolvedValue(report({}, { attention: 0, ok: 7, optional: 1 })))
    expect(await screen.findByRole('heading', { level: 2, name: 'Core checks passed' })).not.toBeNull()
    expect(screen.getByText('7 passed · 1 optional')).not.toBeNull()
  })

  it('groups the eight checks under Owner access, Services and Answer models', async () => {
    show(vi.fn().mockResolvedValue(report()))
    await screen.findByText('Core checks passed')
    const counts = (name: string) => within(screen.getByRole('region', { name })).getAllByRole('listitem').length
    expect([counts('Owner access'), counts('Services'), counts('Answer models')]).toEqual([1, 5, 2])
  })

  it('shows an OK check as its label and badge only, without its detail', async () => {
    show(vi.fn().mockResolvedValue(report()))
    await screen.findByText('Core checks passed')
    const row = screen.getByText('Label for owner-login').closest('li')!
    expect(within(row).getByText('OK')).not.toBeNull()
    expect(within(row).queryByText('Detail for owner-login')).toBeNull()
  })

  it('says one check needs attention, with its detail and a Needs attention badge', async () => {
    show(vi.fn().mockResolvedValue(report({ memory: { status: 'attention', detail: 'Memory did not answer.' } }, { attention: 1, ok: 7, optional: 0 })))
    expect(await screen.findByRole('heading', { level: 2, name: '1 check needs attention' })).not.toBeNull()
    const row = screen.getByText('Label for memory').closest('li')!
    expect(within(row).getByText('Memory did not answer.')).not.toBeNull()
    expect(within(row).getByText('Needs attention')).not.toBeNull()
  })

  it('says several checks need attention in the plural', async () => {
    show(vi.fn().mockResolvedValue(report({ memory: { status: 'attention' }, store: { status: 'attention' } }, { attention: 2, ok: 6, optional: 0 })))
    expect(await screen.findByRole('heading', { level: 2, name: '2 checks need attention' })).not.toBeNull()
  })

  it('shows an optional check with its detail and an Optional badge', async () => {
    show(vi.fn().mockResolvedValue(report({ 'local-model': { status: 'optional', detail: 'No local model is set up.' } }, { attention: 0, ok: 7, optional: 1 })))
    const row = (await screen.findByText('Label for local-model')).closest('li')!
    expect(within(row).getByText('No local model is set up.')).not.toBeNull()
    expect(within(row).getByText('Optional')).not.toBeNull()
  })

  it('links a recovery to the page that fixes it, and gives its command to type', async () => {
    const recovery = { label: 'Open Settings', uiRoute: '/settings' as const, command: 'conker config' }
    show(vi.fn().mockResolvedValue(report({ 'hosted-model': { status: 'attention', recovery } }, { attention: 1, ok: 7, optional: 0 })))
    const row = (await screen.findByText('Label for hosted-model')).closest('li')!
    expect(within(row).getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/settings')
    expect(within(row).getByText('conker config').tagName).toBe('CODE')
  })

  it('does not link a recovery to this same page, and shows a recovery with only a command', async () => {
    const here = { label: 'Look here', uiRoute: '/system' as const, command: null }
    const typed = { label: 'Type it', uiRoute: null, command: 'conker doctor' }
    show(vi.fn().mockResolvedValue(report({ runtime: { status: 'attention', recovery: here }, store: { status: 'attention', recovery: typed } }, { attention: 2, ok: 6, optional: 0 })))
    await screen.findByText('Label for runtime')
    expect(screen.queryByRole('link', { name: 'Look here' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Type it' })).toBeNull()
    expect(screen.getByText('conker doctor')).not.toBeNull()
  })

  it('says when the report was made and what it does not cover', async () => {
    show(vi.fn().mockResolvedValue(report()))
    const note = (await screen.findByText(/^Checked /)).textContent!
    expect(note).toContain(new Date('2026-11-23T10:00:00.000Z').toLocaleString())
    expect(note).toContain('These checks cover core connections, not every tool, schedule or host capability.')
    expect(note).toContain('credentials and service responses are never included')
  })

  it('shows a failure as an alert that says nothing was attempted, with a way to try again', async () => {
    const diagnostics = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(report())
    show(diagnostics)
    expect((await screen.findByRole('alert')).textContent).toBe('Conker could not produce a diagnostic report. No recovery action was attempted.')
    expect(screen.queryByText('Core checks passed')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Core checks passed')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(diagnostics).toHaveBeenCalledTimes(2)
  })

  it('reads again from the refresh button and shows the new report', async () => {
    const diagnostics = vi
      .fn()
      .mockResolvedValueOnce(report())
      .mockResolvedValueOnce(report({ memory: { status: 'attention', detail: 'Now it is down.' } }, { attention: 1, ok: 7, optional: 0 }))
    show(diagnostics)
    await screen.findByText('Core checks passed')
    fireEvent.click(refresh())
    expect(await screen.findByText('Now it is down.')).not.toBeNull()
    expect(diagnostics).toHaveBeenCalledTimes(2)
  })

  it('ignores a report that arrives after the page was left', async () => {
    let resolve: (value: GatewayDiagnostics) => void = () => undefined
    const diagnostics = vi.fn().mockReturnValue(new Promise<GatewayDiagnostics>(done => (resolve = done)))
    const client = { diagnostics, hostOps: { receipts: () => new Promise(() => undefined) } } as unknown as GatewayControlClient
    const view = render(
      <MemoryRouter>
        <GatewaySystemStatus client={client} />
      </MemoryRouter>,
    )
    expect((diagnostics.mock.calls[0][0] as AbortSignal).aborted).toBe(false)
    view.unmount()
    expect((diagnostics.mock.calls[0][0] as AbortSignal).aborted).toBe(true)
    await act(async () => resolve(report()))
    expect(screen.queryByText('Core checks passed')).toBeNull()
  })

  it('ignores a failure that arrives after the page was left', async () => {
    let reject: (reason: unknown) => void = () => undefined
    const diagnostics = vi.fn().mockReturnValue(new Promise<GatewayDiagnostics>((_, no) => (reject = no)))
    const client = { diagnostics, hostOps: { receipts: () => new Promise(() => undefined) } } as unknown as GatewayControlClient
    const view = render(
      <MemoryRouter>
        <GatewaySystemStatus client={client} />
      </MemoryRouter>,
    )
    view.unmount()
    await act(async () => reject(new Error('late')))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the recent server actions section under the checks', async () => {
    show(vi.fn().mockResolvedValue(report()))
    await screen.findByText('Core checks passed')
    expect(screen.getByRole('heading', { level: 2, name: 'Recent server actions' })).not.toBeNull()
    expect(screen.getByRole('status', { name: 'Reading recent server actions' })).not.toBeNull()
  })
})
