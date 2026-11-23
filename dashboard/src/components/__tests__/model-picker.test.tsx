import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GatewayModelPicker } from '@/components/gateway/model-picker'
import type { GatewayControlClient, OwnerModelSettings } from '@/lib/gateway/control'

afterEach(() => cleanup())

const row = (id: string, name: string) => ({ id, providerId: 'openai', name, route: id, enabled: true, routingDescription: '' })
const settings = (names: string[], revision = 1) => {
  const models = names.map((name, index) => row(`m${index + 1}`, name))
  const answer = { enabled: true, eligibleModelIds: models.map(model => model.id), modelId: models[0]?.id ?? null, timeoutMs: 1, failure: 'stop', fallbackModelIds: [], followAnswer: false }
  const configuration = { providers: [{ id: 'openai', name: 'OpenAI', enabled: true, endpoint: '', apiKeyDraft: '' }], models, defaultModelId: null, roleSettings: { answerMode: 'manual', roles: { answer } } }
  return { configuration, revision } as never as OwnerModelSettings
}

function show(models: GatewayControlClient['models']) {
  const onChange = vi.fn()
  render(<GatewayModelPicker client={{ models } as GatewayControlClient} value="" onChange={onChange} disabled={false} manualRequired={false} />)
  return onChange
}
const openMenu = async () => {
  const button = await screen.findByRole('button', { name: /^Answer model: Alpha/ })
  fireEvent.click(button)
  await screen.findByRole('menuitemradio', { name: /Alpha/ })
}
const rowNames = () => screen.queryAllByRole('menuitemradio').map(item => item.textContent)

describe('GatewayModelPicker', () => {
  it('keeps the open menu and its rows while the list is fetched again on window focus, and the number keys still pick', async () => {
    let finish: (value: OwnerModelSettings) => void = () => undefined
    const models = vi
      .fn()
      .mockResolvedValueOnce(settings(['Alpha', 'Beta']))
      .mockReturnValueOnce(new Promise<OwnerModelSettings>(done => (finish = done)))
    const onChange = show(models)
    await openMenu()
    expect(rowNames()).toEqual(['Alpha1', 'Beta2'])

    // The owner comes back to the tab: the list is read again, and the old one stays while it loads.
    act(() => void window.dispatchEvent(new Event('focus')))
    expect(models).toHaveBeenCalledTimes(2)
    expect(rowNames()).toEqual(['Alpha1', 'Beta2'])

    // The new list arrives with the menu still open: its rows replace the old ones in place.
    await act(async () => finish(settings(['Alpha', 'Beta', 'Gamma'], 2)))
    expect(rowNames()).toEqual(['Alpha1', 'Beta2', 'Gamma3'])
    const focused = document.activeElement
    expect(focused?.closest('[role=menu]')).not.toBeNull()

    fireEvent.keyDown(focused!, { key: '3' })
    expect(onChange).toHaveBeenCalledWith('m3')
  })

  it('keeps the last list when reading it again fails', async () => {
    const models = vi
      .fn()
      .mockResolvedValueOnce(settings(['Alpha']))
      .mockRejectedValueOnce(new Error('offline'))
    show(models)
    await openMenu()
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(models).toHaveBeenCalledTimes(2))
    expect(rowNames()).toEqual(['Alpha1'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says the list is loading until the first read, then names the default model', async () => {
    let finish: (value: OwnerModelSettings) => void = () => undefined
    show(vi.fn().mockReturnValue(new Promise<OwnerModelSettings>(done => (finish = done))))
    const button = screen.getByRole('button', { name: 'Answer model: Loading models…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await act(async () => finish(settings(['Alpha'])))
    expect((screen.getByRole('button', { name: 'Answer model: Alpha' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('announces a failed first read', async () => {
    show(vi.fn().mockRejectedValue(new Error('Pi is not answering.')))
    expect((await screen.findByRole('alert')).textContent).toBe('Model list unavailable. Pi is not answering.')
  })
})
