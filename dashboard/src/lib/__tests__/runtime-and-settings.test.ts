import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkableTurn,
  canReleaseTaskConflict,
  canSubmitRuntime,
  checkedAttempt,
  createGatewayRuntimeWorkspaceState,
  createRequestOptions,
  hasActiveRuntimeTurn,
  recoverSubmissionDraft,
  resolveAttempt,
  retainedRequestOptions,
  type UncertainTurn,
} from '@/components/gateway/runtime-state'
import { prepareTaskDispatch, readTaskDispatchSources, taskDispatchProblem, visibleTaskDispatchIntent } from '@/components/gateway/task-dispatch-state'
import { createGatewaySourcePrivacyState, maskForgottenConversation, maskForgottenSession } from '@/components/gateway/source-privacy'
import { memoryCheckDelays, watchMemoryDelivery, type MemoryDeliveryWatchState } from '@/components/gateway/memory-delivery-watch'
import { readRuntimeWithDeadline } from '@/components/gateway/runtime-read-deadline'

afterEach(() => vi.unstubAllGlobals())

describe('runtime request options', () => {
  it('sends no model for Automatic and drops options that are off', () => {
    expect(createRequestOptions()).toEqual({ skillIds: [] })
    expect(createRequestOptions('', ['a'], false, 0, 'off')).toEqual({ skillIds: ['a'] })
    expect(createRequestOptions('m1', ['a'], true, 3, 'web')).toEqual({ modelId: 'm1', skillIds: ['a'], think: true, draftRevision: 3, researchMode: 'web' })
    expect(createRequestOptions(null, undefined, false, null)).toEqual({ skillIds: [] })
  })

  it('does not share the skill list with the caller', () => {
    const skills = ['a']
    const options = createRequestOptions('m', skills)
    skills.push('b')
    expect(options.skillIds).toEqual(['a'])
  })

  it('replays the options frozen at the original send', () => {
    const frozen: UncertainTurn = { text: 't', checked: false, requestOptions: { modelId: 'm', skillIds: ['s'], think: true, draftRevision: 2, researchMode: 'deep' } }
    expect(retainedRequestOptions(frozen)).toEqual({ modelId: 'm', skillIds: ['s'], think: true, draftRevision: 2, researchMode: 'deep' })
    const fromSubmission = { text: 't', checked: false, submission: { modelId: 'x', skillIds: [], think: false, draftRevision: 1, researchMode: 'web' } } as unknown as UncertainTurn
    expect(retainedRequestOptions(fromSubmission)).toEqual({ modelId: 'x', skillIds: [], draftRevision: 1, researchMode: 'web' })
    expect(retainedRequestOptions({ text: 't', checked: false })).toEqual({ skillIds: [] })
  })

  it('knows which outcomes can be checked', () => {
    expect(checkableTurn('outcome_unknown')).toBe(true)
    expect(checkableTurn('action_in_progress')).toBe(true)
    expect(checkableTurn('completed')).toBe(false)
  })
})

describe('runtime workspace state', () => {
  it('resets everything and bumps the epoch', () => {
    const store = createGatewayRuntimeWorkspaceState()
    store.setState({ selected: 's1', drafts: { s1: 'hi' }, title: 'T', operation: 'send', createUnknown: 'checked' })
    expect(store.getState().epoch).toBe(0)
    store.getState().reset()
    expect(store.getState()).toMatchObject({ epoch: 1, selected: null, drafts: {}, title: '', operation: null, createUnknown: null, uncertain: {}, taskIntent: null, turnCheck: null })
    store.getState().reset()
    expect(store.getState().epoch).toBe(2)
  })
})

