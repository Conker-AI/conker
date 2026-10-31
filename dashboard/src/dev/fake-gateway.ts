/**
 * Development-only in-memory gateway for looking at the live UI without a server or a sign-in.
 * It answers the same routes, in the same wire shapes, that the real gateway clients parse, so
 * the real screens and validators run unchanged. Never imported by the production entry.
 */
import { GatewayError } from '@/lib/gateway/transport'
import { createCharacterStudio } from '@/lib/api/character-defaults'
import { searchSources, type SearchResult, type SearchSettings } from '@/lib/gateway/search'
import { continueAfterDecision, createFakeAgentJobs, createFakeHostOps, createFakeProviderCredentials, fakePlanUsage, withFakeAgentJobs } from './fake-gateway-providers'
import { createFakeMemory } from './fake-gateway-memory'
import { createFakeSetup } from './fake-gateway-setup'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean>; signal?: AbortSignal; onDispatch?: () => void }

const now = () => Date.now() / 1000
const iso = (seconds: number) => new Date(seconds * 1000).toISOString()
let counter = 0
const nextId = (prefix: string) => prefix === 'msg'
  ? `msg_${(++counter).toString(16).padStart(16, '0')}`
  : `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`
const previewSessions = {
  week: `ses_${'1'.repeat(16)}`,
  sky: `ses_${'2'.repeat(16)}`,
  coach: `ses_${'3'.repeat(16)}`,
}

type Message = { id: string; session_id: string; seq: number; role: 'user' | 'assistant'; content: string; created_at: number; agent_id?: string; memory_delivery?: Json; turn_id?: string }
type Session = { id: string; title: string; summary?: string; created_at: number; messages: Message[]; turns: Json[]; thinking?: Json[] }

const replies = [
  "Here's a simple plan for the week:\n\n| Day | Plan |\n| --- | --- |\n| Monday | Revision block before school, 45 minutes |\n| Tuesday and Thursday | Judo, so keep homework light |\n| Friday | Hand in the physics worksheet |\n\nWant me to put these in your calendar?",
  'Sure. Short version: sunlight scatters off air molecules, and blue light scatters the most because its wavelength is shorter. That scattered blue reaches your eyes from every direction.',
  "I can do that. I'll draft it first so you can check it before anything is sent.",
]

function seed(): Session[] {
  const start = now() - 86400
  const session = (id: string, title: string, turns: [string, string][], offset: number): Session => ({
    id, title, created_at: start + offset, turns: turns.map((_, index) => ({
      id: `trn_${offset}_${index}`, session_id: id, status: 'completed', acted: 0, started_at: start + offset + index * 120, ended_at: start + offset + index * 120 + 8,
      provider: 'ollama', model: 'qwen2.5:3b', input_tokens: null, output_tokens: null, cost_usd: null, detail: null, action: null,
      memory: { configured: false, pending_ingestion: 0, blocked_delivery: 0, pending_deletion: 0, notices: [] },
    })),
    messages: turns.flatMap(([ask, answer], index) => [
      { id: `msg_${(offset + index * 2 + 1).toString(16).padStart(16, '0')}`, session_id: id, seq: index * 2 + 1, role: 'user' as const, content: ask, created_at: start + offset + index * 120,
        memory_delivery: { state: id === previewSessions.week ? 'saved' : id === previewSessions.sky ? 'filtered' : 'excluded', reason_code: id === previewSessions.coach ? 'privacy_disabled' : null, admission_method: id === previewSessions.week ? 'signal' : id === previewSessions.sky ? 'filtered' : null, memory_id: id === previewSessions.week ? 'mem_judo' : null } },
      { id: `msg_${(offset + index * 2 + 2).toString(16).padStart(16, '0')}`, session_id: id, seq: index * 2 + 2, role: 'assistant' as const, content: answer, created_at: start + offset + index * 120 + 8, turn_id: `trn_${offset}_${index}` },
    ]),
  })
  return [
    session(previewSessions.week, 'Plan my week', [['Help me plan this week around school and judo.', replies[0]]], 60000),
    session(previewSessions.sky, 'Why is the sky blue?', [['Why is the sky blue? Two sentences.', replies[1]]], 30000),
    session(previewSessions.coach, 'Email to coach', [['Ask coach if Friday open mat is still on.', replies[2]]], 1000),
  ]
}

export type FakeGateway = ReturnType<typeof createFakeGateway>

