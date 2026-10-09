import { createStore } from 'zustand/vanilla'
import { draftBody, emptyDraft, type DraftValue, type SavedDraft, type GatewayDraftClient } from '@/lib/gateway/drafts'
import { GatewayError } from '@/lib/gateway/transport'

export type DraftStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'offline' | 'unknown' | 'conflict' | 'invalid' | 'unavailable'
export type DraftEntry = { value: DraftValue; base: SavedDraft | null; status: DraftStatus; conflict: SavedDraft | null; error: string | null; version: number; unknownSave: { value: DraftValue; revision: number } | null }
const entry = (): DraftEntry => ({ value: emptyDraft(), base: null, status: 'loading', conflict: null, error: null, version: 0, unknownSave: null })
export function sameDraft(a: DraftValue, b: DraftValue, key: string): boolean {
  return a.text === b.text && a.modelId === b.modelId && a.think === b.think && a.researchMode === b.researchMode && JSON.stringify(a.skillIds) === JSON.stringify(b.skillIds) && (key !== 'new' || a.title === b.title && a.agentId === b.agentId && a.privacy.memoryDisabled === b.privacy.memoryDisabled && a.privacy.harnessDisabled === b.privacy.harnessDisabled)
}
export function draftCanSend(value: DraftEntry | undefined): boolean { return !!value && ['saved', 'dirty', 'saving'].includes(value.status) }
export function draftNeedsUnload(value: DraftEntry): boolean { return !['saved', 'unavailable'].includes(value.status) && (value.version > 0 || value.status === 'unknown' || value.status === 'conflict') }