describe('uncertain turns', () => {
  const attempt: UncertainTurn = { text: 'hello', checked: false }

  it('marks an attempt as checked without changing it otherwise', () => {
    expect(checkedAttempt(attempt)).toEqual({ text: 'hello', checked: true })
    expect(attempt.checked).toBe(false)
  })

  it('makes the owner check the chat before choosing', () => {
    expect(() => resolveAttempt(attempt, 'hello', 'found')).toThrow('Check the chat first, then choose what to do.')
    const checked = checkedAttempt(attempt)
    expect(resolveAttempt(checked, 'hello', 'found')).toEqual({ draft: '' })
    expect(resolveAttempt(checked, 'hello', 'allow-new')).toEqual({ draft: 'hello' })
    expect(resolveAttempt(checked, 'edited', 'found')).toEqual({ draft: 'edited' })
  })

  it('brings back the unsent text only when nothing else holds it', () => {
    const submission = { contentStatus: 'available', pendingText: 'lost words' }
    const withSubmission = (extra: object = {}) => ({ ...attempt, submission: { ...submission, ...extra } }) as unknown as UncertainTurn
    expect(recoverSubmissionDraft(withSubmission(), '')).toBe('lost words')
    expect(recoverSubmissionDraft(withSubmission(), 'typed')).toBe('typed')
    expect(recoverSubmissionDraft(withSubmission({ taskId: 't1' }), '')).toBe('')
    expect(recoverSubmissionDraft(withSubmission({ contentStatus: 'forgotten' }), '')).toBe('')
    expect(recoverSubmissionDraft(withSubmission({ pendingText: '' }), '')).toBe('')
    expect(recoverSubmissionDraft(attempt, '')).toBe('')
  })

  it('releases a task conflict only with the full proof', () => {
    const proof: UncertainTurn = { text: 't', checked: true, taskBinding: { taskId: 't', taskExpectedRevision: 1 }, rejectionStatus: 409, notFound: true }
    expect(canReleaseTaskConflict(proof)).toBe(true)
    expect(canReleaseTaskConflict({ ...proof, taskBinding: undefined })).toBe(false)
    expect(canReleaseTaskConflict({ ...proof, rejectionStatus: undefined })).toBe(false)
    expect(canReleaseTaskConflict({ ...proof, notFound: false })).toBe(false)
    expect(canReleaseTaskConflict({ ...proof, checked: false })).toBe(false)
    expect(canReleaseTaskConflict({ ...proof, submission: {} as never })).toBe(false)
  })
})

const detail = (extra: Record<string, unknown> = {}) => ({ id: 's1', status: 'open', title: 'Chat', summary: 'sum', turns: [], messages: [], thinking: [{ x: 1 }], pendingSubmissions: [], ...extra }) as never
const turn = (extra: Record<string, unknown> = {}) => ({ status: 'completed', endedAt: 5, acted: false, detail: { x: 1 }, ...extra })

describe('active runtime turn', () => {
  it('sees an unfinished or parked turn, and a submission still preparing', () => {
    expect(hasActiveRuntimeTurn(detail())).toBe(false)
    expect(hasActiveRuntimeTurn(detail({ turns: [turn()] }))).toBe(false)
    expect(hasActiveRuntimeTurn(detail({ turns: [turn({ endedAt: null })] }))).toBe(true)
    for (const status of ['awaiting_approval', 'awaiting_budget', 'acted_no_reply', 'action_in_progress', 'outcome_unknown']) expect(hasActiveRuntimeTurn(detail({ turns: [turn({ status })] }))).toBe(true)
    expect(hasActiveRuntimeTurn(detail({ turns: [turn({ status: 'interrupted', acted: true })] }))).toBe(true)
    expect(hasActiveRuntimeTurn(detail({ turns: [turn({ status: 'interrupted', acted: false })] }))).toBe(false)
    expect(hasActiveRuntimeTurn(detail({ pendingSubmissions: [{ state: 'preparing' }] }))).toBe(true)
    expect(hasActiveRuntimeTurn(detail({ pendingSubmissions: [{ state: 'failed' }] }))).toBe(false)
    expect(hasActiveRuntimeTurn(detail({ pendingSubmissions: undefined }))).toBe(false)
  })

  it('lets the owner send only when nothing else is in the way', () => {
    expect(canSubmitRuntime('hi', false, undefined, detail())).toBe(true)
    expect(canSubmitRuntime('hi', false, undefined, null)).toBe(false)
    expect(canSubmitRuntime('hi', false, undefined, detail({ status: 'closed' }))).toBe(false)
    expect(canSubmitRuntime('   ', false, undefined, detail())).toBe(false)
    expect(canSubmitRuntime('x'.repeat(16001), false, undefined, detail())).toBe(false)
    expect(canSubmitRuntime('x'.repeat(16000), false, undefined, detail())).toBe(true)
    expect(canSubmitRuntime('hi', true, undefined, detail())).toBe(false)
    expect(canSubmitRuntime('hi', false, { text: 'x', checked: false }, detail())).toBe(false)
    expect(canSubmitRuntime('hi', false, undefined, detail({ turns: [turn({ endedAt: null })] }))).toBe(false)
  })
})

