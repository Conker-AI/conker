import { createStore } from 'zustand/vanilla'
import { GatewayError, gatewayError, type GatewayVerifiedOperation } from './transport'

export type GatewayOperationReview = { title: string; path: string; target: string; details: string[] }
/** Display only allowlisted operation metadata, never an arbitrary body, password or token. */
export function describeGatewayOperation(operation: GatewayVerifiedOperation): GatewayOperationReview {
  const { path, body } = operation
  const parts = path.split('/')
  let title = 'Confirm gateway operation', target = path
  const details: string[] = []
  const safeId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null
  if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(path)) { title = 'Save tool draft'; target = `Draft ${parts[4]}`; details.push('Saves the editor document only. Does not publish, execute or grant access.') }
  else if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}\/publish$/.test(path)) { title = 'Publish workflow version'; target = `Draft ${parts[4]}`; details.push('Creates an immutable version with pinned dependencies. Does not run it or grant agent access.'); details.push(body.authorization === 'auto' ? 'Scoped callers may run this version without per-run approval.' : 'Each run requires owner confirmation.') }
  else if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}\/access$/.test(path)) { title = body.enabled ? 'Allow workflow access' : 'Remove workflow access'; target = `Workflow ${parts[4]}`; details.push(body.enabled ? 'Grants this host’s configured caller access to this workflow and its pinned nested workflows. Existing per-run approval rules still apply.' : 'Removes this workflow’s root grant. Other independently granted workflows keep their access.'); details.push('Workflow grants apply to its published versions; publishing remains owner-controlled.') }
  else if (/^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}\/runs$/.test(path)) { title = body.approval_request_id ? 'Resume approved workflow' : 'Run published workflow'; target = `Workflow ${parts[4]}`; details.push(`Published version ${body.version}. May invoke its registered tools with the submitted arguments.`); details.push('Uses the recorded run identity; uncertain actions are not automatically repeated.') }
  else if (path === '/api/control/pi/models/configuration') { title = 'Save model configuration'; target = 'Models and decision roles'; details.push('Changes model eligibility, defaults and routing roles. Provider credentials stay on the server.') }
  else if (/^\/api\/control\/pi\/sessions\/[A-Za-z0-9_-]+\/settings$/.test(path)) { title = 'Save conversation privacy'; target = `Conversation ${parts[5]}`; details.push('Changes settings for future turns. Existing messages are not erased.') }
  else if (path === '/api/pi/sessions') { title = 'Create a conversation'; target = 'New conversation'; details.push('Creates one persisted conversation.') }
  else if (/^\/api\/pi\/sessions\/.+\/turns$/.test(path)) { title = 'Send a conversation turn'; target = `Conversation ${parts[4]}`; if (typeof body.text === 'string') details.push(`${[...body.text].length.toLocaleString()} characters from your submitted draft.`); details.push('The runtime may call its configured model and tools.') }
  else if (/^\/api\/pi\/sessions\/.+\/fork$/.test(path)) { title = 'Fork a conversation'; target = `Conversation ${parts[4]}` }
  else if (/^\/api\/pi\/turns\/.+\/resume$/.test(path)) { title = 'Resume a recorded turn'; target = `Turn ${parts[4]}`; details.push('Resumes the existing runtime operation.') }
  else if (path === '/api/pi/tasks') { title = 'Create task tracking'; target = safeId(body.session_id) ? `Conversation ${body.session_id}` : 'New task'; details.push('Records task metadata; does not start execution.') }
  else if (/^\/api\/pi\/tasks\/.+\/(update|transition|archive)$/.test(path)) {
    title = path.endsWith('/update') ? 'Update task metadata' : path.endsWith('/transition') ? 'Record task status' : body.archived === false ? 'Restore task tracking' : 'Archive task tracking'
    target = `Task ${parts[4]}`; details.push('Changes tracking only; does not start or stop a turn.')
  } else if (/^\/api\/owner\/requests\/.+\/decision$/.test(path)) { title = 'Submit an owner decision'; target = `Owner request ${parts[4]}`; details.push('Records the decision for this exact owner request.') }
  if (typeof body.expected_revision === 'number' && Number.isSafeInteger(body.expected_revision)) details.push(`Expected ${path.startsWith('/api/owner/editor-drafts/') ? 'draft' : path.startsWith('/api/control/') ? 'configuration' : 'task'} revision ${body.expected_revision}.`)
  if (typeof body.status === 'string' && /^[a-z_]{1,40}$/.test(body.status)) details.push(`${path.startsWith('/api/owner/') ? 'Owner decision' : 'Owner-reported status'}: ${body.status.replaceAll('_', ' ')}.`)
  if (Array.isArray(body.criteria)) details.push(`${body.criteria.length} completion criteria.`)
  if (Array.isArray(body.run_ids)) details.push(`${body.run_ids.length} existing run links.`)
  if (safeId(body.parent_task_id)) details.push(`Parent task: ${body.parent_task_id}.`)
  if (safeId(body.request_id)) details.push(`Request: ${body.request_id}.`)
  if (safeId(body.task_id)) details.push(`Linked task: ${body.task_id}.`)
  if (typeof body.task_expected_revision === 'number' && Number.isSafeInteger(body.task_expected_revision)) details.push(`Expected linked task revision ${body.task_expected_revision}.`)
  return { title, path, target, details }
}

