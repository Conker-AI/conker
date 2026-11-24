import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryUndo, type MemoryUndoState } from '../chat/memory-undo'
import { answerFormats, artifactFormats, createGatewayExportsClient, exportLabels, exportNames, exportRefusalMessage, saveDownload } from '../gateway/exports'
import { GatewayRefusal } from '../gateway/file-transfer'
import { memoryForgetFailure } from '../gateway/memory-forget-state'
import { createPromptTemplatesClient, toPromptTemplate, type PiTemplate } from '../gateway/prompt-templates'
import { GatewayError } from '../gateway/transport'

type Call = { path: string; init: Record<string, unknown> }
function fakeAuth(...answers: unknown[]) {
  const calls: Call[] = []
  const queue = [...answers]
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  return { calls, auth: { request } as never }
}
const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
const hex = (character: string, length = 32) => character.repeat(length)

describe('forget failure words', () => {
  it('words each coded refusal with fixed guidance, never the server text', () => {
    expect(memoryForgetFailure(new GatewayError('http', 409, undefined, 'work_active')).message).toContain('Wait for the current reply')
    expect(memoryForgetFailure(new GatewayError('http', 409, undefined, 'forget_pending')).message).toContain('recovery notice')
    expect(memoryForgetFailure(new GatewayError('http', 409, undefined, 'outcome_unknown')).message).toContain('not confirmed')
  })

  it('resets the reviewed request only when the memory changed or went away', () => {
    expect(memoryForgetFailure(new GatewayError('http', 409, undefined, 'revision_conflict'))).toMatchObject({ reset: true, privateUnavailable: false })
    expect(memoryForgetFailure(new GatewayError('http', 404, undefined, 'not_found'))).toMatchObject({ reset: true })
    expect(memoryForgetFailure(new GatewayError('http', 409, undefined, 'work_active')).reset).toBe(false)
  })

  it('says the outcome is unconfirmed after a network, abort, bad-answer or dependency failure', () => {
    for (const failure of ['network', 'aborted', 'invalid-response', 'dependency'] as const) {
      expect(memoryForgetFailure(new GatewayError(failure)).message).toBe('The forget outcome is not confirmed. Check the same request before starting another deletion.')
    }
    expect(memoryForgetFailure(new Error('boom')).message).toContain('not confirmed')
  })

  it('marks an expired, changed or denied session as private-unavailable and keeps its own message', () => {
    for (const failure of ['browser-expired', 'session-changed', 'upstream-denied'] as const) {
      const problem = memoryForgetFailure(new GatewayError(failure))
      expect(problem.privateUnavailable).toBe(true)
      expect(problem.message).toBe(new GatewayError(failure).message)
    }
    expect(memoryForgetFailure(new GatewayError('http', 500, undefined, 'work_active')).privateUnavailable).toBe(false)
  })
})