describe('task dispatch', () => {
  const task = (extra: Record<string, unknown> = {}) =>
    ({ id: 'task_1', sessionId: 's1', revision: 3, outcome: 'Ship it', criteria: [{ text: 'Tests pass' }, { text: 'Docs updated' }], status: 'in_progress', contentStatus: 'available', archivedAt: null, runIds: [], ...extra }) as never

  it('hides input for a forgotten conversation', () => {
    const intent = { taskId: 't', sessionId: 's1', open: true }
    expect(visibleTaskDispatchIntent(null, ['s1'])).toBeNull()
    expect(visibleTaskDispatchIntent(intent, [])).toBe(intent)
    expect(visibleTaskDispatchIntent(intent, ['s1'])).toBeNull()
    const prepared = { ...intent, prepared: { sessionId: 's2' } } as never
    expect(visibleTaskDispatchIntent(prepared, ['s2'])).toBeNull()
    expect(visibleTaskDispatchIntent(prepared, ['s3'])).toBe(prepared)
  })

  it('names the first thing that stops a task being sent', () => {
    expect(taskDispatchProblem(task(), detail())).toBeNull()
    const forgotten = 'This task’s source was forgotten. Its input cannot be sent.'
    expect(taskDispatchProblem(task({ contentStatus: 'forgotten' }), detail())).toBe(forgotten)
    expect(taskDispatchProblem(task(), detail({ status: 'forgotten' }))).toBe(forgotten)
    expect(taskDispatchProblem(task({ sessionId: 'other' }), detail())).toBe('The task and conversation do not match. Reload the saved task.')
    expect(taskDispatchProblem(task(), detail(), 2)).toBe('This task changed after your review. Reload the task and review its current objective before sending.')
    expect(taskDispatchProblem(task(), detail(), 3)).toBeNull()
    const restore = 'Restore and reopen task tracking before requesting more work.'
    expect(taskDispatchProblem(task({ archivedAt: 'x' }), detail())).toBe(restore)
    expect(taskDispatchProblem(task({ status: 'completed' }), detail())).toBe(restore)
    expect(taskDispatchProblem(task({ status: 'cancelled' }), detail())).toBe(restore)
    expect(taskDispatchProblem(task(), detail({ status: 'closed' }))).toBe('This task’s conversation is closed. Create a task in an open conversation to continue.')
    expect(taskDispatchProblem(task({ runIds: new Array(100).fill('r') }), detail())).toBe('This task already links 100 runs. Create a follow-up task before requesting more work.')
    expect(taskDispatchProblem(task(), detail({ turns: [turn({ endedAt: null })] }))).toBe('This conversation has unresolved work. Review its saved turn before starting another request.')
  })

  it('writes the request from the saved task', () => {
    const prepared = prepareTaskDispatch(task(), detail(), 'req-1')
    expect(prepared).toMatchObject({ taskId: 'task_1', taskExpectedRevision: 3, sessionId: 's1', requestId: 'req-1', outcome: 'Ship it', criteria: ['Tests pass', 'Docs updated'] })
    expect(prepared.text).toBe(
      'Work on this saved task (task_1, revision 3).\n\nDesired outcome:\nShip it\n\nCompletion criteria:\n1. Tests pass\n2. Docs updated\n\nReport what you completed, supporting evidence, and anything still unresolved. Task tracking remains owner-reviewed.',
    )
  })

  it('refuses a task that cannot be sent or is too long', () => {
    expect(() => prepareTaskDispatch(task({ archivedAt: 'x' }), detail(), 'r')).toThrow('Restore and reopen task tracking before requesting more work.')
    expect(() => prepareTaskDispatch(task({ outcome: 'x'.repeat(16000) }), detail(), 'r')).toThrow('The task input exceeds the conversation limit. Shorten the saved objective or criteria first.')
  })

  it('reads the task and conversation, reporting a forgotten source before any later read', async () => {
    const signal = new AbortController().signal
    const forgotten: string[] = []
    const ok = await readTaskDispatchSources('task_1', { getTask: async () => task() } as never, { getSession: async () => detail() } as never, id => forgotten.push(id), signal)
    expect(ok.session.id).toBe('s1')
    await expect(
      readTaskDispatchSources(
        'task_1',
        { getTask: async () => task({ contentStatus: 'forgotten' }) } as never,
        {
          getSession: async () => {
            throw new Error('not reached')
          },
        } as never,
        id => forgotten.push(id),
        signal,
      ),
    ).rejects.toThrow('This task’s source was forgotten. Its input cannot be sent.')
    await expect(readTaskDispatchSources('task_1', { getTask: async () => task() } as never, { getSession: async () => detail({ id: 's9', status: 'forgotten' }) } as never, id => forgotten.push(id), signal)).rejects.toThrow(
      'This task’s source was forgotten. Its input cannot be sent.',
    )
    expect(forgotten).toEqual(['s1', 's9'])
  })
})