export function createFakeGateway(preview: { setupStep?: 'model' | 'memory' | 'capabilities' | 'protection' | 'rehearsal' } = {}) {
  const nativeRows = ['review_changes', 'waiting_input'].map((id, index) => ({ id, identity: (index ? 'b' : 'a').repeat(64), sessionId: `native_conversation_${index}`, name: index ? 'Review needs native input' : 'Review workspace changes', cwd: index ? 'C:/work/conker/examples/long-working-directory-for-native-review' : 'C:/work/conker', startedAt: Date.now() - (index + 1) * 60000, state: index ? 'blocked' : 'working', processStatus: index ? 'waiting' : 'busy', waitingFor: index ? 'permission_prompt' : null, canStop: true }))
  const codexRows = Array.from({ length: 28 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: index === 0 ? 'Review the release checklist' : null, preview: index === 1 ? 'Inspect the native session metadata and preserve the exact owner-approved command. '.repeat(7).slice(0, 500) : `Saved review ${index + 1}: check the workspace changes before continuing.`, previewTruncated: index === 1, cwd: index === 1 ? 'C:/work/conker/examples/long-working-directory-for-native-review' : 'C:/work/conker', createdAt: Math.floor(Date.now() / 1000) - 7200 - index * 60, updatedAt: Math.floor(Date.now() / 1000) - index * 60, modelProvider: 'openai', source: index === 2 ? 'subAgent' : 'cli' }))
  const { handle: memoryHandle, memories, deliveryFor } = createFakeMemory(fail)
  const hostOps = createFakeHostOps(new URLSearchParams(globalThis.location?.search).get('preview-host')), providerCredentials = createFakeProviderCredentials(), agentJobs = createFakeAgentJobs(() => jobs), seedAgentJobs = withFakeAgentJobs(agentJobs)
  const subscriptionStates = new Map<string, 'idle' | 'pending' | 'connected'>()
  const sessions = seed()
  const thinkingScenario = globalThis.sessionStorage?.getItem('conker-fake-fail') === 'thinking-cancel-timeout'
  if (thinkingScenario) sessions[0].thinking = [{ session_id: sessions[0].id, turn_id: String(sessions[0].turns[0].id), input_message_id: sessions[0].messages[0].id, created_at: now(), status: 'running', provider: 'ollama', model: 'qwen2.5:7b', result: null, detail: null }]
  if (globalThis.sessionStorage?.getItem('conker-fake-history') === 'paged') {
    for (let index = 0; index < 115; index++) sessions.push({ id: `ses_history_${String(index).padStart(3, '0')}`, title: index === 70 ? `${'A long planning note '.repeat(20)}archived-keyword` : `Earlier conversation ${String(index + 1).padStart(3, '0')}`, ...(index === 70 ? { summary: `${'x'.repeat(400)} summary-keyword` } : {}), created_at: now() - 172800 - index * 60, messages: [], turns: [] })
  }
  const observations = new Map<string, { signature: string; revision: number }>()
  // Reloadable, development-only saved outcomes. They never invoke a provider or tool.
  const outcomeScenario = globalThis.sessionStorage?.getItem('conker-fake-fail')?.match(/^turn-(failed|interrupted|interrupted-acted|unreplied|unknown|approval)$/)?.[1]
  if (outcomeScenario) {
    const session = sessions[0], turn = session.turns[0]
    session.messages = session.messages.filter(message => message.role === 'user')
    Object.assign(turn, { status: ({ unreplied: 'acted_no_reply', unknown: 'outcome_unknown', approval: 'awaiting_approval', 'interrupted-acted': 'interrupted' } as Record<string, string>)[outcomeScenario] ?? outcomeScenario,
      acted: ['unreplied', 'interrupted-acted'].includes(outcomeScenario) ? 1 : 0,
      detail: outcomeScenario === 'failed' ? 'The model requested an unavailable tool. This request was not executed.' : null,
      action: ['unreplied', 'unknown', 'approval', 'interrupted-acted'].includes(outcomeScenario) ? { id: 'act_preview_outcome', state: outcomeScenario === 'unknown' ? 'outcome_unknown' : outcomeScenario === 'approval' ? 'awaiting_approval' : 'completed', job_id: null } : null,
      approval_request_id: outcomeScenario === 'approval' ? 'req_email_coach' : null })
  }
  let searchSettings: SearchSettings = { revision: 0, configuration: { sources: [...searchSources], exactText: true, semantic: false, reranking: false } }
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem('conker-preview-search-settings') ?? 'null') as SearchSettings | null
    if (value && Number.isInteger(value.revision) && value.revision >= 0 && Array.isArray(value.configuration?.sources) && value.configuration.sources.every(source => searchSources.includes(source)) && typeof value.configuration.exactText === 'boolean') searchSettings = { revision: value.revision, configuration: { ...value.configuration, semantic: false, reranking: false } }
  } catch { /* Preview preferences are optional; malformed storage uses safe defaults. */ }
  const composerDrafts = new Map<string, Json>()
  const draftStarts = new Map<string, Json>()
  const emptyComposerDraft = (key: string): Json => ({ schemaVersion: 1, session_id: key === 'new' ? null : key.split('/')[0], task_id: key.split('/')[1] ?? null, content_status: 'available', revision: 0, text: '', updated_at: null, model_id: null, skill_ids: [], think: false, research_mode: 'off', ...(key === 'new' ? { title: '', agent_id: null, privacy: {} } : {}) })
  const submissions = new Map<string, Json>()
  const streams = new Map<string, { text: string; stopped: boolean }>()
  const approvals: Json[] = [{
    id: 'req_email_coach', kind: 'verification', title: 'Send an email to coach', details: 'Conker drafted this email and needs your OK before sending it.',
    actor: 'Conker', severity: 'normal', status: 'pending', created_at: iso(now() - 120), updated_at: iso(now() - 120), decision: null,
    action: { subject_type: 'tool', subject_id: 'email.send', version: 3, args: { to: 'coach@judo-club.example', subject: 'Friday open mat', body: 'Hi coach, is the open mat on Friday still happening? Thanks, Alexey' } },
    approval: { expires_at: null, consumed_at: null, origin_valid: true }, reviewable: true, unavailable_reason: null, card: 'send',
  }]
  const proposals: Json[] = [
    { id: 'prp_homework', title: 'Homework reminders', noticed: 'You asked what homework is due on Friday three times this week.', suggestion: 'Remind you every Thursday evening of what is due Friday.', ifApproved: 'A short reminder appears in your chat each Thursday at 19:00. Nothing else changes.', state: 'open', createdAt: now() - 3600, decidedAt: null, grantsExecutionAuthority: false,
      evidence: [{ messageId: `msg_${(60001).toString(16).padStart(16, '0')}`, available: true, sessionId: previewSessions.week, excerpt: "What's due this Friday? I keep forgetting", createdAt: now() - 7200 }] },
    { id: 'prp_summary', title: 'Weekly study summary', noticed: 'You ask for a summary of what you studied most weekends.', suggestion: 'Prepare a short summary every Sunday.', ifApproved: 'A draft summary waits in your Inbox on Sundays for you to read.', state: 'open', createdAt: now() - 7000, decidedAt: null, grantsExecutionAuthority: false,
      evidence: [{ messageId: `msg_${(30001).toString(16).padStart(16, '0')}`, available: true, sessionId: previewSessions.sky, excerpt: 'Summarize what I studied this week', createdAt: now() - 9000 }] },
  ]
  const setupHandle = createFakeSetup(preview, approvals, now, iso, fail)
  const sessionRow = (item: Session) => ({ id: item.id, parent_id: null, title: item.title, status: 'open', created_at: item.created_at, closed_at: null, summary: null })
  const tools = [
    { id: 'calendar.read', name: 'Read calendar', description: 'Reads events from your calendar for a date range.', inputs: [{ name: 'from', type: 'date', required: true }, { name: 'to', type: 'date', required: true }] },
    { id: 'email.send', name: 'Send email', description: 'Sends an email. Always asks you first.', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'subject', type: 'string' }, { name: 'body', type: 'string' }] },
    { id: 'research.search', name: 'Web search', description: 'Searches the web and returns short, sourced results.', inputs: [{ name: 'query', type: 'string', required: true }] },
  ]
  const agentProfile = (id: string, kind: 'companion' | 'agent', name: string, role: string, instructions: string): Json => ({
    schemaVersion: 1, id, kind, revision: 1, configuration: { name, role, instructions, modelId: null, toolIds: [], memory: { scope: 'conversation', memoryIds: [] } },
    created_at: now() - 7200, updated_at: now() - 7200, archived_at: null, change_kind: 'created', authority: 'none', execution: 'not-integrated', reference_validation: 'not-performed',
  })
  const agents: Json[] = [
    agentProfile('companion', 'companion', 'Conker', 'Your daily companion', 'Help the owner think clearly, plan realistically, and stay in control.'),
    agentProfile(`agent_${'1'.repeat(32)}`, 'agent', 'Research partner', 'Focused research and synthesis', 'Investigate a question, distinguish evidence from inference, and return concise sourced findings.'),
  ]
  let characterRevision = 1
  let character: Json = {
    name: 'Conker', mood: 'Thoughtful · ready to listen', personality: 'Curious and steady. Help me think clearly and stay in control.',
    speakingStyle: 'Warm, direct, and concise. A little dry humour when it fits.', speakingPreset: 'custom',
    portrait: '/conker.png', renderer: 'static', face: 'sprout', tone: 'green',
    emotions: { neutral: 'default', happy: 'portrait', thinking: 'portrait', concerned: 'default', celebrating: 'portrait' },
    studio: createCharacterStudio(),
  }
  const characterHistory: Json[] = [{ revision: 1, created_at: now() - 7200, restored_from: null }]
  const characterVersions = new Map<number, Json>([[1, structuredClone(character)]])
  let hostInventory: Json | null = null
  let fileListing: Json | null = null
  let browserCall: Json | null = null
  let terminalLease: string | null = null
  let terminalOutput = new TextEncoder().encode('\u001b[1mPreview owner shell\u001b[0m\r\nowner@conker:/workspace/conker$ ')
  let terminalLine = ''
  const appendTerminal = (text: string) => {
    const next = new TextEncoder().encode(text), combined = new Uint8Array(terminalOutput.length + next.length)
    combined.set(terminalOutput); combined.set(next, terminalOutput.length); terminalOutput = combined
  }
  const terminalBase64 = (value: Uint8Array) => {
    let binary = ''
    for (const byte of value) binary += String.fromCharCode(byte)
    return btoa(binary)
  }
  const terminalInput = (value: string) => {
    const binary = atob(value), bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    for (const character of text) {
      if (character === '\r' || character === '\n') {
        appendTerminal(`\r\n${terminalLine.trim() === 'pwd' ? '/workspace/conker\r\n' : terminalLine.trim() ? `Preview received: ${terminalLine.trim()}\r\n` : ''}owner@conker:/workspace/conker$ `)
        terminalLine = ''
      } else if (character === '\u007f') {
        if (terminalLine) { terminalLine = terminalLine.slice(0, -1); appendTerminal('\b \b') }
      } else { terminalLine += character; appendTerminal(character) }
    }
    return bytes.length
  }
  const callEvent = (kind: 'event' | 'user' | 'assistant', text: string): Json => ({ id: `call_event_${(++counter).toString(16)}`, at: now(), kind, text, source: null })
  const createBrowserCall = (conversationId: string): Json => ({
    schemaVersion: 1, id: `call_${'9'.repeat(32)}`, conversationId, sessionId: `ses_${'9'.repeat(16)}`, agentId: 'companion', name: 'Call',
    startedAt: now(), endedAt: null, revision: 1, generation: 1, phase: 'ready', paused: false,
    channels: { microphone: false, camera: false, keyboard: true, voice: false, avatar: false, captions: true }, mode: 'focus', modelId: null,
    privacy: { memory: false, harness: false }, events: [callEvent('event', 'Call started · English; no recording')], requests: [],
    eventsTruncated: false, requestsTruncated: false, capabilities: { typedTurns: true, speech: 'bounded-audio-turns', camera: 'unavailable', perception: 'unavailable', emotion: 'unavailable', characterVoice: 'adapter-dependent; inspect call capabilities', channels: 'client-owned capture; preferences gate transport', rawMediaRetention: 'none', audioReplay: 'unavailable', interruption: 'cooperative; in-flight effects cannot be recalled' },
    authority: 'none', execution: 'typed-and-audio-turns', contentIncluded: true, audioIncluded: false, retention: 'transcript-persisted; raw-media-none',
  })
  const sampleDirectory = (rootId: string, path: string): Json => {
    const rows: Record<string, Json[]> = {
      '': [
        { name: 'dashboard', path: 'dashboard', kind: 'directory' },
        { name: 'docs', path: 'docs', kind: 'directory' },
        { name: 'README.md', path: 'README.md', kind: 'file' },
      ],
      dashboard: [
        { name: 'src', path: 'dashboard/src', kind: 'directory' },
        { name: 'package.json', path: 'dashboard/package.json', kind: 'file' },
      ],
      'dashboard/src': [
        { name: 'components', path: 'dashboard/src/components', kind: 'directory' },
        { name: 'App.tsx', path: 'dashboard/src/App.tsx', kind: 'file' },
      ],
      docs: [{ name: 'README.md', path: 'docs/README.md', kind: 'file' }],
    }
    return { mode: 'observed', rootId, path, truncated: false, sampledAt: iso(now()), entries: rows[path] ?? [] }
  }
  const hostObservation = (): Json => ({
    mode: 'observed', status: 'partial', sampledAt: iso(now()), ageSeconds: 0, collectionSeconds: 0.18,
    sourceScopes: { process: 'configured-procfs', network: 'collector-namespace', containers: 'configured-docker-daemon' },
    processes: { status: 'ok', truncated: false, errors: [], results: [
      { id: `process_${'1'.repeat(64)}`, name: 'conker-pi', status: 'sleeping', createdAt: now() - 3600, memoryBytes: 73400320 },
      { id: `process_${'2'.repeat(64)}`, name: 'gateway', status: 'sleeping', createdAt: now() - 3500, memoryBytes: 49283072 },
    ] },
    containers: { status: 'ok', truncated: false, errors: [], results: [
      { id: `container_${'3'.repeat(64)}`, name: 'conker-pi', status: 'running', imageConfigured: true },
      { id: `container_${'4'.repeat(64)}`, name: 'conker-gateway', status: 'running', imageConfigured: true },
    ] },
    ports: { status: 'partial', truncated: false, errors: ['process_link_unavailable'], results: [
      { id: `port_${'5'.repeat(64)}`, kind: 'listener', addressScope: 'loopback', hostPort: 8050, targetPort: null, protocol: 'tcp', processId: `process_${'2'.repeat(64)}`, containerId: null, state: 'listening' },
      { id: `port_${'6'.repeat(64)}`, kind: 'container-binding', addressScope: 'all-interfaces', hostPort: 443, targetPort: 8050, protocol: 'tcp', processId: null, containerId: `container_${'4'.repeat(64)}`, state: 'declared-binding' },
    ] },
    unavailableFieldCount: 1,
    capabilities: { inspection: true, processActions: false, containerActions: false, portMutation: false, terminal: false, files: false },
  })
  const projectView = (id: string, revision: number, fields: Json, links: Json[] = [], archivedAt: number | null = null): Json => ({
    schemaVersion: 1, id, revision, ...fields, createdAt: now() - 5400, updatedAt: now() - 900, archivedAt, links,
    authority: 'none', contentIncluded: false, grantsInherited: false,
  })
  const projects: Json[] = [projectView(`project_${'2'.repeat(32)}`, 1, {
    name: 'School and judo', description: 'Plans, deadlines, and training commitments that shape the week.',
    instructions: 'Keep school deadlines realistic around Tuesday and Thursday training. Prefer short morning study blocks.',
  }, [{ reference: { kind: 'conversation', sessionId: previewSessions.week }, mode: 'live-reference', snapshot: { originSessionId: previewSessions.week, linkedAt: now() - 3600 }, availability: 'available', label: 'Plan my week', labelSource: 'live-source', privacy: { memoryDisabled: false, harnessDisabled: false, incognito: false } }])]
  const artifactView = (id: string, title: string, content: Json, createdAt = iso(now() - 4200)): Json => ({
    schemaVersion: 1, id, title, revision: 1, createdAt, updatedAt: createdAt, archivedAt: null,
    provenance: 'pi', origin: 'owner-authored', source: null, task: null, availability: 'available', privacy: null,
    privateOrigin: false, taskAvailability: 'none', authority: 'none', execution: 'not-wired', contentIncluded: true,
    versionCount: 1, currentVersion: 1,
    versions: [{ version: 1, title, content, createdAt, author: 'owner', note: 'Created by owner.', citations: [] }],
  })
  const artifacts: Json[] = [artifactView(`artifact_${'3'.repeat(32)}`, 'Weekly plan', {
    kind: 'markdown', text: '# This week\n\n- Finish the physics worksheet by Friday.\n- Keep Tuesday and Thursday homework light around judo.\n- Use one short morning revision block.',
  })]
  const artifactSummary = (item: Json): Json => {
    const { versions, ...summary } = item
    void versions
    return { ...summary, contentIncluded: false }
  }
  const jobId = `job_${'4'.repeat(32)}`
  const jobs: Json[] = [{
    schemaVersion: 1, id: jobId, revision: 2, createdAt: now() - 172800, nextAt: now() + 3600,
    definition: {
      name: 'Morning calendar brief', instructionsConfigured: true, agentId: 'companion',
      timing: { kind: 'daily', time: '07:30', day: 0, hours: 24 }, timeZone: 'Asia/Jerusalem', enabled: true, state: 'enabled',
      target: { kind: 'tool', id: 'calendar.read', publishedVersion: 3, digest: '5'.repeat(64), inputsConfigured: true },
      overlap: 'skip', requireBudget: false, budgetAllowanceConfigured: false,
    },
    authority: 'none', contentIncluded: false, execution: 'not-triggered',
  }]
  const teamId = `team_${'9'.repeat(32)}`
  const teamDefinition: Json = {
    name: 'Weekly planning team', objective: 'Turn school deadlines and training commitments into a realistic weekly plan.',
    roles: [
      { id: 'planner', name: 'Planner', agentId: `agent_${'1'.repeat(32)}`, instructions: 'Build the plan and identify conflicts.', toolIds: [], memory: { scope: 'none', memoryIds: [] }, context: { mode: 'task_only', sourceIds: [] }, budget: { maxTurns: 2, maxTokens: 3000, maxCostCents: 0 } },
      { id: 'reviewer', name: 'Reviewer', agentId: 'companion', instructions: 'Review the plan for clarity and realistic pacing.', toolIds: [], memory: { scope: 'conversation', memoryIds: [] }, context: { mode: 'task_only', sourceIds: [] }, budget: { maxTurns: 2, maxTokens: 3000, maxCostCents: 0 } },
    ],
    handoffs: [{ id: 'plan_review', fromRoleId: 'planner', toRoleId: 'reviewer', condition: 'When the first complete weekly plan is ready.', payload: 'result_and_citations', maxTransfers: 1 }],
    budget: { maxTurns: 6, maxTokens: 10_000, maxCostCents: 0, maxHandoffs: 2 },
  }
  const teamVersions = new Map<number, Json>([[1, structuredClone(teamDefinition)]])
  const team: Json = { schemaVersion: 1, id: teamId, revision: 1, name: teamDefinition.name, archived_at: null, created_at: now() - 4000, updated_at: now() - 4000,
    authority: 'none', execution: 'configuration-only', contentIncluded: true, reference_validation: 'external-references-unverified', definition: teamDefinition,
    agentReferences: [{ roleId: 'planner', agentId: `agent_${'1'.repeat(32)}`, revision: 1 }, { roleId: 'reviewer', agentId: 'companion', revision: 1 }], agentReferenceState: 'available' }
  const jobRuns = new Map<string, Json[]>([[jobId, [{
    schemaVersion: 1, id: `scheduled_${'5'.repeat(32)}`, jobId, jobRevision: 2, scheduledAt: now() - 82800, startedAt: now() - 82800,
    status: 'completed', manual: false, budgetBound: false, receiptRecorded: true, outcomeCode: 'COMPLETED',
    authority: 'none', contentIncluded: false, execution: 'resolved',
  }]]])
  const manualJobRequests = new Map<string, Json>()
  const sessionSettings = new Map<string, Json>()
  const memory = { configured: true, pending_ingestion: 0, blocked_delivery: 0, pending_deletion: 0, notices: [] }
  const find = (id: string) => sessions.find(item => item.id === id) ?? fail(404)

  function fail(status: number): never { throw new GatewayError(status === 404 ? 'http' : 'http', status) }

  function submission(requestId: string, session: Session, turnId: string | null, input: Message | null, final: Message | null, status: string): Json {
    const refs = [input && { message_id: input.id, purpose: 'input', action_id: null, seq: input.seq }, final && { message_id: final.id, purpose: 'final', action_id: null, seq: final.seq }].filter(Boolean)
    return { request_id: requestId, requested_session_id: session.id, effective_session_id: turnId ? session.id : null, turn_id: turnId, task_id: null,
      input_message_id: input?.id ?? null, final_message_id: final?.id ?? null, pending_text: null, failure_code: null, message_refs: refs,
      state: turnId ? 'bound' : 'preparing', status, acted: false, content_status: 'available', created_at: now(), updated_at: now() }
  }

  async function sendTurn(session: Session, body: Json): Promise<Json> {
    const requestId = String(body.request_id), text = String(body.text)
    const input: Message = { id: nextId('msg'), session_id: session.id, seq: session.messages.length + 1, role: 'user', content: text, created_at: now() }
    const inputSettings = sessionSettings.get(session.id)?.settings as Json | undefined
    const inputPrivacy = inputSettings?.privacy as Json | undefined
    input.memory_delivery = inputPrivacy?.memoryDisabled ? { state: 'excluded', reason_code: 'privacy_disabled', admission_method: null, memory_id: null }
      : inputSettings?.agentId && inputSettings.agentId !== 'companion' ? { state: 'excluded', reason_code: 'agent_excluded', admission_method: null, memory_id: null }
      : /^remember\b/i.test(text) ? { state: 'pending', reason_code: 'queued', admission_method: null, memory_id: null }
      : { state: 'filtered', reason_code: null, admission_method: 'filtered', memory_id: null }
    session.messages.push(input)
    if (session.messages.length === 1) session.title = text.slice(0, 48)
    // A message about email parks the turn on the owner, like a real email.send tool call.
    if (/e-?mail/i.test(text)) {
      const turnId = nextId('trn'), approvalId = nextId('req')
      approvals.unshift({ ...approvals[approvals.length - 1], id: approvalId, title: 'Send an email', status: 'pending', reviewable: true, unavailable_reason: null, decision: null,
        details: `Conker wants to send an email for: "${text.slice(0, 120)}"`, created_at: iso(now()), updated_at: iso(now()), approval: { expires_at: iso(now() + 600), consumed_at: null, origin_valid: true } })
      session.turns.push({ id: turnId, session_id: session.id, status: 'awaiting_approval', acted: 0, started_at: now(), ended_at: null, provider: 'ollama', model: 'qwen2.5:3b',
        input_tokens: 40, output_tokens: 0, cost_usd: 0, detail: null, action: null, approval_request_id: approvalId, memory })
      const receipt = submission(requestId, session, turnId, input, null, 'awaiting_approval')
      submissions.set(requestId, receipt)
      return { turn_id: turnId, session_id: session.id, status: 'awaiting_approval', acted: false, message: null, submission: receipt }
    }
    const answer = replies[Math.floor(Math.random() * replies.length)]
    const stream = { text: '', stopped: false }
    streams.set(requestId, stream)
    for (const word of answer.split(/(?<= )/)) {
      if (stream.stopped) break
      stream.text += word
      await new Promise(resolve => setTimeout(resolve, 45))
    }
    const turnId = nextId('trn'), started = now()
    const record = (status: string) => session.turns.push({ id: turnId, session_id: session.id, status, acted: 0, started_at: started, ended_at: now(), provider: 'ollama', model: 'qwen2.5:3b',
      input_tokens: 40, output_tokens: 80, cost_usd: 0, detail: null, action: null, approval_request_id: null, memory })
    if (stream.stopped) {
      record('cancelled')
      const receipt = submission(requestId, session, turnId, input, null, 'cancelled')
      submissions.set(requestId, receipt)
      return { turn_id: turnId, session_id: session.id, status: 'cancelled', acted: false, message: null, submission: receipt }
    }
    const agentId = String((sessionSettings.get(session.id)?.settings as Json | undefined)?.agentId ?? 'companion')
    const final: Message = { id: nextId('msg'), session_id: session.id, seq: session.messages.length + 1, role: 'assistant', content: answer, created_at: now(), agent_id: agentId, turn_id: turnId }
    session.messages.push(final)
    record('complete')
    const receipt = submission(requestId, session, turnId, input, final, 'complete')
    submissions.set(requestId, receipt)
    return { turn_id: turnId, session_id: session.id, status: 'complete', acted: false, message: final, submission: receipt }
  }

  async function request(path: string, options: Request = {}): Promise<Json> {
    if (path === '/auth/sessions') return { results: [] }
    if (path === '/auth/revoke-all' || /^\/auth\/sessions\/.+\/revoke$/.test(path)) throw new GatewayError('dependency', 503)
    const method = options.method ?? 'GET'
    await new Promise(resolve => setTimeout(resolve, method === 'POST' && /^\/api\/owner\/editor-drafts\/[^/]+\/runs$/.test(path) ? 2500 : 120)) // A tool run by hand takes a moment.
    let match: RegExpMatchArray | null; if (path === '/api/host/read' || path.startsWith('/api/host/ops')) return hostOps(path, options)
    if ((match = path.match(/^\/api\/control\/pi\/drafts\/new\/start\/([A-Za-z0-9_-]+)$/)) && method === 'GET') return structuredClone(draftStarts.get(match[1]) ?? fail(404))
    if (path === '/api/control/pi/drafts/new/start' && method === 'POST') {
      const body = options.body ?? {}, requestId = String(body.request_id)
      const prior = draftStarts.get(requestId)
      if (prior) { if (prior.source_revision !== body.expected_revision) fail(409); return structuredClone(prior) }
      const saved = composerDrafts.get('new') ?? emptyComposerDraft('new')
      if (saved.revision !== body.expected_revision) fail(409)
      if (!String(saved.text).trim()) fail(422)
      const id = nextId('ses')
      sessions.push({ id, title: String(saved.title || 'New chat'), created_at: now(), messages: [], turns: [] })
      sessionSettings.set(id, { revision: 1, settings: { agentId: saved.agent_id || 'companion', privacy: { memoryDisabled: false, harnessDisabled: false, ...(saved.privacy as Json) } } })
      composerDrafts.set(id, { ...saved, session_id: id, revision: 1 })
      const receipt = { schemaVersion: 1, request_id: requestId, session_id: id, content_status: 'available', source_revision: saved.revision, draft_revision: 1 }
      draftStarts.set(requestId, receipt)
      composerDrafts.set('new', { ...emptyComposerDraft('new'), revision: Number(saved.revision) + 1, updated_at: now() })
      if (globalThis.sessionStorage?.getItem('conker-fake-fail') === 'draft-start') { globalThis.sessionStorage.removeItem('conker-fake-fail'); fail(503) }
      return structuredClone(receipt)
    }
    if ((match = path.match(/^\/api\/control\/pi\/drafts\/([A-Za-z0-9_-]+)(?:\/tasks\/([A-Za-z0-9_-]+))?$/))) {
      const key = match[1] + (match[2] ? '/' + match[2] : '')
      if (key !== 'new') find(match[1])
      const mode = globalThis.sessionStorage?.getItem('conker-fake-fail')
      if (mode === 'drafts') fail(503)
      let saved = composerDrafts.get(key) ?? emptyComposerDraft(key)
      if (method === 'POST') {
        if (mode === 'draft-conflict') { saved = { ...saved, text: 'Draft changed in another tab. Keep the revised meeting agenda.', revision: Number(saved.revision) + 1 }; composerDrafts.set(key, saved); globalThis.sessionStorage.removeItem('conker-fake-fail') }
        const body = options.body ?? {}
        if (body.expected_revision !== saved.revision) fail(409)
        saved = { ...saved, ...body, revision: Number(saved.revision) + 1, updated_at: now() }
        delete saved.expected_revision
        composerDrafts.set(key, saved)
      }
      return structuredClone(saved)
    }
    if (method === 'GET' && ['/api/control/pi/search', '/api/control/pi/search/settings'].includes(path) && globalThis.sessionStorage?.getItem('conker-fake-fail') === 'search') fail(503)
    if (path === '/api/control/pi/search/settings') {
      if (method === 'POST') {
        if (options.body?.expected_revision !== searchSettings.revision) fail(409)
        const configuration = options.body?.configuration as SearchSettings['configuration']
        if (!configuration || configuration.semantic || configuration.reranking) fail(422)
        searchSettings = { revision: searchSettings.revision + 1, configuration }
        globalThis.localStorage?.setItem('conker-preview-search-settings', JSON.stringify(searchSettings))
      }
      return searchSettings
    }
    if (path === '/api/control/pi/search/capabilities') return { sources: [...searchSources], exactText: true, semanticSources: [], reranking: false, indexing: 'source-owned', scanLimit: 200 }
    if (path === '/api/control/pi/search' && method === 'GET') {
      const query = String(options.query?.q ?? '').trim().toLocaleLowerCase(), stage = String(options.query?.stage ?? 'metadata')
      const results: SearchResult[] = []
      const add = (source: SearchResult['source'], recordId: string, title: string, text: string, href: string, role: SearchResult['role'] = null) => {
        if (!searchSettings.configuration.sources.includes(source) || !query || !(stage === 'text' ? text : `${title}\n${text}`).toLocaleLowerCase().includes(query)) return
        const position = Math.max(0, text.toLocaleLowerCase().indexOf(query) - 80)
        results.push({ id: `${source}:${recordId}:${stage}`, source, recordId, title, excerpt: text.slice(position, position + 400), href, role, matchType: stage === 'text' ? 'text' : 'metadata' })
      }
      if (stage === 'metadata' || stage === 'text' && searchSettings.configuration.exactText) {
        for (const session of sessions) {
          const privacy = (sessionSettings.get(session.id)?.settings as Json | undefined)?.privacy as Json | undefined
          if (privacy?.memoryDisabled || privacy?.harnessDisabled) continue
          if (stage === 'text') for (const message of session.messages) add('conversations', message.id, session.title, message.content, `/chat?session=${session.id}&message=${message.id}`, message.role)
          else add('conversations', session.id, session.title, '', `/chat?session=${session.id}`)
        }
        for (const item of memories) add('memory', item.id, item.title, item.preview, `/memory?view=database&record=${item.id}&kind=${item.type}`)
        for (const item of projects) add('projects', String(item.id), String(item.name), String(stage === 'text' ? item.instructions : item.description), `/projects/${item.id}`)
        for (const item of artifacts) {
          const versions = item.versions as Json[], body = versions[versions.length - 1]?.content as Json
          if (item.availability === 'available' && !item.privateOrigin) add('artifacts', String(item.id), String(item.title), stage === 'text' && ['markdown', 'code'].includes(String(body?.kind)) ? String(body.text) : '', `/artifacts/${item.id}`)
        }
        for (const item of agents) { const config = item.configuration as Json; add('agents', String(item.id), String(config.name), String(stage === 'text' ? config.instructions : config.role), item.id === 'companion' ? '/settings/companion?tab=harness' : `/agents/${item.id}/edit`) }
        for (const item of tools) add('tools', item.id, item.name, item.description, `/tools?tool=${encodeURIComponent(item.id)}`)
        for (const item of jobs) { const config = item.definition as Json; add('jobs', String(item.id), String(config.name), String(config.state), `/jobs/${item.id}`) }
      }
      const offset = Number(options.query?.cursor ?? 0)
      if (!Number.isInteger(offset) || offset < 0) fail(422)
      return { stage, results: results.slice(offset, offset + 30), nextCursor: results.length > offset + 30 ? String(offset + 30) : null, coverage: stage === 'semantic' ? [] : searchSettings.configuration.sources.map(source => ({ source, status: 'searched' })), ranking: { status: 'disabled' } }
    }
    // Failure-path switch: sessionStorage 'conker-fake-fail' = 'sessions' makes the chat list fail.
    if (method === 'GET' && path === '/api/pi/sessions' && globalThis.sessionStorage?.getItem('conker-fake-fail') === 'sessions') fail(503)
    if (path === '/api/terminal/current' && method === 'GET') return { lease: terminalLease, workspace: '/workspace/conker', maximumLifetimeSeconds: 600, commandsPersisted: false, outputPersisted: false }
    if (path === '/api/terminal' && method === 'POST') {
      const requestId = String(options.body?.requestId ?? '')
      if (terminalLease && terminalLease !== requestId) fail(409)
      const replayed = terminalLease === requestId
      terminalLease = requestId
      return { id: requestId, closed: false, replayed }
    }
    if ((match = path.match(/^\/api\/terminal\/([A-Za-z0-9_-]{16,100})$/)) && method === 'GET') {
      if (terminalLease !== match[1]) return fail(404)
      const cursor = Number(options.query?.cursor ?? 0)
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > terminalOutput.length) return fail(422)
      return { data: terminalBase64(terminalOutput.slice(cursor)), encoding: 'base64', cursor: terminalOutput.length, droppedBytes: 0, exitCode: null }
    }
    if ((match = path.match(/^\/api\/terminal\/([A-Za-z0-9_-]{16,100})\/(input|resize|close)$/)) && method === 'POST') {
      if (terminalLease !== match[1]) return fail(404)
      if (match[2] === 'input') { const acceptedBytes = terminalInput(String(options.body?.data ?? '')); return { acceptedBytes, automaticReplay: false } }
      if (match[2] === 'resize') return { resized: true }
      terminalLease = null
      return { closed: true }
    }
    if (method === 'GET' && path === '/api/pi/sessions/history') {
      if (globalThis.sessionStorage?.getItem('conker-fake-fail') === 'history') fail(503)
      const q = String(options.query?.q ?? '').trim().toLowerCase(), limit = Number(options.query?.limit ?? 50)
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(q)))].map(value => value.toString(16).padStart(2, '0')).join('')
      const sorted = [...sessions].sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
      const cursor = options.query?.cursor
      const anchor = cursor === undefined ? null : sorted.find(row => `h1.${digest}.${row.id}` === cursor)
      if (cursor !== undefined && !anchor) throw new GatewayError('http', 422, undefined, 'invalid_history_cursor')
      const matches = sorted.filter(row => (!q || row.title.toLowerCase().includes(q) || row.summary?.toLowerCase().includes(q)) && (!anchor || row.created_at < anchor.created_at || row.created_at === anchor.created_at && row.id < anchor.id))
      const page = matches.slice(0, limit)
      return { schemaVersion: 1, results: page.map(row => ({ ...sessionRow(row), title: [...row.title].slice(0, 300).join(''), summary_preview: row.summary ? [...row.summary].slice(0, 400).join('') : null, content_status: 'available', title_truncated: [...row.title].length > 300, summary_truncated: [...row.summary ?? ''].length > 400 })), next_cursor: matches.length > limit ? `h1.${digest}.${page.at(-1)!.id}` : null }
    }
    if (method === 'GET' && path === '/api/pi/sessions') return { results: [...sessions].sort((a, b) => b.created_at - a.created_at).slice(0, 200).map(session => {
      const row = sessionRow(session)
      // Search deliberately keeps its earlier data so the real UI's stale-result mask is exercised.
      return session.id === previewSessions.week && globalThis.sessionStorage?.getItem('conker-fake-search-forgotten') === 'week' ? { ...row, status: 'forgotten', title: '', summary: null } : row
    }) }
    if (method === 'POST' && path === '/api/pi/sessions') {
      // Failure-path switch: a first message containing [fail] makes creation fail with a server error.
      if (String(options.body?.title ?? '').includes('[fail]')) fail(503)
      const agentId = String(options.body?.agent_id ?? 'companion')
      const selectedAgent = agents.find(agent => agent.id === agentId && agent.archived_at === null)
      if (!selectedAgent) fail(422)
      const privacy = options.body?.privacy as Json | undefined
      const created: Session = { id: `ses_${(++counter).toString(16).padStart(16, '0')}`, title: String(options.body?.title ?? ''), created_at: now(), messages: [], turns: [] }
      sessions.push(created)
      sessionSettings.set(created.id, { revision: 1, settings: { agentId, privacy: { memoryDisabled: Boolean(privacy?.memoryDisabled), harnessDisabled: Boolean(privacy?.harnessDisabled) } } })
      return { session_id: created.id }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/observation$/)) && method === 'GET') {
      const item = find(match[1]), signature = JSON.stringify(item), before = observations.get(item.id)
      const next = { signature, revision: (before?.revision ?? 0) + (before?.signature === signature ? 0 : 1) }
      observations.set(item.id, next)
      return { schemaVersion: 1, session_id: item.id, revision: next.revision, active: item.turns.some(turn => turn.status === 'running'), content_status: 'available' }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)$/)) && method === 'GET') {
      const item = find(match[1])
      return { ...sessionRow(item), thinking: item.thinking ?? [], messages: item.messages.map(message => message.role === 'user' ? { ...message, memory_delivery: deliveryFor(message) } : message), turns: item.turns, memory, pending_submissions: [], pending_submissions_truncated: false }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/thinking\/([^/]+)\/cancel$/)) && method === 'POST') {
      const item = find(match[1]), row = item.thinking?.find(row => row.turn_id === match![2])
      if (!row) return fail(404)
      if (thinkingScenario) return new Promise<Json>(() => { /* Simulate a lost cancellation response; no real work. */ })
      row.status = 'canceled'
      return { schemaVersion: 1 }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/thinking$/)) && method === 'GET') {
      const item = find(match[1])
      if (thinkingScenario && item.thinking?.[0]) item.thinking[0].status = 'canceled'
      return { schemaVersion: 1, session_id: item.id, content_status: 'available', results: item.thinking ?? [] }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)(?:\/messages\/([^/]+))?\/memory-delivery$/)) && method === 'GET') {
      const rows = find(match[1]).messages.filter(message => message.role === 'user' && (!match![2] || message.id === match![2]))
      if (match[2] && !rows.length) fail(404)
      return { schemaVersion: 1, session_id: match[1], content_status: 'available', results: rows.slice(-100).map(message => ({ message_id: message.id, ...deliveryFor(message, true) })), truncated: rows.length > 100 }
    }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/submissions$/))) return { results: [], next_cursor: null }
    if ((match = path.match(/^\/api\/pi\/sessions\/([^/]+)\/turns$/)) && method === 'POST') {
      const body = options.body ?? {}, key = match[1], prior = submissions.get(String(body.request_id))
      if (prior) return { submission: prior }
      const saved = composerDrafts.get(key)
      if (body.draft_revision !== undefined && (!saved || saved.revision !== body.draft_revision || saved.text !== body.text)) throw new GatewayError('http', 409, undefined, 'draft_changed')
      const result = await sendTurn(find(key), body), receipt = result.submission as Json
      Object.assign(receipt, { draft_revision: body.draft_revision ?? null, model_id: body.model_id ?? null, skill_ids: body.skill_ids ?? [], think: body.think ?? false, research_mode: body.research_mode ?? 'off' })
      if (saved && composerDrafts.get(key)?.revision === body.draft_revision) composerDrafts.set(key, { ...emptyComposerDraft(key), revision: Number(saved.revision) + 1, updated_at: now() })
      return result
    }
    if ((match = path.match(/^\/api\/pi\/turn-submissions\/([^/]+)\/cancel$/))) {
      const stream = streams.get(match[1]); if (stream) stream.stopped = true
      return { request_id: match[1], state: 'bound' }
    }
    if ((match = path.match(/^\/api\/pi\/turn-submissions\/([^/]+)$/))) return submissions.get(match[1]) ?? fail(404)
    if ((match = path.match(/^\/api\/pi\/turns\/([^/]+)\/usage$/)) && method === 'GET') {
      const owner = sessions.find(item => item.turns.some(turn => turn.id === match![1])) ?? fail(404)
      const turn = owner.turns.find(item => item.id === match![1])!
      const legacy = owner.id === previewSessions.sky
      const attempts = [
        { id: 'usage_01', lane: 'foreground', role: 'routing', provider_id: 'ollama-local', model_id: 'router', provider: 'ollama', model: 'qwen2.5:3b', actual_provider: 'ollama', actual_model: 'qwen2.5:3b', status: 'reported', failure_kind: null, started_at: Number(turn.started_at), ended_at: Number(turn.started_at) + 0.2, elapsed_ms: 200, input_tokens: 48, output_tokens: 8, cached_tokens: null, cost_usd: null },
        { id: 'usage_02', lane: 'foreground', role: 'answer', provider_id: 'ollama-local', model_id: 'talking', provider: 'ollama', model: 'qwen2.5:3b', actual_provider: 'ollama', actual_model: 'qwen2.5:3b', status: 'reported', failure_kind: null, started_at: Number(turn.started_at) + 0.2, ended_at: Number(turn.started_at) + 2.4, elapsed_ms: 2200, input_tokens: 230, output_tokens: 80, cached_tokens: 0, cost_usd: null },
        { id: 'usage_03', lane: 'thinking', role: 'thinking', provider_id: 'ollama-local', model_id: 'thinking', provider: 'ollama', model: 'qwen2.5:7b', actual_provider: null, actual_model: null, status: 'failed', failure_kind: 'preempted', started_at: Number(turn.started_at) + 0.4, ended_at: Number(turn.started_at) + 3, elapsed_ms: 2600, input_tokens: null, output_tokens: null, cached_tokens: null, cost_usd: null },
      ]
      const lane = (name: string) => {
        const rows = attempts.filter(row => row.lane === name), fields = ['input_tokens', 'output_tokens', 'cached_tokens', 'cost_usd', 'summed_call_ms'] as const
        const entries = fields.map(field => {
          const values = rows.map(row => field === 'summed_call_ms' ? row.elapsed_ms : row[field]), missing = values.filter(value => value === null).length
          return { field, known: values.reduce<number>((sum, value) => sum + (value ?? 0), 0), missing, complete: !legacy && missing === 0 }
        })
        return { attempt_count: rows.length, pending_count: 0, reported_count: rows.filter(row => row.status === 'reported').length, failed_count: rows.filter(row => row.status === 'failed').length,
          totals: Object.fromEntries(entries.map(row => [row.field, row.complete ? row.known : null])), known_subtotal: Object.fromEntries(entries.map(row => [row.field, row.known])), complete: Object.fromEntries(entries.map(row => [row.field, row.complete])), unknown_counts: Object.fromEntries(entries.map(row => [row.field, row.missing])) }
      }
      return { schemaVersion: 1, turn_id: turn.id, session_id: owner.id, content_status: 'available', scope: 'turn_provider_attempts', coverage: legacy ? 'legacy_partial' : 'complete', foreground: lane('foreground'), thinking: lane('thinking'), attempts, attempts_truncated: false }
    }
    if ((match = path.match(/^\/api\/pi\/turns\/([^/]+)\/resume$/))) {
      const owner = sessions.find(item => item.turns.some(turn => turn.id === match![1])) ?? fail(404)
      const turn = owner.turns.find(item => item.id === match![1])!
      const decided = approvals.find(item => item.id === turn.approval_request_id)
      if (turn.status === 'acted_no_reply' && turn.acted === 1) {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: 'The recorded action is complete. This is the missing reply; the action was not repeated.', created_at: now() })
        Object.assign(turn, { status: 'complete', ended_at: now() })
      } else if (turn.status === 'awaiting_approval' && decided?.status === 'approved') {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: 'Done. I sent the email to coach and will tell you when they reply.', created_at: now() })
        Object.assign(turn, { status: 'complete', acted: 1, ended_at: now() })
      } else if (turn.status === 'awaiting_approval' && decided && decided.status !== 'pending') {
        owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: "OK, I won't send it.", created_at: now() })
        Object.assign(turn, { status: 'complete', ended_at: now() })
      } else if (turn.status === 'outcome_unknown') { await new Promise(resolve => setTimeout(resolve, 1500)); if (globalThis.sessionStorage?.getItem('conker-fake-check') === 'done') { owner.messages.push({ id: nextId('msg'), session_id: owner.id, seq: owner.messages.length + 1, role: 'assistant', content: 'I checked with your tools: the action finished once. It was not sent again.', created_at: now() }); Object.assign(turn, { status: 'complete', acted: 1, ended_at: now(), action: { id: 'act_preview_outcome', state: 'completed', job_id: null } }) } } // Preview: a check stays unknown unless conker-fake-check is "done".
      return { turn_id: turn.id, session_id: owner.id, status: turn.status }
    }
    if ((match = path.match(/^\/api\/pi\/runs\/([^/]+)$/)) && method === 'GET') {
      const session = sessions.find(item => item.turns.some(turn => turn.id === match![1])) ?? fail(404)
      const turn = session.turns.find(turn => turn.id === match![1])!
      return { ...turn, acted: turn.acted === 1, task_ids: [], outputs: [], source: { kind: 'conversation', session_id: session.id }, provenance: 'recorded', content_status: 'available' }
    }
    if (path === '/api/pi/tasks' || path === '/api/pi/runs') return { results: [], next_cursor: null }
    if (path === '/api/pi/events') return { results: [], next_cursor: null }
    if (path === '/api/owner/requests') return { results: approvals, next_cursor: null }
    if ((match = path.match(/^\/api\/owner\/requests\/([^/]+)$/))) return approvals.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/owner\/requests\/([^/]+)\/decision$/))) {
      const item = approvals.find(row => row.id === match![1]) ?? fail(404)
      const status = String(options.body?.status)
      Object.assign(item, { status, updated_at: iso(now()), reviewable: false, unavailable_reason: 'already_decided', decision: { status, actor: 'owner', note: String(options.body?.note ?? ''), at: iso(now()) } }); continueAfterDecision(sessions, item, status, String(options.body?.note ?? ''), () => nextId('msg'), now)
      return item
    }
    if (path === '/api/pi/proposals') return { proposals: proposals.filter(item => item.state === 'open') }
    if ((match = path.match(/^\/api\/pi\/proposals\/([^/]+)\/decision$/))) {
      const item = proposals.find(row => row.id === match![1]) ?? fail(404)
      Object.assign(item, { state: { accept: 'accepted', decline: 'declined', never: 'never' }[String(options.body?.decision)], decidedAt: now() })
      return item
    }
    if ((match = path.match(/^\/api\/control\/pi\/sessions\/([^/]+)\/settings$/))) {
      const current = sessionSettings.get(match[1]) ?? { revision: 0, settings: { agentId: 'companion', privacy: { memoryDisabled: false, harnessDisabled: false } } }
      if (method === 'POST') {
        if (options.body?.expected_revision !== current.revision) fail(409)
        const saved = { revision: Number(current.revision) + 1, settings: options.body?.settings }
        sessionSettings.set(match[1], saved)
        return saved
      }
      return current
    }
    if (path === '/api/control/pi/agents' && method === 'GET') return { schemaVersion: 1, results: agents }
    if (path === '/api/control/pi/agents' && method === 'POST') {
      const created = agentProfile(`agent_${(++counter).toString(16).padStart(32, '0')}`, 'agent', String(options.body?.name), String(options.body?.role), String(options.body?.instructions))
      created.configuration = options.body ?? {}; agents.push(created); return created
    }
    if ((match = path.match(/^\/api\/control\/pi\/agents\/(companion|agent_[0-9a-f]{32})$/)) && method === 'GET') return agents.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/agents\/(companion|agent_[0-9a-f]{32})\/update$/)) && method === 'POST') {
      const item = agents.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision || item.archived_at !== null) fail(409)
      Object.assign(item, { revision: Number(item.revision) + 1, configuration: options.body?.configuration, updated_at: now(), change_kind: 'updated' })
      return item
    }
    if ((match = path.match(/^\/api\/control\/pi\/agents\/(agent_[0-9a-f]{32})\/archive$/)) && method === 'POST') {
      const item = agents.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision) fail(409)
      const archived = options.body?.archived === true
      Object.assign(item, { revision: Number(item.revision) + 1, archived_at: archived ? now() : null, updated_at: now(), change_kind: archived ? 'archived' : 'restored' })
      return item
    }
    if (path === '/api/control/pi/projects' && method === 'GET') return { schemaVersion: 1, results: projects, nextCursor: null }
    if (path === '/api/control/pi/projects' && method === 'POST') {
      const created = projectView(`project_${(++counter).toString(16).padStart(32, '0')}`, 1, options.body ?? {})
      projects.push(created)
      return created
    }
    if ((match = path.match(/^\/api\/control\/pi\/projects\/(project_[0-9a-f]{32})$/)) && method === 'GET') return projects.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/projects\/(project_[0-9a-f]{32})\/(update|archive|link|unlink)$/)) && method === 'POST') {
      const item = projects.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision) fail(409)
      const action = match[2]
      if (action === 'update') Object.assign(item, options.body?.fields)
      if (action === 'archive') item.archivedAt = options.body?.archived ? now() : null
      if (action === 'link') {
        const reference = options.body?.reference as Json, key = JSON.stringify(reference)
        if ((item.links as Json[]).some(link => JSON.stringify(link.reference) === key)) fail(409)
        const source = reference.kind === 'conversation' ? sessions.find(session => session.id === reference.sessionId) : null
        ;(item.links as Json[]).push({ reference, mode: 'live-reference', snapshot: { originSessionId: source?.id ?? previewSessions.week, linkedAt: now() }, availability: source ? 'available' : 'unavailable', label: source?.title ?? 'Unavailable source', labelSource: source ? 'live-source' : 'unavailable', privacy: source ? { memoryDisabled: false, harnessDisabled: false, incognito: false } : null })
      }
      if (action === 'unlink') {
        const key = JSON.stringify(options.body?.reference)
        item.links = (item.links as Json[]).filter(link => JSON.stringify(link.reference) !== key)
      }
      item.revision = Number(item.revision) + 1
      item.updatedAt = now()
      return item
    }
    if (path === '/api/control/pi/artifacts' && method === 'GET') return { schemaVersion: 1, results: artifacts.map(artifactSummary), nextCursor: null }
    if ((path === '/api/control/pi/artifacts' || path === '/api/control/pi/artifacts/from-message') && method === 'POST') {
      const copied = path.endsWith('/from-message'), title = String(options.body?.title ?? 'Untitled artifact')
      const content = copied
        ? { kind: 'markdown', text: sessions.flatMap(item => item.messages).find(item => item.id === options.body?.messageId)?.content ?? 'Copied response' }
        : options.body?.content as Json
      const created = artifactView(`artifact_${(++counter).toString(16).padStart(32, '0')}`, title, content)
      if (copied) Object.assign(created, {
        origin: 'conversation-copy', source: { sessionId: options.body?.sessionId, messageId: options.body?.messageId },
        privacy: { memoryDisabled: false, harnessDisabled: false, incognito: false },
      })
      artifacts.push(created)
      return created
    }
    if ((match = path.match(/^\/api\/control\/pi\/artifacts\/(artifact_[0-9a-f]{32})\/export$/)) && method === 'GET') {
      const item = artifacts.find(row => row.id === match![1]) ?? fail(404), versions = item.versions as Json[]
      const selected = versions.find(version => version.version === Number(options.query?.version ?? item.currentVersion)) ?? fail(404)
      const content = selected.content as Json, kind = String(content.kind)
      const text = kind === 'markdown' || kind === 'html' || kind === 'code' ? String(content.text) : JSON.stringify(content, null, 2)
      const mime = kind === 'table' ? 'text/csv;charset=utf-8' : ['chart', 'diagram', 'media'].includes(kind) ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'
      return { schemaVersion: 1, artifactId: item.id, version: selected.version, filename: 'artifact.txt', mime, text, provenance: 'pi', privateOrigin: item.privateOrigin, authority: 'none', contentIncluded: true, execution: 'not-wired' }
    }
    if ((match = path.match(/^\/api\/control\/pi\/artifacts\/(artifact_[0-9a-f]{32})$/)) && method === 'GET') return artifacts.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/artifacts\/(artifact_[0-9a-f]{32})\/(versions|restore|archive)$/)) && method === 'POST') {
      const item = artifacts.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision) fail(409)
      const versions = item.versions as Json[], action = match[2]
      if (action === 'archive') item.archivedAt = options.body?.archived ? iso(now()) : null
      else {
        const source = action === 'restore' ? versions.find(version => version.version === options.body?.version) ?? fail(404) : null
        const prior = versions.at(-1)!, number = Number(prior.version) + 1
        const next = action === 'restore'
          ? { ...structuredClone(source), version: number, createdAt: iso(now()), author: 'owner', note: `Restored version ${source!.version} as a new version.`, restoredFromVersion: source!.version }
          : { version: number, title: options.body?.title ?? item.title, content: options.body?.content, createdAt: iso(now()), author: 'owner', note: options.body?.note ?? 'Edited by owner.', citations: options.body?.preserveCitations ? prior.citations ?? [] : [] }
        versions.push(next)
        item.title = next.title
        item.versionCount = versions.length
        item.currentVersion = number
      }
      item.revision = Number(item.revision) + 1
      item.updatedAt = iso(now())
      return item
    }
    if (path.startsWith('/api/control/pi/jobs/agent') || path === '/api/owner/tool-settings' || path === '/api/owner/lockdown' || path.startsWith('/api/control/pi/change-requests') || path === '/api/control/pi/tool-drafts' || path.startsWith('/api/owner/editor-drafts') || path === '/api/control/pi/memory/remember' || path.startsWith('/api/control/pi/asks') || path.startsWith('/api/control/pi/owner/') || path.startsWith('/api/owner/access') || /^\/api\/owner\/tools\/[^/]+\/(?:sensitive|card|access)$/.test(path) || path === '/api/control/pi/access/handled' || path === '/api/owner/editor-capabilities' || /^\/api\/control\/pi\/jobs\/job_[0-9a-f]{32}\/(?:hook(\/revoke)?|adopt)$/.test(path)) return agentJobs(path, method, options.body, fail); seedAgentJobs(path); if (path === '/api/control/pi/jobs' && method === 'GET') return { schemaVersion: 1, results: jobs, nextCursor: null }
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})$/)) && method === 'GET') return jobs.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/runs$/)) && method === 'GET') return { schemaVersion: 1, results: jobRuns.get(match![1]) ?? [], nextCursor: null }
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/state$/)) && method === 'POST') {
      const item = jobs.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision) fail(409)
      const definition = item.definition as Json, enabled = options.body?.enabled === true
      definition.enabled = enabled; definition.state = enabled ? 'enabled' : 'paused'; item.revision = Number(item.revision) + 1; item.nextAt = now() + 3600
      return item
    }
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/run$/)) && method === 'POST') {
      const item = jobs.find(row => row.id === match![1]) ?? fail(404), requestId = String(options.body?.request_id)
      const old = manualJobRequests.get(requestId)
      if (old) return { ...old, replayed: true }
      const run: Json = { schemaVersion: 1, id: `scheduled_${(++counter).toString(16).padStart(32, '0')}`, jobId: item.id, jobRevision: item.revision, scheduledAt: now(), startedAt: now(), status: 'ready', manual: true, budgetBound: false, receiptRecorded: false, outcomeCode: null, authority: 'none', contentIncluded: false, execution: 'admitted-only' }
      ;(jobRuns.get(String(item.id)) ?? []).unshift(run); manualJobRequests.set(requestId, run)
      return { ...run, replayed: false }
    }
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/runs\/(scheduled_[0-9a-f]{32})\/(provision-budget|cancel|resume|reconcile)$/)) && method === 'POST') {
      const run = [...jobRuns.values()].flat().find(item => item.id === match![1]) ?? fail(404), action = match[2]
      if (action === 'cancel') { run.status = 'cancelled'; run.execution = 'resolved' }
      if (action === 'provision-budget') { run.status = 'ready'; run.budgetBound = true; run.execution = 'admitted-only' }
      if (action === 'resume') { run.status = 'dispatching'; run.execution = 'dispatched' }
      if (action === 'reconcile') { run.status = 'completed'; run.execution = 'resolved'; run.receiptRecorded = true; run.outcomeCode = 'COMPLETED' }
      return action === 'cancel' ? { ...run, replayed: false } : run
    }
    if (path === '/api/control/pi/characters/companion' && method === 'GET') {
      const selected = options.query?.revision === undefined ? characterRevision : Number(options.query.revision)
      return { agentId: 'companion', revision: selected, profile: characterVersions.get(selected) ?? fail(404) }
    }
    if (path === '/api/control/pi/characters/companion/history' && method === 'GET') return { results: characterHistory }
    if (path === '/api/control/pi/characters/companion/export' && method === 'GET') {
      const selected = options.query?.revision === undefined ? characterRevision : Number(options.query.revision)
      return { format: 'conker-character', version: 1, character: characterVersions.get(selected) ?? fail(404) }
    }
    if (path === '/api/control/pi/characters/companion/import' && method === 'POST') {
      let raw: Json
      try { raw = JSON.parse(String(options.body?.text ?? '')) as Json } catch { return fail(422) }
      if (raw.format !== 'conker-character' || raw.version !== 1 || !raw.character || typeof raw.character !== 'object') fail(422)
      return { profile: raw.character, note: 'Imported into a draft. Review, then save with the current revision.' }
    }
    if (path === '/api/control/pi/characters/companion/save' && method === 'POST') {
      if (Number(options.body?.expected_revision) !== characterRevision) fail(409)
      character = structuredClone(options.body?.profile as Json); characterRevision += 1
      characterVersions.set(characterRevision, structuredClone(character)); characterHistory.push({ revision: characterRevision, created_at: now(), restored_from: null })
      return { agentId: 'companion', revision: characterRevision, profile: character }
    }
    if (path === '/api/control/pi/system/inventory/configured/services' && method === 'GET') return {
      schemaVersion: 1, kind: 'services', status: 'configured', results: [{ id: `service_${'7'.repeat(64)}`, kind: 'service', name: 'system:conker-api.service' }],
      requiresApproval: true, observed: false, authority: 'none', contentIncluded: true, execution: 'not-triggered',
    }
    if (path === '/api/control/pi/system/inventory/configured/containers' && method === 'GET') return {
      schemaVersion: 1, kind: 'containers', status: 'configured', results: [{ id: `container_${'8'.repeat(64)}`, kind: 'container', name: null }],
      requiresApproval: true, observed: false, authority: 'none', contentIncluded: true, execution: 'not-triggered',
    }
    if (path === '/api/control/pi/system/inventory' && method === 'POST') {
      const requestId = String(options.body?.request_id)
      hostInventory = { schemaVersion: 1, requestId, state: 'complete', limit: Number(options.body?.limit ?? 100), approvalRequired: false, errorCode: null,
        observation: hostObservation(), receiptStatus: null, currentAgeSeconds: 0, createdAt: now(), updatedAt: now(), source: 'toolgate/system.inventory',
        refreshRequiresNewRequest: true, authority: 'none', contentIncluded: true, execution: 'read-only-observation' }
      return hostInventory
    }
    if ((match = path.match(/^\/api\/control\/pi\/system\/inventory\/([A-Za-z0-9_-]{16,100})(?:\/resume)?$/))) {
      if (!hostInventory || hostInventory.requestId !== match[1]) return fail(404)
      return hostInventory
    }
    if (path === '/api/control/pi/system/files/roots' && method === 'GET') return {
      schemaVersion: 1, mode: 'configured', code: null, roots: [{ id: 'project', path: '/workspace/conker' }],
      capabilities: { list: true, read: false, write: false }, authority: 'none', execution: 'directory-listing-only', contentIncluded: false,
    }
    if (path === '/api/control/pi/system/files/listings' && method === 'POST') {
      const requestId = String(options.body?.request_id), rootId = String(options.body?.root_id), relative = String(options.body?.path ?? ''), limit = Number(options.body?.limit ?? 200)
      fileListing = { schemaVersion: 1, requestId, state: 'complete', limit, rootId, path: relative, approvalRequired: false, errorCode: null,
        listing: sampleDirectory(rootId, relative), receiptStatus: null, currentAgeSeconds: 0, createdAt: now(), updatedAt: now(), source: 'toolgate/system.files-list',
        refreshRequiresNewRequest: true, authority: 'none', contentIncluded: false, execution: 'directory-listing-only' }
      return fileListing
    }
    if ((match = path.match(/^\/api\/control\/pi\/system\/files\/listings\/([A-Za-z0-9_-]{16,100})(?:\/resume)?$/))) {
      if (!fileListing || fileListing.requestId !== match[1]) return fail(404)
      return fileListing
    }
    if (path === '/api/control/pi/calls/browser/capabilities' && method === 'GET') return {
      schemaVersion: 1, typedTurns: true, language: 'en', speechInput: 'unconfigured', speechOutput: 'unconfigured', inputMimeTypes: ['audio/wav'], outputMimeTypes: ['audio/wav'], maxAudioBytes: 10485760, maxAudioSeconds: 120, camera: 'unavailable', perception: 'unavailable', rawMediaRetention: 'none', transcriptRetention: 'persisted-with-call-conversation', devices: 'client-owned; not captured by Pi', authority: 'none',
    }
    if ((match = path.match(/^\/api\/control\/pi\/calls\/browser\/active\/([A-Za-z0-9_-]{1,200})$/)) && method === 'GET') {
      if (!browserCall || browserCall.conversationId !== match[1] || browserCall.endedAt !== null) return fail(404)
      return browserCall
    }
    if (path === '/api/control/pi/calls/browser' && method === 'POST') {
      if (browserCall && browserCall.conversationId === options.body?.conversationId && browserCall.endedAt === null) return fail(409)
      browserCall = createBrowserCall(String(options.body?.conversationId))
      return browserCall
    }
    if ((match = path.match(/^\/api\/control\/pi\/calls\/browser\/(call_[a-f0-9]{32})(?:\/(update|interrupt|end|turns))?$/))) {
      if (!browserCall || browserCall.id !== match[1]) return fail(404)
      if (!match[2] && method === 'GET') return browserCall
      if (method !== 'POST') return fail(405)
      if (match[2] === 'turns') {
        const existing = (browserCall.requests as Json[]).find(item => item.requestId === options.body?.request_id)
        if (existing) return { schemaVersion: 1, call: browserCall, replayed: true, audioIncluded: false, transcriptionIncluded: false, execution: 'typed-turn' }
        const text = String(options.body?.text ?? '')
        ;(browserCall.events as Json[]).push(callEvent('user', text), callEvent('assistant', 'I’m here. Let’s keep this focused and work through it one step at a time.'))
        ;(browserCall.requests as Json[]).push({ requestId: options.body?.request_id, state: 'complete', inputKind: 'text', speechStatus: 'not-requested', errorCode: null, turnId: `turn_${(++counter).toString(16)}`, turnStatus: 'complete', textStatus: 'complete', acted: false, messageIds: [] })
        browserCall.contentIncluded = true
        return { schemaVersion: 1, call: browserCall, replayed: false, audioIncluded: false, transcriptionIncluded: false, execution: 'typed-turn' }
      }
      if (Number(options.body?.expected_revision) !== browserCall.revision) return fail(409)
      browserCall.revision = Number(browserCall.revision) + 1
      if (match[2] === 'update') {
        if (typeof options.body?.paused === 'boolean') browserCall.paused = options.body.paused
        if (options.body?.mode === 'focus' || options.body?.mode === 'character') browserCall.mode = options.body.mode
        if (options.body?.privacy) browserCall.privacy = structuredClone(options.body.privacy as Json)
        ;(browserCall.events as Json[]).push(callEvent('event', browserCall.paused ? 'Call paused' : 'Call preferences updated'))
      } else {
        browserCall.generation = Number(browserCall.generation) + 1
        if (match[2] === 'end') { browserCall.endedAt = now(); browserCall.phase = 'ended' }
        ;(browserCall.events as Json[]).push(callEvent('event', match[2] === 'end' ? 'Call ended' : 'Response interrupted; in-flight effects may still finish'))
      }
      return browserCall
    }
    if (path === '/api/control/pi/collaboration/teams' && method === 'GET') {
      const { definition, agentReferences, agentReferenceState, ...summary } = team
      void definition; void agentReferences; void agentReferenceState
      return { schemaVersion: 1, results: [{ ...summary, contentIncluded: false }], nextCursor: null }
    }
    if (path === '/api/control/pi/collaboration/teams' && method === 'POST') {
      team.id = `team_${(++counter).toString(16).padStart(32, '0')}`; team.revision = 1; team.name = options.body?.name; team.definition = structuredClone(options.body as Json); team.archived_at = null; team.created_at = team.updated_at = now(); teamVersions.clear(); teamVersions.set(1, structuredClone(team.definition as Json)); return team
    }
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})$/)) && method === 'GET') return team.id === match[1] ? team : fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})\/versions$/)) && method === 'GET') return { schemaVersion: 1, results: [...teamVersions.entries()].map(([revision, definition]) => ({ schemaVersion: 1, id: team.id, revision, name: definition.name, archived_at: revision === team.revision ? team.archived_at : null, created_at: team.created_at, updated_at: team.updated_at, authority: 'none', execution: 'configuration-only', contentIncluded: false, reference_validation: 'external-references-unverified' })), nextRevision: null }
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})\/versions\/([1-9][0-9]{0,9})$/)) && method === 'GET') { const revision = Number(match[2]), definition = teamVersions.get(revision) ?? fail(404); return { schemaVersion: 1, id: team.id, revision, name: definition.name, archived_at: null, created_at: team.created_at, updated_at: team.updated_at, authority: 'none', execution: 'configuration-only', contentIncluded: true, reference_validation: 'external-references-unverified', definition, historical: true } }
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})\/(update|archive|restore)$/)) && method === 'POST') {
      if (team.id !== match[1] || Number(options.body?.expected_revision) !== team.revision) fail(409)
      if (match[2] === 'update') { team.definition = structuredClone(options.body?.definition as Json); team.name = (team.definition as Json).name }
      else team.archived_at = match[2] === 'archive' ? now() : null
      team.revision = Number(team.revision) + 1; team.updated_at = now(); teamVersions.set(Number(team.revision), structuredClone(team.definition as Json)); return team
    }
    if (path === '/api/control/pi/characters/companion/restore' && method === 'POST') {
      if (Number(options.body?.expected_revision) !== characterRevision) fail(409)
      const selected = Number(options.body?.revision), prior = characterVersions.get(selected) ?? fail(404)
      character = structuredClone(prior); characterRevision += 1; characterVersions.set(characterRevision, structuredClone(character))
      characterHistory.push({ revision: characterRevision, created_at: now(), restored_from: selected })
      return { agentId: 'companion', revision: characterRevision, profile: character }
    }
    const setupHandledModels = setupHandle(path, method, options)
    if (setupHandledModels !== undefined) return setupHandledModels
    if ((path === '/api/host/chatgpt' || path === '/api/host/claude') && globalThis.sessionStorage?.getItem('conker-fake-subscription')) {
      const scenario = globalThis.sessionStorage.getItem('conker-fake-subscription')
      if (method === 'GET' && scenario === 'read-failure') return fail(503)
      if (method === 'GET' && scenario === 'read-timeout') return new Promise<Json>(() => { /* Isolated status deadline fixture. */ })
      if (method === 'GET' && scenario === 'slow-read') await new Promise(resolve => setTimeout(resolve, 5000))
      if (method === 'POST') {
        options.onDispatch?.()
        if (scenario === 'operation-timeout') return new Promise<Json>(() => { /* Isolated dispatch deadline fixture. */ })
        subscriptionStates.set(path, options.body?.operation === 'login' ? 'pending' : options.body?.operation === 'models' ? 'connected' : 'idle')
        if (scenario === 'lost-response') return fail(503)
      }
      const current = scenario === 'connected' ? 'connected' : subscriptionStates.get(path) ?? 'idle'
      const loginId = current === 'pending' ? `login_${'a'.repeat(32)}` : null
      const common = { available: true, connected: current === 'connected', loginId, loginState: loginId ? 'pending' : 'idle', credentialsIncluded: false }
      return path.endsWith('/chatgpt') ? { ...common, connectionId: common.connected ? `connection_${'a'.repeat(32)}` : null, plan: common.connected ? 'plus' : null, problem: null, models: [], catalogueComplete: false,
        deviceCode: method === 'POST' && options.body?.operation === 'login' ? { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' } : null,
      } : { ...common, runtime: 'Claude Code', models: [], authorizationUrl: loginId ? 'https://claude.ai/oauth/authorize' : null }
    }
    if (path.startsWith('/api/host/codex/sessions')) {
      const scenario = globalThis.sessionStorage?.getItem('conker-fake-codex-sessions'), envelope = { schemaVersion: 1, provider: 'codex', scope: 'saved_threads', runtimeVisibility: 'observer_only' }
      if (method !== 'GET') return fail(404)
      if (scenario === 'unavailable') return fail(503)
      if (scenario === 'timeout') return new Promise<Json>(() => { /* A development-only stalled read. */ })
      const sourceRows = scenario === 'long' ? codexRows.map((row, index) => index === 0 ? { ...row, name: null, preview: '😀'.repeat(500), previewTruncated: true, cwd: `C:/work/${'long-directory-'.repeat(18)}`, updatedAt: Number.MAX_SAFE_INTEGER } : row) : codexRows
      if (path === '/api/host/codex/sessions') {
        const archived = options.query?.archived === true, limit = Number(options.query?.limit ?? 25), cursor = options.query?.cursor
        if (scenario === 'page-error' && cursor) return fail(503)
        if (scenario === 'cursor-error' && cursor) return fail(422)
        if (cursor && cursor !== 'preview_page_2') return fail(422)
        const rows = scenario === 'empty' ? [] : archived ? sourceRows.slice(-2) : sourceRows, start = cursor ? 25 : 0
        return { ...envelope, archived, results: structuredClone(rows.slice(start, start + limit)), nextCursor: start + limit < rows.length ? 'preview_page_2' : null }
      }
      if (scenario === 'detail-error') return fail(404)
      const row = sourceRows.find(row => row.id === path.split('/')[5]) ?? fail(404)
      return { ...envelope, session: structuredClone(row) }
    }
    if (path.startsWith('/api/host/claude/sessions')) {
      const scenario = globalThis.sessionStorage?.getItem('conker-fake-native-sessions')
      if (scenario === 'unavailable') return fail(503)
      if (scenario === 'read-timeout' && method === 'GET') return new Promise<Json>(() => { /* Isolated read deadline. */ })
      const parts = path.split('/'), row = nativeRows.find(item => item.id === parts[5])
      if (path === '/api/host/claude/sessions') return { schemaVersion: 1, provider: 'claude', scope: 'background_sessions', results: scenario === 'empty' ? [] : structuredClone(nativeRows), truncated: false, omittedCount: 1 }
      if (!row) return fail(404)
      if (path.endsWith('/output')) return { schemaVersion: 1, provider: 'claude', id: row.id, identity: row.identity, text: 'Claude native output snapshot\nReviewing workspace files…\n<untrusted text remains plain text>\n', truncated: true, outputPersisted: false }
      if (path.endsWith('/stop') && method === 'POST') {
        options.onDispatch?.()
        if (options.body?.expectedIdentity !== row.identity) return fail(409)
        if (scenario === 'stop-timeout') return new Promise<Json>(() => { /* Isolated dispatched Stop deadline. */ })
        row.state = 'stopped'; row.processStatus = 'idle'; row.waitingFor = null; row.canStop = false
        if (scenario === 'lost-response') return fail(503)
        return { schemaVersion: 1, provider: 'claude', id: row.id, identity: row.identity, status: 'stop_requested', automaticReplay: false }
      }
      return { schemaVersion: 1, provider: 'claude', result: structuredClone(row) }
    }
    if (path === '/api/host/claude') return { available: false, connected: false, loginId: null, loginState: 'idle', authorizationUrl: null, credentialsIncluded: false, runtime: 'Claude Code', models: [] }
    if (path === '/api/host/chatgpt') {
      if (method !== 'GET') throw new GatewayError('dependency', 503)
      return { available: false, connected: false, connectionId: null, plan: null, loginId: null, loginState: 'idle', problem: 'runtime_unavailable', models: [], catalogueComplete: false, credentialsIncluded: false, deviceCode: null }
    }
    if (path === '/api/host/providers' || path === '/api/control/pi/plans/usage') return path === '/api/control/pi/plans/usage' ? fakePlanUsage(method, fail) : providerCredentials(method, options, fail)
    if (path === '/api/pi/models/auto-settings' && method === 'POST') {
      // Deterministic stand-in for the routing model: long or comparative asks are Hard; price-like asks research the web.
      const text = String(options.body?.text ?? ''), hard = text.length > 80 || /compare|best|plan|why/i.test(text), web = /price|latest|best|news|today|buy/i.test(text)
      return { complexity: hard ? 'hard' : 'easy', think: hard, research: web ? 'web' : 'off', reasons: { complexity: hard ? 'This needs careful comparison or planning.' : 'A short, direct question.', think: hard ? 'A background check of the trade-offs helps.' : 'No separate analysis needed.', research: web ? 'Current facts matter here.' : 'Answerable without the web.' }, modelId: 'jev-preview', configurationRevision: 1 }
    }
    if (path === '/api/pi/models') {
      const scenario = globalThis.sessionStorage?.getItem('conker-fake-fail')
      if (scenario === 'provider-readiness') return fail(503)
      if (scenario === 'provider-readiness-timeout') return new Promise<Json>(() => { /* Isolated timeout fixture; no provider request. */ })
      return { local: { provider: 'ollama', model: 'qwen2.5:3b', health: { status: 'ok' } }, direct: {}, hosted: { status: 'not_configured' } }
    }
    if (path === '/health') return { service: 'gateway', version: '0.1.0', status: 'ok', checked_at: iso(now()), age_seconds: 0,
      checks: { owner_login: { status: 'ok' }, runtime: { status: 'ok' }, owner_channel: { status: 'ok' } } }
    if (path === '/api/diagnostics') return {
      schemaVersion: 1, status: 'ok', generatedAt: iso(now()), summary: { attention: 0, ok: 7, optional: 1 },
      findings: [
        ['owner-login', 'access', 'Owner sign-in', 'ok', 'ok', 'Working normally.', null],
        ['runtime', 'services', 'Conker runtime', 'ok', 'ok', 'Working normally.', null],
        ['owner-channel', 'access', 'Approval control', 'ok', 'ok', 'Working normally.', null],
        ['store', 'services', 'Conversation storage', 'ok', 'ok', 'Working normally.', null],
        ['memory', 'services', 'Memory', 'ok', 'ok', 'Working normally.', null],
        ['local-model', 'models', 'Local answer model', 'ok', 'ok', 'Working normally.', null],
        ['hosted-model', 'models', 'Hosted answer model', 'optional', 'not_configured', 'Not configured; this capability is optional.', null],
        ['actions', 'services', 'Tool approvals', 'ok', 'ok', 'Working normally.', null],
      ].map(([id, area, label, status, observedStatus, detail, recovery]) => ({ id, area, label, status, observedStatus, detail, recovery })),
    }
    if (path === '/api/pi/health') return { service: 'pi', version: '0.4.0', status: 'ok', checked_at: iso(now()), age_seconds: 1,
      checks: { store: { status: 'ok' }, memory: { status: 'ok' }, local_provider: { status: 'ok' }, hosted_provider: { status: 'not_configured' }, action_boundary: { status: 'ok' } } }
    if (path === '/api/pi/tools') return { status: 'ok', results: [...tools, ...agentJobs(path, method, undefined, fail).results as Json[]] }
    const setupHandled = setupHandle(path, method, options)
    if (setupHandled !== undefined) return setupHandled
    const memoryHandled = memoryHandle(path, method, options)
    if (memoryHandled !== undefined) return memoryHandled
    return fail(404)
  }

  /** Server-sent preview stream, answered for the live chat's fetch. */
  function streamResponse(requestId: string): Response {
    const encoder = new TextEncoder()
    let sent = 0, seq = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise(resolve => setTimeout(resolve, 60))
        let stream = streams.get(requestId)
        for (let wait = 0; !stream && wait < 50; wait++) { await new Promise(resolve => setTimeout(resolve, 60)); stream = streams.get(requestId) }
        if (!stream) { controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n')); controller.close(); return }
        if (stream.text.length > sent) {
          const piece = stream.text.slice(sent); sent = stream.text.length
          controller.enqueue(encoder.encode(`id: ${++seq}\nevent: delta\ndata: ${JSON.stringify({ text: piece, seq })}\n\n`))
        }
        if (submissions.has(requestId)) { controller.enqueue(encoder.encode(`id: ${++seq}\nevent: done\ndata: {}\n\n`)); controller.close() }
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  const subscriptionVerificationEnabled = (path: string) => ['/api/host/chatgpt', '/api/host/claude'].includes(path) && !!globalThis.sessionStorage?.getItem('conker-fake-subscription')
  const credentialVerificationEnabled = (path: string) => path === '/api/host/providers' && !!globalThis.sessionStorage?.getItem('conker-fake-credentials')
  const nativeSessionVerificationEnabled = (path: string) => /^\/api\/host\/claude\/sessions\/[^/]+\/stop$/.test(path) && !!globalThis.sessionStorage?.getItem('conker-fake-native-sessions')
  const correctionVerificationEnabled = (path: string) => /^\/api\/control\/pi\/memory\/corrections(?:\/[A-Za-z0-9_-]+\/retry)?$/.test(path) && !!globalThis.sessionStorage?.getItem('conker-fake-correction')
  return { request, streamResponse, subscriptionVerificationEnabled, credentialVerificationEnabled, nativeSessionVerificationEnabled, correctionVerificationEnabled, hostVerificationEnabled: (path: string) => path === '/api/host/ops' }
}