export type GatewayVerificationState = { challenge: (GatewayOperationReview & { id: number }) | null; pending: boolean; error: GatewayError | null; submit: (password: string) => Promise<boolean>; cancel: () => void }
type Challenge = { id: number; review: GatewayOperationReview; verify: (password: string, signal: AbortSignal) => Promise<string>; controller: AbortController; resolve: (token: string) => void; reject: (error: GatewayError) => void; detach: () => void }
export type GatewayVerificationPrompt = { request: (review: GatewayOperationReview, verify: Challenge['verify'], signal?: AbortSignal) => Promise<string>; cancelAll: () => void }

export function createGatewayVerificationStore() {
  let nextId = 0
  let current: Challenge | null = null
  const queue: Challenge[] = []
  const store = createStore<GatewayVerificationState>(() => ({ challenge: null, pending: false, error: null,
    submit: async password => {
      const challenge = current
      if (!challenge || store.getState().pending) return false
      if (typeof password !== 'string' || [...password].length < 15 || [...password].length > 1024) { store.setState({ error: new GatewayError('validation') }); return false }
      store.setState({ pending: true, error: null })
      try {
        const token = await challenge.verify(password, challenge.controller.signal)
        if (current !== challenge || challenge.controller.signal.aborted) return false
        challenge.detach(); current = null; challenge.resolve(token); showNext()
        return true
      } catch (error) {
        if (current === challenge) store.setState({ pending: false, error: gatewayError(error) })
        return false
      }
    },
    cancel: () => { if (current) cancel(current) },
  }))
  function showNext() {
    current = queue.shift() ?? null
    store.setState({ challenge: current ? { ...current.review, details: [...current.review.details], id: current.id } : null, pending: false, error: null })
  }
  function cancel(challenge: Challenge) {
    challenge.controller.abort(); challenge.detach(); challenge.reject(new GatewayError('verification-cancelled'))
    if (current === challenge) { current = null; showNext() }
    else { const index = queue.indexOf(challenge); if (index >= 0) queue.splice(index, 1) }
  }
  const prompt: GatewayVerificationPrompt = {
    request(review, verify, signal) {
      if (signal?.aborted) return Promise.reject(new GatewayError('verification-cancelled'))
      return new Promise((resolve, reject) => {
        const challenge: Challenge = { id: ++nextId, review, verify, controller: new AbortController(), resolve, reject, detach: () => signal?.removeEventListener('abort', abort) }
        const abort = () => cancel(challenge)
        signal?.addEventListener('abort', abort, { once: true })
        queue.push(challenge); if (!current) showNext()
      })
    },
    cancelAll() {
      const pending = [...queue]; queue.length = 0
      if (current) pending.unshift(current)
      current = null
      for (const challenge of pending) { challenge.controller.abort(); challenge.detach(); challenge.reject(new GatewayError('verification-cancelled')) }
      store.setState({ challenge: null, pending: false, error: null })
    },
  }
  return Object.assign(store, prompt)
}
export type GatewayVerificationStore = ReturnType<typeof createGatewayVerificationStore>