describe('memory undo', () => {
  const preview = { memoryId: 'mem_1', revision: 3, text: 'likes tea' }
  const request = { requestId: 'req_1', memoryId: 'mem_1', revision: 3 }

  function setup(overrides: { forgetPreview?: () => Promise<unknown>; forgetMemory?: () => Promise<unknown>; signal?: AbortSignal } = {}) {
    const published: [string, MemoryUndoState][] = []
    const refreshed: string[] = []
    const control = {
      forgetPreview: vi.fn(overrides.forgetPreview ?? (async () => preview)),
      forgetMemory: vi.fn(overrides.forgetMemory ?? (async () => ({}))),
    }
    const createRequest = vi.fn(() => request)
    const undo = createMemoryUndo({
      control: control as never,
      createRequest: createRequest as never,
      signal: overrides.signal,
      publish: (id, state) => published.push([id, state]),
      refresh: id => refreshed.push(id),
    })
    return { undo, control, createRequest, published, refreshed }
  }

  it('previews the current version, forgets exactly that version and refreshes the note', async () => {
    const { undo, control, createRequest, published, refreshed } = setup()
    await undo('msg_1', 'mem_1')
    expect(control.forgetPreview).toHaveBeenCalledWith('mem_1', undefined)
    expect(createRequest).toHaveBeenCalledWith(preview)
    expect(control.forgetMemory).toHaveBeenCalledWith(request, undefined)
    expect(published).toEqual([
      ['msg_1', { phase: 'working' }],
      ['msg_1', { phase: 'forgotten' }],
    ])
    expect(refreshed).toEqual(['msg_1'])
  })

  it('keeps the reviewed request after an uncertain answer so a retry repeats the same identity', async () => {
    let attempt = 0
    const { undo, control, createRequest, published, refreshed } = setup({
      forgetMemory: async () => {
        if (attempt++ === 0) throw new GatewayError('network')
        return {}
      },
    })
    await undo('msg_1', 'mem_1')
    expect(published.at(-1)).toEqual(['msg_1', { phase: 'failed', message: expect.stringContaining('not confirmed') }])
    expect(refreshed).toEqual(['msg_1'])
    await undo('msg_1', 'mem_1')
    expect(control.forgetPreview).toHaveBeenCalledTimes(1)
    expect(createRequest).toHaveBeenCalledTimes(1)
    expect(control.forgetMemory).toHaveBeenCalledTimes(2)
    expect(published.at(-1)).toEqual(['msg_1', { phase: 'forgotten' }])
  })

  it('drops the request when the memory changed, so the next try previews again', async () => {
    let attempt = 0
    const { undo, control } = setup({
      forgetMemory: async () => {
        if (attempt++ === 0) throw new GatewayError('http', 409, undefined, 'revision_conflict')
        return {}
      },
    })
    await undo('msg_1', 'mem_1')
    await undo('msg_1', 'mem_1')
    expect(control.forgetPreview).toHaveBeenCalledTimes(2)
  })

  it('says nothing and does not refresh when the session went private-unavailable', async () => {
    const { undo, published, refreshed } = setup({
      forgetPreview: async () => {
        throw new GatewayError('browser-expired')
      },
    })
    await undo('msg_1', 'mem_1')
    expect(published.at(-1)?.[1]).toMatchObject({ phase: 'failed' })
    expect(refreshed).toEqual([])
  })

  it('ignores a second press while the first is still running', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const { undo, control } = setup({
      forgetMemory: async () => {
        await gate
        return {}
      },
    })
    const first = undo('msg_1', 'mem_1')
    await undo('msg_1', 'mem_1')
    release()
    await first
    expect(control.forgetPreview).toHaveBeenCalledTimes(1)
  })

  it('goes quiet when the screen closes mid-way', async () => {
    const afterPreview = new AbortController()
    const a = setup({
      signal: afterPreview.signal,
      forgetPreview: async () => {
        afterPreview.abort()
        return preview
      },
    })
    await a.undo('msg_1', 'mem_1')
    expect(a.control.forgetMemory).not.toHaveBeenCalled()
    expect(a.published).toEqual([['msg_1', { phase: 'working' }]])

    const afterForget = new AbortController()
    const b = setup({
      signal: afterForget.signal,
      forgetMemory: async () => {
        afterForget.abort()
        return {}
      },
    })
    await b.undo('msg_1', 'mem_1')
    expect(b.published).toEqual([['msg_1', { phase: 'working' }]])
    expect(b.refreshed).toEqual([])

    const afterFailure = new AbortController()
    const c = setup({
      signal: afterFailure.signal,
      forgetPreview: async () => {
        afterFailure.abort()
        throw new GatewayError('network')
      },
    })
    await c.undo('msg_1', 'mem_1')
    expect(c.published).toEqual([['msg_1', { phase: 'working' }]])
  })
})

describe('export formats and words', () => {
  it('offers Excel only when the answer has a table', () => {
    expect(answerFormats(true)).toEqual(['docx', 'pdf', 'pptx', 'xlsx'])
    expect(answerFormats(false)).toEqual(['docx', 'pdf', 'pptx'])
  })

  it('offers each artifact kind what Pi can make from it', () => {
    const formats = (content: { kind: string }, hasTable = false) => artifactFormats(content as never, hasTable)
    expect(formats({ kind: 'table' })).toEqual(['docx', 'pdf', 'pptx', 'xlsx', 'csv'])
    expect(formats({ kind: 'markdown' }, true)).toEqual(['docx', 'pdf', 'pptx', 'xlsx'])
    expect(formats({ kind: 'markdown' })).toEqual(['docx', 'pdf', 'pptx'])
    expect(formats({ kind: 'code' })).toEqual(['docx', 'pdf', 'pptx'])
    for (const name of ['chart', 'diagram', 'media']) expect(formats({ kind: name })).toEqual(['json'])
    expect(formats({ kind: 'html' })).toEqual([])
  })

  it('names every format for menus and for progress lines', () => {
    expect(Object.keys(exportLabels).sort()).toEqual(['csv', 'docx', 'json', 'pdf', 'pptx', 'xlsx'])
    expect(exportLabels.pdf).toBe('PDF (.pdf)')
    expect(exportNames.pptx).toBe('slides')
  })

  it('words a coded refusal, and falls back to the gateway message', () => {
    expect(exportRefusalMessage(new GatewayRefusal('export_no_table', 400))).toBe('There is no table here to put in a spreadsheet. Choose Word or PDF.')
    expect(exportRefusalMessage(new GatewayRefusal('too_large', 413))).toBe('The file would be larger than 16 MB, too big to download.')
    expect(exportRefusalMessage(new GatewayRefusal('not_json', 400))).toBe(new GatewayError('http').message)
    expect(exportRefusalMessage(new GatewayError('network'))).toBe(new GatewayError('network').message)
    expect(exportRefusalMessage('boom')).toBe(new GatewayError('network').message)
  })
})

describe('saving a download', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('clicks a hidden link to the bytes and lets the address go a second later', () => {
    vi.useFakeTimers()
    const anchor = { href: '', download: '', rel: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const blob = new Blob(['x'])
    saveDownload({ blob, filename: 'answer.pdf' })
    expect(create).toHaveBeenCalledWith(blob)
    expect(anchor).toMatchObject({ href: 'blob:one', download: 'answer.pdf', rel: 'noopener' })
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:one')
    create.mockRestore()
    revoke.mockRestore()
  })
})