describe('source privacy', () => {
  it('remembers forgotten chats once and only notifies on change', () => {
    const store = createGatewaySourcePrivacyState()
    let changes = 0
    store.subscribe(() => changes++)
    store.getState().markForgotten(['a', 'b'])
    store.getState().markForgotten(['b', 'a'])
    store.getState().markForgotten(['c', 'a'])
    expect(store.getState().sessionIds).toEqual(['a', 'b', 'c'])
    expect(changes).toBe(2)
    store.getState().reset()
    expect(store.getState().sessionIds).toEqual([])
  })

  it('masks a forgotten conversation down to nothing readable', () => {
    const original = detail({ turns: [turn()], messages: [{ id: 'm', memoryDelivery: { state: 'x' }, content: { kind: 'text', text: 'secret' } }] }) as never as { turns: unknown[]; messages: unknown[] }
    const masked = maskForgottenConversation(original as never)
    expect(masked).toMatchObject({ status: 'forgotten', title: '', summary: null, thinking: [] })
    expect(masked.messages).toEqual([{ id: 'm', memoryDelivery: undefined, content: { kind: 'unavailable', reason: 'forgotten' } }])
    expect(masked.turns[0]).toMatchObject({ detail: null, status: 'completed' })
    expect(maskForgottenSession({ id: 's', status: 'open', title: 'T', summary: 'S' } as never)).toEqual({ id: 's', status: 'forgotten', title: '', summary: null })
    expect((original.messages[0] as { content: { text: string } }).content.text).toBe('secret')
  })
})