/** One in-memory editor per server scope; no composer content leaves through browser storage. */
export function createDraftController(client: GatewayDraftClient, permitted: () => boolean, delay = 750) {
  const store = createStore<{ entries: Record<string, DraftEntry> }>(() => ({ entries: {} }))
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const operations = new Map<string, Promise<void>>()
  const requests = new Map<string, AbortController>()
  const forgotten = new Set<string>()
  let generation = 0, active = true
  const current = (key: string) => store.getState().entries[key]
  const valid = (key: string, ticket: number) => generation === ticket && active && permitted() && !forgotten.has(key.split('/')[0])
  const update = (key: string, patch: Partial<DraftEntry>) => store.setState(state => ({ entries: { ...state.entries, [key]: { ...(state.entries[key] ?? entry()), ...patch } } }))
  const cancelTimer = (key: string) => { clearTimeout(timers.get(key)); timers.delete(key) }
  const schedule = (key: string) => {
    cancelTimer(key)
    if (!active || !permitted() || current(key)?.status !== 'dirty') return
    timers.set(key, setTimeout(() => { timers.delete(key); void save(key) }, delay))
  }
  const adopt = (key: string, saved: SavedDraft, previous: DraftEntry) => {
    if (previous.unknownSave && sameDraft(previous.unknownSave.value, saved, key)) {
      update(key, { base: saved, status: sameDraft(previous.value, saved, key) ? 'saved' : 'dirty', conflict: null, error: null, unknownSave: null })
    } else if (previous.status === 'saved' || previous.version === 0 || sameDraft(previous.value, saved, key)) {
      update(key, { value: saved, base: saved, status: 'saved', conflict: null, error: null, unknownSave: null })
    } else if (previous.base && previous.base.revision === saved.revision && sameDraft(previous.base, saved, key)) {
      update(key, { base: saved, status: 'dirty', conflict: null, error: null, unknownSave: null })
    } else if (!previous.base && saved.revision === 0 && sameDraft(saved, emptyDraft(), key)) {
      update(key, { base: saved, status: 'dirty', conflict: null, error: null, unknownSave: null })
    } else update(key, { status: 'conflict', conflict: saved, error: null, unknownSave: null })
  }
  async function read(key: string, signal: AbortSignal, ticket: number) {
    try {
      const saved = await client.load(key, signal)
      if (valid(key, ticket)) adopt(key, saved, current(key) ?? entry())
    } catch (error) {
      if (!valid(key, ticket)) return
      if (error instanceof GatewayError && error.status === 404) { unavailable(key); return }
      update(key, { status: current(key)?.status === 'unknown' ? 'unknown' : 'offline', error: 'Could not read the saved draft. Your edits stay in this tab until they can be saved.' })
    }
  }
  function run(key: string, action: (signal: AbortSignal, ticket: number) => Promise<void>): Promise<void> {
    const existing = operations.get(key)
    if (existing) return existing
    if (!valid(key, generation)) return Promise.resolve()
    if (!current(key)) update(key, {})
    const controller = new AbortController(), ticket = generation
    requests.set(key, controller)
    const operation = action(controller.signal, ticket).finally(() => {
      if (operations.get(key) === operation) { operations.delete(key); requests.delete(key); schedule(key) }
    })
    operations.set(key, operation)
    return operation
  }
  async function load(key: string) {
    cancelTimer(key)
    const pending = operations.get(key)
    if (pending) await pending
    return run(key, (signal, ticket) => read(key, signal, ticket))
  }
  async function save(key: string) {
    cancelTimer(key)
    return run(key, async (signal, ticket) => {
      const before = current(key)!
      if (before.status !== 'dirty' || !before.base) return
      try { draftBody(key, before.value, before.base.revision) }
      catch { update(key, { status: 'invalid', error: 'Draft not saved. Keep it within 16,000 characters and the 64 KB request limit.' }); return }
      update(key, { status: 'saving', error: null, unknownSave: { value: before.value, revision: before.base.revision } })
      try {
        const saved = await client.save(key, before.value, before.base.revision, signal)
        if (!valid(key, ticket)) return
        const latest = current(key)!
        update(key, { base: saved, status: sameDraft(latest.value, saved, key) ? 'saved' : 'dirty', conflict: null, error: null, unknownSave: null })
      } catch (error) {
        if (!valid(key, ticket)) return
        if (error instanceof GatewayError && error.status === 404) { unavailable(key); return }
        if (error instanceof GatewayError && (error.status === 413 || error.status === 422 || error.kind === 'validation' || error.kind === 'too-large')) {
          update(key, { status: 'invalid', unknownSave: null, error: 'Draft not saved. Check its length and selected options, then edit or retry.' }); return
        }
        const conflict = error instanceof GatewayError && error.status === 409
        update(key, { status: conflict ? 'conflict' : 'unknown', error: null })
        // A failed response is not evidence that the save failed. Read before another write.
        try {
          const saved = await client.load(key, signal)
          if (!valid(key, ticket)) return
          const latest = current(key)!
          if (sameDraft(saved, before.value, key)) update(key, { base: saved, status: sameDraft(latest.value, saved, key) ? 'saved' : 'dirty', conflict: null, error: null, unknownSave: null })
          else if (saved.revision === before.base.revision && sameDraft(saved, before.base, key)) update(key, { base: saved, status: 'offline', conflict: null, unknownSave: null, error: 'This draft is not saved yet. Check the connection, then retry.' })
          else update(key, { status: 'conflict', conflict: saved, error: null, unknownSave: null })
        } catch (failure) {
          if (!valid(key, ticket)) return
          if (failure instanceof GatewayError && failure.status === 404) unavailable(key)
          else update(key, { status: 'unknown', error: 'Save not confirmed. Check the saved draft before retrying; your edits remain in this tab.' })
        }
      }
    })
  }
  function edit(key: string, patch: Partial<DraftValue>) {
    if (!valid(key, generation)) return
    const before = current(key) ?? entry(), value = { ...before.value, ...patch }
    const status = before.status === 'conflict' ? 'conflict' : before.status === 'unknown' || before.status === 'offline' ? before.status : before.base ? sameDraft(value, before.base, key) ? 'saved' : 'dirty' : 'loading'
    update(key, { value, version: before.version + 1, status, error: status === 'dirty' || status === 'saved' ? null : before.error })
    schedule(key)
  }
  async function flush(key: string): Promise<SavedDraft> {
    cancelTimer(key)
    await operations.get(key)
    let value = current(key)
    if (!value?.base || value.status === 'offline' || value.status === 'unknown') await load(key)
    value = current(key)
    if (value?.status === 'dirty') await save(key)
    value = current(key)
    if (!active || !permitted() || !value?.base || value.status !== 'saved') throw new Error('Save or resolve the draft before sending. Nothing was sent.')
    return value.base
  }
  function unavailable(key: string) {
    cancelTimer(key); requests.get(key)?.abort(); forgotten.add(key.split('/')[0])
    update(key, { value: emptyDraft(), base: null, conflict: null, status: 'unavailable', version: 0, unknownSave: null, error: 'This draft is no longer available.' })
  }
  function forget(ids: string[]) {
    for (const id of ids) forgotten.add(id)
    for (const key of Object.keys(store.getState().entries)) if (ids.includes(key.split('/')[0])) unavailable(key)
  }
  function reset() {
    generation++
    for (const timer of timers.values()) clearTimeout(timer)
    for (const request of requests.values()) request.abort()
    timers.clear(); requests.clear(); operations.clear(); forgotten.clear()
    store.setState({ entries: {} })
  }
  function setActive(value: boolean) {
    if (active === value) return
    active = value
    if (!value) {
      generation++
      for (const timer of timers.values()) clearTimeout(timer)
      for (const request of requests.values()) request.abort()
      timers.clear(); requests.clear(); operations.clear()
      for (const [key, value] of Object.entries(store.getState().entries)) if (value.status === 'saving') update(key, { status: 'unknown' })
    }
  }
  async function choose(key: string, choice: 'saved' | 'mine', reviewed: { revision: number; version: number }) {
    const value = current(key)
    if (!value?.conflict || !valid(key, generation) || value.conflict.revision !== reviewed.revision || value.version !== reviewed.version) return false
    const saved = value.conflict
    update(key, { base: saved, value: choice === 'saved' ? saved : value.value, status: choice === 'saved' || sameDraft(value.value, saved, key) ? 'saved' : 'dirty', conflict: null, error: null, unknownSave: null })
    if (choice === 'mine') await save(key)
    return current(key)?.status === 'saved'
  }
  async function consumed(key: string, revision: number) {
    const value = current(key)
    if (!value || value.status === 'unavailable') return
    cancelTimer(key)
    if (value.base?.revision === revision) {
      const blank = { ...value.base, ...emptyDraft(), revision: revision + 1 }
      const unchanged = sameDraft(value.value, value.base, key)
      update(key, { base: blank, ...(unchanged ? { value: blank } : {}), status: unchanged ? 'saved' : 'dirty', conflict: null })
    }
    await load(key)
  }
  return { store, current, load, edit, flush, choose, consumed, forget, reset, setActive, async retry(key: string) { await load(key); if (current(key)?.status === 'dirty') await save(key) } }
}
export type DraftController = ReturnType<typeof createDraftController>