describe('export client', () => {
  const download = { blob: new Blob(['x']), filename: 'a.pdf' }
  const artifact = `artifact_${hex('a')}`
  const session = `ses_${hex('b', 16)}`
  const message = `msg_${hex('c', 16)}`

  it('downloads an artifact or an answer by its checked ids', async () => {
    const calls: unknown[][] = []
    const client = createGatewayExportsClient({
      download: async (...args: unknown[]) => {
        calls.push(args)
        return download
      },
    } as never)
    const signal = new AbortController().signal
    expect(await client.artifact(artifact, 'csv', signal)).toBe(download)
    expect(await client.answer(session, message, 'docx')).toBe(download)
    expect(calls).toEqual([
      [`/api/control/pi/artifacts/${artifact}/download`, { format: 'csv' }, signal],
      [`/api/control/pi/sessions/${session}/messages/${message}/download`, { format: 'docx' }, undefined],
    ])
  })

  it('refuses a malformed id before anything is requested', () => {
    const download = vi.fn()
    const client = createGatewayExportsClient({ download } as never)
    expect(() => client.artifact('artifact_1', 'pdf')).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.answer('ses_1', message, 'pdf')).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.answer(session, 'msg_1', 'pdf')).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(download).not.toHaveBeenCalled()
  })
})

describe('prompt templates client', () => {
  const field = { id: 'topic', label: 'Topic', type: 'shortText', required: true, multiple: false, example: null, help: null, options: null }
  const template = (id = `tpl_${hex('a')}`) => ({ id, name: 'Brief', description: 'A brief', fields: [field], starter: false, revision: 2, createdAt: 1, updatedAt: 2 })
  const draft = { name: 'Brief', description: 'A brief', fields: [field] } as never

  it('turns a Pi template into the composer form, leaving unset hints out', () => {
    expect(toPromptTemplate(template() as PiTemplate)).toEqual({ id: `tpl_${hex('a')}`, name: 'Brief', description: 'A brief', fields: [{ id: 'topic', label: 'Topic', type: 'shortText', required: true, multiple: false }] })
    const full = { ...template(), fields: [{ ...field, example: 'Tea', help: 'One word', options: ['a', 'b'] }] } as PiTemplate
    expect(toPromptTemplate(full).fields[0]).toMatchObject({ example: 'Tea', help: 'One word', options: ['a', 'b'] })
  })

  it('lists and reads templates through Pi, starters and own ones', async () => {
    const starter = template('starter-weekly-plan')
    const { auth, calls } = fakeAuth({ items: [starter], total: 1 }, { template: starter })
    const client = createPromptTemplatesClient(auth)
    expect((await client.list()).total).toBe(1)
    expect((await client.get('starter-weekly-plan')).id).toBe('starter-weekly-plan')
    expect(calls.map(call => call.path)).toEqual(['/api/control/pi/prompts/templates', '/api/control/pi/prompts/templates/starter-weekly-plan'])
  })

  it('refuses an id that is not a template id before any call', async () => {
    const { auth, calls } = fakeAuth({})
    const client = createPromptTemplatesClient(auth)
    await kind(client.get('../x'), 'validation')
    await kind(client.update('nope', draft, 1), 'validation')
    await kind(client.remove('nope', 1), 'validation')
    expect(calls).toEqual([])
  })

  it('creates, updates and removes, carrying the revision it saw', async () => {
    const id = `tpl_${hex('a')}`
    const { auth, calls } = fakeAuth({ template: template() }, { template: template() }, { id, deleted: true })
    const client = createPromptTemplatesClient(auth)
    expect((await client.create(draft)).id).toBe(id)
    expect((await client.update(id, draft, 2)).revision).toBe(2)
    expect(await client.remove(id, 2)).toEqual({ id, deleted: true })
    expect(calls).toEqual([
      { path: '/api/control/pi/prompts/templates', init: { method: 'POST', body: draft } },
      { path: `/api/control/pi/prompts/templates/${id}`, init: { method: 'POST', body: { ...(draft as object), expected_revision: 2 } } },
      { path: `/api/control/pi/prompts/templates/${id}/delete`, init: { method: 'POST', body: { expected_revision: 2 } } },
    ])
  })

  it('refuses a malformed receipt, and a delete that names another id or deleted nothing', async () => {
    const id = `tpl_${hex('a')}`
    await kind(createPromptTemplatesClient(fakeAuth({ template: { ...template(), extra: 1 } }).auth).create(draft), 'invalid-response')
    await kind(createPromptTemplatesClient(fakeAuth({ id: `tpl_${hex('b')}`, deleted: true }).auth).remove(id, 1), 'invalid-response')
    await kind(createPromptTemplatesClient(fakeAuth({ id, deleted: false }).auth).remove(id, 1), 'invalid-response')
  })
})