describe('memory delivery watch', () => {
  const settle = () => new Promise<void>(resolve => setImmediate(resolve))
  const pending = (id: string) => ({ messageId: id, delivery: { state: 'pending' } })
  const delivered = (id: string) => ({ messageId: id, delivery: { state: 'delivered' } })

  function setup(reads: (() => Promise<unknown>)[], options: { available?: () => boolean } = {}) {
    const published: MemoryDeliveryWatchState[] = []
    const timers: { run: () => void; delay: number; cleared: boolean }[] = []
    let forgotten = 0
    const readCalls: (string | undefined)[] = []
    const signals: AbortSignal[] = []
    let next = 0
    const watcher = watchMemoryDelivery({
      read: async (signal, messageId) => {
        readCalls.push(messageId)
        signals.push(signal)
        return (await reads[Math.min(next++, reads.length - 1)]()) as never
      },
      available: options.available ?? (() => true),
      publish: state => published.push(state),
      forgotten: () => forgotten++,
      schedule: (run, delay) => timers.push({ run, delay, cleared: false }) - 1,
      unschedule: timer => void (timers[timer as number].cleared = true),
    })
    const fire = async () => {
      const timer = timers.find(item => !item.cleared && item.run)!
      timer.cleared = true
      timer.run()
      await settle()
    }
    return { watcher, published, timers, readCalls, signals, fire, forgotten: () => forgotten }
  }

  it('waits for the first timer before reading anything', () => {
    const { published, timers, readCalls } = setup([async () => ({ forgotten: false, truncated: false, results: [] })])
    expect(timers.map(timer => timer.delay)).toEqual([0])
    expect(readCalls).toEqual([])
    expect(published).toEqual([])
  })

  it('publishes ready once nothing is pending', async () => {
    const { published, fire } = setup([async () => ({ forgotten: false, truncated: true, results: [delivered('m1')] })])
    await fire()
    expect(published.map(state => state.phase)).toEqual(['checking', 'ready'])
    expect(published.at(-1)).toEqual({ phase: 'ready', receipts: { m1: { state: 'delivered' } }, truncated: true })
  })

  it('checks again on a growing schedule, then pauses while still pending', async () => {
    const { published, timers, fire, readCalls } = setup([async () => ({ forgotten: false, truncated: false, results: [pending('m1')] })])
    for (let index = 0; index < memoryCheckDelays.length; index++) await fire()
    expect(readCalls).toHaveLength(memoryCheckDelays.length)
    expect(timers.map(timer => timer.delay)).toEqual([...memoryCheckDelays])
    expect(published.at(-1)?.phase).toBe('paused')
    expect(timers.filter(timer => !timer.cleared)).toEqual([])
  })

  it('stops and says so when the source was forgotten', async () => {
    const { published, fire, forgotten, timers } = setup([async () => ({ forgotten: true, truncated: false, results: [] })])
    await fire()
    expect(forgotten()).toBe(1)
    expect(published.map(state => state.phase)).toEqual(['checking'])
    expect(timers.filter(timer => !timer.cleared)).toEqual([])
  })

  it('publishes an error when the read fails', async () => {
    const { published, fire } = setup([
      async () => {
        throw new Error('down')
      },
    ])
    await fire()
    expect(published.map(state => state.phase)).toEqual(['checking', 'error'])
  })

  it('does nothing once cancelled, and drops a read that comes back late', async () => {
    let release: (value: unknown) => void = () => undefined
    const { watcher, published, fire, signals } = setup([() => new Promise(resolve => (release = resolve))])
    await fire()
    expect(published.map(state => state.phase)).toEqual(['checking'])
    watcher.cancel()
    expect(signals[0].aborted).toBe(true)
    release({ forgotten: false, truncated: false, results: [pending('m1')] })
    await settle()
    expect(published.map(state => state.phase)).toEqual(['checking'])
    watcher.refresh()
    expect(published).toHaveLength(1)
  })

  it('does not start a second check while one is reading', async () => {
    let release: (value: unknown) => void = () => undefined
    const { watcher, fire, timers, readCalls } = setup([() => new Promise(resolve => (release = resolve))])
    await fire()
    watcher.refresh()
    expect(timers).toHaveLength(1)
    release({ forgotten: false, truncated: false, results: [] })
    await settle()
    expect(readCalls).toHaveLength(1)
  })

  it('refreshes one message, dropping its receipt when it has none and keeping the truncation flag', async () => {
    const { watcher, published, fire, readCalls } = setup([
      async () => ({ forgotten: false, truncated: true, results: [delivered('m1'), delivered('m2')] }),
      async () => ({ forgotten: false, truncated: false, results: [] }),
      async () => ({ forgotten: false, truncated: false, results: [pending('m2')] }),
    ])
    await fire()
    watcher.refresh('m1')
    await fire()
    expect(readCalls).toEqual([undefined, 'm1'])
    expect(published.at(-1)).toEqual({ phase: 'ready', receipts: { m2: { state: 'delivered' } }, truncated: true })
    watcher.refresh('m2')
    await fire()
    expect(published.at(-1)?.phase).toBe('ready')
    expect(published.at(-1)?.receipts.m2).toEqual({ state: 'pending' })
  })

  it('stays quiet when the source is not available', async () => {
    const closed = setup([async () => ({ forgotten: false, truncated: false, results: [] })], { available: () => false })
    expect(closed.timers).toHaveLength(0)
    let on = true
    const later = setup([async () => ({ forgotten: false, truncated: false, results: [] })], { available: () => on })
    on = false
    await later.fire()
    expect(later.published).toEqual([])
    expect(later.readCalls).toEqual([])
  })

  it('uses the real timers by default', async () => {
    vi.useFakeTimers()
    try {
      const published: string[] = []
      const watcher = watchMemoryDelivery({ read: async () => ({ forgotten: false, truncated: false, results: [] }) as never, available: () => true, publish: state => published.push(state.phase), forgotten: () => undefined })
      await vi.advanceTimersByTimeAsync(0)
      expect(published).toEqual(['checking', 'ready'])
      watcher.refresh()
      watcher.cancel()
      await vi.advanceTimersByTimeAsync(10)
      expect(published).toEqual(['checking', 'ready'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('read deadline', () => {
  it('resolves with the value and clears the timer', async () => {
    const cleared: unknown[] = []
    const request = new AbortController()
    const value = await readRuntimeWithDeadline(async () => 42, request, { schedule: () => 7, unschedule: timer => cleared.push(timer) })
    expect(value).toBe(42)
    expect(cleared).toEqual([7])
  })

  it('rejects with the read’s own error', async () => {
    await expect(
      readRuntimeWithDeadline(
        async () => {
          throw new Error('boom')
        },
        new AbortController(),
        { schedule: () => 1, unschedule: () => undefined },
      ),
    ).rejects.toThrow('boom')
    await expect(
      readRuntimeWithDeadline(
        () => {
          throw new Error('sync')
        },
        new AbortController(),
        { schedule: () => 1, unschedule: () => undefined },
      ),
    ).rejects.toThrow('sync')
  })

  it('aborts and settles when the deadline passes, even if the read ignores the signal', async () => {
    let deadline: () => void = () => undefined
    const request = new AbortController()
    const pendingRead = readRuntimeWithDeadline(() => new Promise<never>(() => undefined), request, {
      schedule: run => {
        deadline = run
        return 1
      },
      unschedule: () => undefined,
      timeout: 5,
    })
    deadline()
    await expect(pendingRead).rejects.toThrow('History read interrupted or timed out')
    expect(request.signal.aborted).toBe(true)
  })

  it('refuses to start when already aborted, and ignores a late reply after settling', async () => {
    const aborted = new AbortController()
    aborted.abort()
    let called = false
    await expect(
      readRuntimeWithDeadline(async () => {
        called = true
      }, aborted),
    ).rejects.toThrow('History read interrupted or timed out')
    expect(called).toBe(false)
    let reply: (value: string) => void = () => undefined
    const request = new AbortController()
    const settled = readRuntimeWithDeadline(() => new Promise<string>(resolve => (reply = resolve)), request, { schedule: () => 1, unschedule: () => undefined })
    request.abort()
    await expect(settled).rejects.toThrow('History read interrupted or timed out')
    reply('late')
  })

  it('uses real timers when none are supplied', async () => {
    vi.useFakeTimers()
    try {
      const request = new AbortController()
      const read = readRuntimeWithDeadline(() => new Promise<never>(() => undefined), request, { timeout: 50 })
      const outcome = expect(read).rejects.toThrow('History read interrupted or timed out')
      await vi.advanceTimersByTimeAsync(50)
      await outcome
      expect(await readRuntimeWithDeadline(async () => 'fast', new AbortController())).toBe('fast')
    } finally {
      vi.useRealTimers()
    }
  })
})
