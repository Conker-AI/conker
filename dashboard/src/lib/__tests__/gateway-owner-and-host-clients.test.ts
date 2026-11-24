import { describe, expect, it } from 'vitest'
import { createAccessClient } from '../gateway/access'
import { createGatewayHostInventoryClient, createHostInventoryRequestId } from '../gateway/host-inventory'
import { createOwnerSettingsClient } from '../gateway/owner-settings'
import { createPasswordAlertsClient } from '../gateway/password-alerts'
import { createProviderControlClient, type ProviderCredentialOperation } from '../gateway/provider-control'
import { gatewaySessionDeadline, gatewaySessionUnlocked } from '../gateway/session-policy'
import { createTomorrowClient, tomorrowReason } from '../gateway/tomorrow'
import { createUpdatesClient } from '../gateway/updates'
import { WORKFLOW_ACCESS_SCOPE } from '../gateway/workflow-access'

type Call = { path: string; init: Record<string, unknown> }

/** A stand-in for the signed-in gateway session: records each request and answers with the next canned value. */
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

describe('session deadline', () => {
  const session = { authenticated: true, sessionId: 's', expiresAt: 5000, unlockExpiresAt: 3000, setupRequired: false }

  it('is the earlier of the session and the unlock expiry', () => {
    expect(gatewaySessionDeadline(session)).toBe(3000)
    expect(gatewaySessionDeadline({ ...session, unlockExpiresAt: 9000 })).toBe(5000)
  })

  it('is null without a usable session', () => {
    expect(gatewaySessionDeadline(null)).toBeNull()
    expect(gatewaySessionDeadline({ ...session, authenticated: false })).toBeNull()
    expect(gatewaySessionDeadline({ ...session, setupRequired: true })).toBeNull()
    expect(gatewaySessionDeadline({ ...session, unlockExpiresAt: null })).toBeNull()
    expect(gatewaySessionDeadline({ ...session, unlockExpiresAt: Number.NaN })).toBeNull()
    expect(gatewaySessionDeadline({ ...session, expiresAt: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('is unlocked only until the deadline passes', () => {
    expect(gatewaySessionUnlocked(session, 2999)).toBe(true)
    expect(gatewaySessionUnlocked(session, 3000)).toBe(false)
    expect(gatewaySessionUnlocked(null, 0)).toBe(false)
  })

  it('reads the clock when no time is given', () => {
    const soon = Date.now() / 1000 + 600
    expect(gatewaySessionUnlocked({ ...session, expiresAt: soon, unlockExpiresAt: soon })).toBe(true)
    expect(gatewaySessionUnlocked({ ...session, expiresAt: 1, unlockExpiresAt: 1 })).toBe(false)
  })
})

describe('workflow access words', () => {
  it('says access covers every published version and still leaves per-run approvals', () => {
    expect(WORKFLOW_ACCESS_SCOPE).toContain('all published versions')
    expect(WORKFLOW_ACCESS_SCOPE).toContain('per-run approval')
  })
})

describe('tomorrow', () => {
  const tomorrow = {
    schemaVersion: 1,
    since: 100,
    until: 200,
    hours: 24,
    timeZone: 'Europe/Berlin',
    runsPlanned: 1,
    jobs: [{ id: 'job_1', name: 'Morning', trigger: 'clock', createdBy: 'owner', nextAt: 150, runs: null, held: false }],
    approvals: [{ sessionId: 'ses_1', toolId: null, expiresAt: 190 }],
    runs: [{ at: 150, kind: 'clock', jobId: 'job_1', name: 'Morning', everyMinutes: null, wouldRun: false, reason: 'QUIET_HOURS' }],
  }

  it('words every reason Pi gives, and an unknown one as held back', () => {
    expect(tomorrowReason(null)).toBe('')
    expect(tomorrowReason('QUIET_HOURS')).toBe('Your quiet hours')
    expect(tomorrowReason('SCHEDULER_OFF')).toBe('The job scheduler is off')
    expect(tomorrowReason('SOMETHING_NEW')).toBe('Held back')
  })

  it('reads the next 24 hours through the control route and passes the signal on', async () => {
    const { auth, calls } = fakeAuth(tomorrow)
    const signal = new AbortController().signal
    expect(await createTomorrowClient(auth).read(signal)).toEqual(tomorrow)
    expect(calls).toEqual([{ path: '/api/control/pi/insights/tomorrow', init: { signal } }])
  })

  it('refuses a reply that is not what Pi sends', async () => {
    await kind(createTomorrowClient(fakeAuth({ ...tomorrow, extra: true }).auth).read(), 'invalid-response')
  })
})

describe('updates', () => {
  const offer = { version: '0.7.0', title: 'Seven', notes: 'Notes', url: 'https://github.com/Conker-AI/conker/releases/tag/v0.7.0', publishedAt: null, foundAt: 10 }
  const result = { id: hex('a'), version: '0.6.0', outcome: 'applied', title: 'Six', reason: null, finishedAt: 20 }

  it('lists the offer and the finished updates', async () => {
    const { auth, calls } = fakeAuth({ offer, results: [result] })
    expect(await createUpdatesClient(auth).list()).toEqual({ offer, results: [result] })
    expect(calls).toEqual([{ path: '/api/control/pi/updates', init: { signal: undefined } }])
    await kind(createUpdatesClient(fakeAuth({ offer: { ...offer, url: 'https://example.com/x' }, results: [] }).auth).list(), 'invalid-response')
  })

  it('skips an offered version and confirms Pi remembered that exact one', async () => {
    const { auth, calls } = fakeAuth({ version: '0.7.0', dismissed: true })
    await createUpdatesClient(auth).skip('0.7.0')
    expect(calls).toEqual([{ path: '/api/control/pi/updates/offers/0.7.0/dismiss', init: { method: 'POST', body: {}, signal: undefined } }])
    await kind(createUpdatesClient(fakeAuth({ version: '0.8.0', dismissed: true }).auth).skip('0.7.0'), 'invalid-response')
  })

  it('refuses a version that is not a release number before anything is sent', async () => {
    const { auth, calls } = fakeAuth({})
    await kind(createUpdatesClient(auth).skip('../x'), 'validation')
    expect(calls).toEqual([])
  })

  it('dismisses a finished update by its id', async () => {
    const { auth, calls } = fakeAuth({ id: hex('b'), dismissed: true })
    await createUpdatesClient(auth).dismiss(hex('b'))
    expect(calls).toEqual([{ path: `/api/control/pi/updates/results/${hex('b')}/dismiss`, init: { method: 'POST', body: {}, signal: undefined } }])
    await kind(createUpdatesClient(fakeAuth({ id: hex('c'), dismissed: true }).auth).dismiss(hex('b')), 'invalid-response')
  })

  it('refuses an id that is not 32 hex characters', async () => {
    const { auth, calls } = fakeAuth({})
    await kind(createUpdatesClient(auth).dismiss('result-1'), 'validation')
    expect(calls).toEqual([])
  })
})

describe('password alerts', () => {
  const alerts = { unseen: 1, results: [{ at: 5, origin: 'new_device', seen: false }] }

  it('lists the wrong-password attempts', async () => {
    const { auth, calls } = fakeAuth(alerts)
    expect(await createPasswordAlertsClient(auth).list()).toEqual(alerts)
    expect(calls).toEqual([{ path: '/auth/alerts', init: { signal: undefined } }])
    await kind(createPasswordAlertsClient(fakeAuth({ unseen: -1, results: [] }).auth).list(), 'invalid-response')
  })

  it('marks them seen with an empty POST and wants Pi to say so', async () => {
    const { auth, calls } = fakeAuth({ seen: true })
    await createPasswordAlertsClient(auth).seen()
    expect(calls).toEqual([{ path: '/auth/alerts/seen', init: { method: 'POST', body: {}, signal: undefined } }])
    await kind(createPasswordAlertsClient(fakeAuth({ seen: false }).auth).seen(), 'invalid-response')
  })
})

describe('owner settings', () => {
  const document = { schemaVersion: 1, revision: 4, values: { 'chat.theme': 'dark' } }
  const preferences = { revision: 2, preferences: { quiet: true } }
  const tools = { revision: 7, settings: { limit: null } }

  it('reads and saves the settings document, checking that the revision moved by one', async () => {
    const { auth, calls } = fakeAuth(document, { ...document, revision: 5 })
    const client = createOwnerSettingsClient(auth)
    expect(await client.read()).toEqual(document)
    expect((await client.save({ a: 1 }, 4)).revision).toBe(5)
    expect(calls).toEqual([
      { path: '/api/control/pi/owner/settings', init: { signal: undefined } },
      { path: '/api/control/pi/owner/settings', init: { method: 'POST', body: { expected_revision: 4, values: { a: 1 } } } },
    ])
    await kind(createOwnerSettingsClient(fakeAuth({ ...document, revision: 9 }).auth).save({}, 4), 'invalid-response')
    await kind(createOwnerSettingsClient(fakeAuth({ nope: 1 }).auth).read(), 'invalid-response')
  })

  it('reads and saves preferences the same way', async () => {
    const { auth, calls } = fakeAuth(preferences, { ...preferences, revision: 3 })
    const client = createOwnerSettingsClient(auth)
    expect(await client.preferences()).toEqual(preferences)
    expect((await client.savePreferences({ quiet: false }, 2)).revision).toBe(3)
    expect(calls[1]).toEqual({ path: '/api/control/pi/owner/preferences', init: { method: 'POST', body: { expected_revision: 2, preferences: { quiet: false } } } })
    await kind(createOwnerSettingsClient(fakeAuth(preferences).auth).savePreferences({}, 2), 'invalid-response')
  })

  it('reads and replaces the tool settings with PUT', async () => {
    const { auth, calls } = fakeAuth(tools, { ...tools, revision: 8 })
    const client = createOwnerSettingsClient(auth)
    expect(await client.tools()).toEqual(tools)
    expect((await client.saveTools({ limit: 3 }, 7)).revision).toBe(8)
    expect(calls[1]).toEqual({ path: '/api/owner/tool-settings', init: { method: 'PUT', body: { expected_revision: 7, settings: { limit: 3 } } } })
    await kind(createOwnerSettingsClient(fakeAuth(tools).auth).saveTools({}, 7), 'invalid-response')
  })

  it('reads lockdown and refuses an answer that does not match what was asked', async () => {
    const { auth, calls } = fakeAuth({ lockdown: false }, { lockdown: true, reason: 'away', changed_by: null })
    const client = createOwnerSettingsClient(auth)
    expect(await client.lockdown()).toEqual({ lockdown: false })
    expect(await client.setLockdown(true)).toEqual({ lockdown: true, reason: 'away', changed_by: null })
    expect(calls[1]).toEqual({ path: '/api/owner/lockdown', init: { method: 'POST', body: { enabled: true } } })
    await kind(createOwnerSettingsClient(fakeAuth({ lockdown: false }).auth).setLockdown(true), 'invalid-response')
  })
})

describe('provider control', () => {
  const secret = 'sk-test-key-123'
  const provider = (id: string) => ({
    id,
    configured: true,
    activeRevision: `credential_${hex('a')}`,
    activeAt: null,
    stagedRevision: null,
    stagedAt: null,
    verificationStatus: 'verified',
    verificationBasis: null,
    verifiedAt: null,
    verificationStale: false,
    activationPending: false,
    revokedRevisions: [],
    secretIncluded: false,
  })
  const available = { schemaVersion: 1, available: true, secretsIncluded: false, paidAllowed: false, policyRecoveryRequired: false, providers: ['openrouter', 'openai', 'anthropic'].map(provider) }
  const unavailable = { ...available, available: false, paidAllowed: null, providers: [] }

  it('reads the status of the three providers every release reports', async () => {
    const { auth, calls } = fakeAuth(available)
    expect(await createProviderControlClient(auth).status()).toEqual(available)
    expect(calls).toEqual([{ path: '/api/host/providers', init: { signal: undefined } }])
  })

  it('accepts an unavailable host with no providers, and nothing in between', async () => {
    expect((await createProviderControlClient(fakeAuth(unavailable).auth).status()).available).toBe(false)
    await kind(createProviderControlClient(fakeAuth({ ...unavailable, paidAllowed: false }).auth).status(), 'invalid-response')
    await kind(createProviderControlClient(fakeAuth({ ...available, providers: available.providers.slice(1) }).auth).status(), 'invalid-response')
    await kind(createProviderControlClient(fakeAuth({ ...available, paidAllowed: null }).auth).status(), 'invalid-response')
    await kind(createProviderControlClient(fakeAuth({ ...available, providers: [provider('openrouter'), provider('openrouter'), provider('openai'), provider('anthropic')] }).auth).status(), 'invalid-response')
  })

  it('sends a checked operation and hands the dispatch callback on', async () => {
    const { auth, calls } = fakeAuth(available)
    const onDispatch = () => undefined
    const signal = new AbortController().signal
    const staged: ProviderCredentialOperation = { operation: 'stage', provider: 'openai', secret, activeRevision: null, stagedRevision: null }
    expect((await createProviderControlClient(auth).apply(staged, signal, onDispatch)).available).toBe(true)
    expect(calls).toEqual([{ path: '/api/host/providers', init: { method: 'POST', body: staged, signal, onDispatch } }])
  })

  it('refuses a malformed operation before anything is sent', async () => {
    const { auth, calls } = fakeAuth(available)
    const client = createProviderControlClient(auth)
    await kind(client.apply({ operation: 'stage', provider: 'openai', secret: 'short', activeRevision: null, stagedRevision: null }), 'validation')
    await kind(client.apply({ operation: 'verify', provider: 'openai', revision: 'credential_x' as never }), 'validation')
    await kind(client.apply({ operation: 'record-revoked', provider: 'openai', revision: `credential_${hex('b')}`, issuerConfirmed: false as never }), 'validation')
    expect(calls).toEqual([])
  })

  it('sends the paid policy and recovery operations', async () => {
    const { auth, calls } = fakeAuth(available)
    const client = createProviderControlClient(auth)
    await client.apply({ operation: 'paid-policy', enabled: true, expectedAllowed: false })
    await client.apply({ operation: 'recover-paid-policy' })
    expect(calls.map(call => (call.init.body as { operation: string }).operation)).toEqual(['paid-policy', 'recover-paid-policy'])
  })
})

describe('host inventory', () => {
  const id = `browser_${hex('a')}`
  const section = { status: 'ok', truncated: false, errors: [] }
  const inventory = (requestId = id) => ({
    schemaVersion: 1,
    requestId,
    state: 'complete',
    limit: 100,
    approvalRequired: false,
    errorCode: null,
    observation: {
      mode: 'observed',
      status: 'ok',
      sampledAt: '2026-11-24T10:00:00Z',
      ageSeconds: 1,
      collectionSeconds: 0.5,
      sourceScopes: { process: 'configured-procfs', network: 'collector-namespace', containers: 'unavailable' },
      processes: { ...section, results: [{ id: `process_${hex('1', 64)}`, name: 'pi', status: 'running', createdAt: 1, memoryBytes: null }] },
      containers: { ...section, results: [] },
      ports: { ...section, results: [] },
      unavailableFieldCount: 0,
      capabilities: { inspection: true, processActions: false, containerActions: false, portMutation: false, terminal: false, files: false },
    },
    receiptStatus: null,
    currentAgeSeconds: null,
    createdAt: 1,
    updatedAt: 2,
    source: 'toolgate/system.inventory',
    refreshRequiresNewRequest: true,
    authority: 'none',
    contentIncluded: false,
    execution: 'read-only-observation',
  })
  const targets = (targetKind: string) => ({
    schemaVersion: 1,
    kind: targetKind,
    status: 'configured',
    results: [{ id: `service_${hex('2', 64)}`, kind: 'service', name: null }],
    requiresApproval: true,
    observed: false,
    authority: 'none',
    contentIncluded: false,
    execution: 'not-triggered',
  })

  it('makes a request id the server accepts', () => {
    const made = createHostInventoryRequestId()
    expect(made).toMatch(/^browser_[0-9a-f]{32}$/)
    expect(createHostInventoryRequestId()).not.toBe(made)
  })

  it('starts, inspects and resumes an inventory under its own id', async () => {
    const { auth, calls } = fakeAuth(inventory())
    const client = createGatewayHostInventoryClient(auth)
    expect((await client.request(id)).state).toBe('complete')
    expect((await client.request(id, 5)).requestId).toBe(id)
    await client.inspect(id)
    await client.resume(id)
    const base = '/api/control/pi/system/inventory'
    expect(calls.map(call => [call.path, call.init.method, call.init.body])).toEqual([
      [base, 'POST', { request_id: id, limit: 100 }],
      [base, 'POST', { request_id: id, limit: 5 }],
      [`${base}/${id}`, undefined, undefined],
      [`${base}/${id}/resume`, 'POST', {}],
    ])
  })

  it('refuses another request id in the answer, and a bad id or limit before sending', async () => {
    const other = `browser_${hex('b')}`
    const client = createGatewayHostInventoryClient(fakeAuth(inventory(other)).auth)
    await kind(client.request(id), 'invalid-response')
    await kind(client.inspect(id), 'invalid-response')
    await kind(client.resume(id), 'invalid-response')
    const { auth, calls } = fakeAuth(inventory())
    const checked = createGatewayHostInventoryClient(auth)
    await kind(checked.request('short'), 'validation')
    await kind(checked.request(id, 0), 'validation')
    await kind(checked.request(id, 201), 'validation')
    await kind(checked.inspect('../x'), 'validation')
    await kind(checked.resume('x'), 'validation')
    expect(calls).toEqual([])
    await kind(createGatewayHostInventoryClient(fakeAuth({ nope: true }).auth).inspect(id), 'invalid-response')
  })

  it('lists the configured services and containers, each of the kind asked for', async () => {
    const services = createGatewayHostInventoryClient(fakeAuth(targets('services')).auth)
    expect((await services.configured('services')).results).toHaveLength(1)
    const containers = createGatewayHostInventoryClient(fakeAuth(targets('containers')).auth)
    expect((await containers.configured('containers')).kind).toBe('containers')
    await kind(createGatewayHostInventoryClient(fakeAuth(targets('services')).auth).configured('containers'), 'invalid-response')
  })
})

describe('access', () => {
  const digest = hex('d', 64)
  const toolAccess = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, toolId: 'files.read', actorId: 'chat', actorName: 'Chat', enabled: true, requiredScope: 'files:read', digest, ...overrides })

  it('reads the state, defaulting the inbox buttons to none', async () => {
    const { auth, calls } = fakeAuth({ delegate: true, sensitive: ['mail.send'], floorExecutions: ['pay'] })
    expect(await createAccessClient(auth).state()).toEqual({ delegate: true, sensitive: ['mail.send'], floorExecutions: ['pay'], cards: {} })
    expect(calls).toEqual([{ path: '/api/owner/access', init: { signal: undefined } }])
    await kind(createAccessClient(fakeAuth({ delegate: true }).auth).state(), 'invalid-response')
  })

  it('sets delegation and wants the same value back', async () => {
    const { auth, calls } = fakeAuth({ delegate: false })
    expect(await createAccessClient(auth).setDelegate(false)).toBe(false)
    expect(calls).toEqual([{ path: '/api/owner/access/delegate', init: { method: 'POST', body: { enabled: false } } }])
    await kind(createAccessClient(fakeAuth({ delegate: true }).auth).setDelegate(false), 'invalid-response')
  })

  it('marks a tool sensitive, checking the tool and the flag in the answer', async () => {
    const { auth, calls } = fakeAuth({ id: 'mail.send', sensitive: true })
    expect(await createAccessClient(auth).setSensitive('mail.send', true)).toBe(true)
    expect(calls).toEqual([{ path: '/api/owner/tools/mail.send/sensitive', init: { method: 'POST', body: { sensitive: true } } }])
    await kind(createAccessClient(fakeAuth({ id: 'other', sensitive: true }).auth).setSensitive('mail.send', true), 'invalid-response')
    await kind(createAccessClient(fakeAuth({ id: 'mail.send', sensitive: false }).auth).setSensitive('mail.send', true), 'invalid-response')
    await kind(createAccessClient(auth).setSensitive('../x', true), 'validation')
  })

  it('sets an inbox button template from the fixed list only', async () => {
    const { auth, calls } = fakeAuth({ id: 'mail.send', template: 'send' })
    expect(await createAccessClient(auth).setCard('mail.send', 'send')).toBe('send')
    expect(calls).toEqual([{ path: '/api/owner/tools/mail.send/card', init: { method: 'POST', body: { template: 'send' } } }])
    await kind(createAccessClient(auth).setCard('mail.send', 'pwn' as never), 'validation')
    await kind(createAccessClient(auth).setCard('', 'send'), 'validation')
    await kind(createAccessClient(fakeAuth({ id: 'mail.send', template: 'do' }).auth).setCard('mail.send', 'send'), 'invalid-response')
    await kind(createAccessClient(fakeAuth({ id: 'other', template: 'send' }).auth).setCard('mail.send', 'send'), 'invalid-response')
  })

  it('reads and sets whether Conker may use one tool, by the digest it saw', async () => {
    const { auth, calls } = fakeAuth(toolAccess(), toolAccess({ enabled: false }))
    const client = createAccessClient(auth)
    expect((await client.toolAccess('files.read')).enabled).toBe(true)
    expect((await client.setToolAccess('files.read', false, digest)).enabled).toBe(false)
    expect(calls).toEqual([
      { path: '/api/owner/tools/files.read/access', init: { signal: undefined } },
      { path: '/api/owner/tools/files.read/access', init: { method: 'POST', body: { enabled: false, expected_digest: digest } } },
    ])
  })

  it('refuses the wrong tool or flag in an answer, and a bad digest before sending', async () => {
    await kind(createAccessClient(fakeAuth(toolAccess({ toolId: 'other' })).auth).toolAccess('files.read'), 'invalid-response')
    await kind(createAccessClient(fakeAuth(toolAccess({ toolId: 'other' })).auth).setToolAccess('files.read', true, digest), 'invalid-response')
    await kind(createAccessClient(fakeAuth(toolAccess({ enabled: false })).auth).setToolAccess('files.read', true, digest), 'invalid-response')
    const { auth, calls } = fakeAuth(toolAccess())
    await kind(createAccessClient(auth).setToolAccess('files.read', true, 'stale'), 'validation')
    expect(calls).toEqual([])
  })

  it('lists what ran without asking, and refuses an unknown decider', async () => {
    const entry = { id: `hnd_${hex('e')}`, sessionId: null, turnId: null, toolId: 'files.read', decidedBy: 'ai_reviewer', reason: 'safe', createdAt: 3 }
    const { auth, calls } = fakeAuth({ schemaVersion: 1, results: [entry] })
    expect(await createAccessClient(auth).handled()).toEqual([entry])
    expect(calls).toEqual([{ path: '/api/control/pi/access/handled', init: { signal: undefined } }])
    await kind(createAccessClient(fakeAuth({ schemaVersion: 1, results: [{ ...entry, decidedBy: 'nobody' }] }).auth).handled(), 'invalid-response')
  })
})
