import { describe, expect, it } from 'vitest'
import {
  gatewayAgentSection,
  gatewayCommandDestinations,
  gatewayConversationLink,
  gatewayDestinations,
  gatewayPageNavigation,
  gatewaySidebarDestinations,
  gatewaySidebarGroups,
  gatewaySystemSection,
  gatewayViewTitle,
  resolveGatewayRoute,
} from '@/components/gateway/navigation'
import { HOME_CHART_DAYS, HOME_NEEDS_LIMIT, PLAN_NEAR_LIMIT, PLAN_STALE_MS, buildHome, earnedLine, summarizePlans } from '@/components/gateway/home-model'
import { RESUME_FALLBACK_CHATS, RESUME_LIMIT, buildResume, resumeAge, resumeChats, type ResumeInput } from '@/components/gateway/home-resume-model'

const hex = (character: string) => character.repeat(32)
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()

describe('gateway navigation', () => {
  it('keeps one destination per id, with the sidebar showing everything but "more"', () => {
    const ids = gatewayDestinations.map(item => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(gatewaySidebarDestinations.map(item => item.title)).toEqual(['Home', 'Inbox', 'Chats', 'Projects', 'Memory', 'Agents', 'Tools', 'Jobs', 'Server', 'Settings'])
    expect(gatewayCommandDestinations).toBe(gatewayDestinations)
    expect(gatewaySidebarGroups.map(group => group.label)).toEqual(['Overview', 'Workspace', 'Server'])
  })

  it('resolves exact, trailing-slash and detail paths, and refuses the rest', () => {
    expect(resolveGatewayRoute('/')).toBe('today')
    expect(resolveGatewayRoute('/companion')).toBe('chat')
    expect(resolveGatewayRoute('/settings/companion/')).toBe('companion-settings')
    expect(resolveGatewayRoute(`/projects/project_${hex('a')}`)).toBe('projects')
    expect(resolveGatewayRoute(`/artifacts/artifact_${hex('a')}`)).toBe('artifacts')
    expect(resolveGatewayRoute(`/jobs/job_${hex('a')}/`)).toBe('jobs')
    expect(resolveGatewayRoute(`/agents/agent_${hex('a')}/edit`)).toBe('agents')
    expect(resolveGatewayRoute('/projects/project_short')).toBeNull()
    expect(resolveGatewayRoute('/nowhere')).toBeNull()
    expect(resolveGatewayRoute(`/jobs/job_${hex('A')}`)).toBeNull()
  })

  it('names a page and lists its sections', () => {
    const runs = gatewayPageNavigation('/activity', '?tab=runs')
    expect(runs.route).toBe('activity')
    expect(runs.title).toBe('Runs')
    expect(runs.activeSection).toBe('runs')
    expect(runs.sections).toEqual([
      { value: 'tasks', label: 'Tasks', to: '/activity', badge: undefined },
      { value: 'runs', label: 'Runs', to: '/activity?tab=runs', badge: undefined },
      { value: 'events', label: 'Activity log', to: '/activity?tab=events', badge: undefined },
    ])
    const first = gatewayPageNavigation('/activity', '')
    expect(first.activeSection).toBe('tasks')
    expect(first.title).toBe('Tasks')
    expect(gatewayPageNavigation('/activity', '?tab=bogus').activeSection).toBe('tasks')
  })

  it('keeps other query parameters when moving between sections', () => {
    const page = gatewayPageNavigation('/agents', '?tab=skills&q=x')
    expect(page.sections.map(section => section.to)).toEqual(['/agents?q=x', '/agents?tab=teams&q=x', '/agents?tab=skills&q=x', '/agents?tab=templates&q=x'])
  })

  it('lights up the parent section for a page that opens from it', () => {
    const containers = gatewayPageNavigation('/system', '?tab=containers')
    expect(containers.activeSection).toBe('services')
    expect(containers.title).toBe('Containers')
    expect(containers.sections.map(section => section.value)).not.toContain('containers')
  })

  it('titles special pages', () => {
    expect(gatewayPageNavigation('/chat', '?session=s1').title).toBe('Chat')
    expect(gatewayPageNavigation('/chat', '').title).toBe('New chat')
    expect(gatewayPageNavigation(`/agents/agent_${hex('a')}/edit`, '').title).toBe('Edit agent')
    expect(gatewayPageNavigation('/agents', '').title).toBe('Agents')
    expect(gatewayPageNavigation('/tools', '?draft=d1').title).toBe('Workflow')
    expect(gatewayPageNavigation('/tools', '?view=mcp').title).toBe('MCP servers')
    expect(gatewayPageNavigation('/tools', '').title).toBe('Tools')
    expect(gatewayPageNavigation('/overview', '').title).toBe('Home')
  })

  it('falls back to Conker with no sections for an unknown page', () => {
    const page = gatewayPageNavigation('/nowhere', '?tab=runs')
    expect(page).toEqual({ route: null, destination: undefined, title: 'Conker', activeSection: undefined, sections: [] })
  })

  it('titles a view by its section when one is asked for', () => {
    expect(gatewayViewTitle('/system', '?tab=backups')).toBe('Backups')
    expect(gatewayViewTitle('/system', '?tab=nope')).toBe('Server')
    expect(gatewayViewTitle('/settings', '')).toBe('Settings')
  })

  it('links to a chat and optionally a message, encoded', () => {
    expect(gatewayConversationLink('a b')).toBe('/chat?session=a%20b')
    expect(gatewayConversationLink('s&1', 'm/2')).toBe('/chat?session=s%261&message=m%2F2')
  })

  it('reads the system and agent tabs, defaulting safely', () => {
    expect(gatewaySystemSection('?tab=files')).toBe('files')
    expect(gatewaySystemSection('?tab=native-sessions')).toBe('native-sessions')
    expect(gatewaySystemSection('?tab=hax')).toBe('overview')
    expect(gatewaySystemSection('')).toBe('overview')
    expect(gatewayAgentSection('?tab=teams')).toBe('teams')
    expect(gatewayAgentSection('?tab=skills')).toBe('skills')
    expect(gatewayAgentSection('?tab=templates')).toBe('templates')
    expect(gatewayAgentSection('?tab=other')).toBe('agents')
  })
})

describe('buildHome', () => {
  const now = at(20)
  const request = (extra: Record<string, unknown> = {}) => ({
    id: 'r1',
    status: 'pending',
    reviewable: true,
    title: 'Send the email',
    details: 'To Ada',
    actor: 'Agent',
    updatedAt: new Date(at(20, 9)).toISOString(),
    decision: null,
    ...extra,
  })
  const proposal = (extra: Record<string, unknown> = {}) => ({ id: 'p1', title: 'Idea', suggestion: 'Try this', state: 'open', createdAt: at(20, 8) / 1000, decidedAt: null, ...extra })
  const run = (endedAt: string | null, startedAt: string) => ({ endedAt, startedAt })
  const empty = { requests: [], proposals: [], tasks: [], runs: [], jobs: [], runsComplete: true }
  const build = (input: Record<string, unknown>, limit?: number) => buildHome({ ...empty, ...input } as never, now, limit)

  it('is empty when the server returned nothing', () => {
    const home = build({})
    expect(home).toMatchObject({ needs: [], needsTotal: 0, decidedToday: 0, runsToday: 0, runDaysPartial: false, coming: [], completed: [] })
    expect(home.runDays).toHaveLength(HOME_CHART_DAYS)
    expect(home.runDays.at(-1)?.day).toBe(at(20, 0))
  })

  it('puts decisions before ideas and writes plain titles for missing words', () => {
    const home = build({
      requests: [
        request({ id: 'old', updatedAt: new Date(at(19)).toISOString() }),
        request({ id: 'new' }),
        request({ id: 'bare', title: '', details: '', updatedAt: new Date(at(20, 11)).toISOString() }),
        request({ id: 'done', status: 'approved' }),
        request({ id: 'locked', reviewable: false }),
      ],
      proposals: [proposal({ id: 'early', createdAt: at(18) / 1000 }), proposal(), proposal({ id: 'closed', state: 'accepted' })],
    })
    expect(home.needs.map(item => item.id)).toEqual(['bare', 'new', 'old'].slice(0, HOME_NEEDS_LIMIT))
    expect(home.needsTotal).toBe(5)
    expect(home.needs[0]).toMatchObject({ kind: 'decision', title: 'Review this action', detail: 'Agent is waiting for your decision.', href: '/inbox?request=bare' })
    const all = build({ requests: [request({ id: 'a b' })], proposals: [proposal()] }, 5)
    expect(all.needs.map(item => [item.kind, item.href])).toEqual([
      ['decision', '/inbox?request=a%20b'],
      ['idea', '/inbox'],
    ])
    expect(all.needs[1]).toMatchObject({ title: 'Idea', detail: 'Try this', at: at(20, 8) })
  })

  it('counts what was decided today', () => {
    const home = build({
      requests: [
        request({ id: 'a', status: 'approved', decision: { status: 'approved', at: new Date(at(20, 10)).toISOString() } }),
        request({ id: 'b', decision: { status: 'pending', at: new Date(at(20, 10)).toISOString() } }),
        request({ id: 'c', decision: { status: 'denied', at: new Date(at(19, 10)).toISOString() } }),
      ],
      proposals: [proposal({ state: 'accepted', decidedAt: at(20, 7) / 1000 }), proposal({ id: 'p2', state: 'declined', decidedAt: at(10) / 1000 })],
    })
    expect(home.decidedToday).toBe(2)
  })

  it('charts runs per day and says when early days may be short', () => {
    const runs = [
      run(new Date(at(20, 9)).toISOString(), new Date(at(20, 8)).toISOString()),
      run(new Date(at(20, 10)).toISOString(), new Date(at(19, 8)).toISOString()),
      run(null, new Date(at(18, 1)).toISOString()),
      run(new Date(at(2)).toISOString(), new Date(at(2)).toISOString()),
    ]
    const home = build({ runs })
    expect(home.runsToday).toBe(2)
    expect(home.runDays.reduce((sum, item) => sum + item.count, 0)).toBe(2)
    expect(home.runDaysPartial).toBe(false)
    expect(build({ runs: [run(null, new Date(at(19)).toISOString())], runsComplete: false }).runDaysPartial).toBe(true)
    expect(build({ runs: [run(null, new Date(at(1)).toISOString())], runsComplete: false }).runDaysPartial).toBe(false)
    expect(build({ runs: [], runsComplete: false }).runDaysPartial).toBe(true)
  })

  it('lists the next enabled jobs, soonest first, at most three', () => {
    const job = (id: string, nextAt: number, enabled = true) => ({ id, nextAt, definition: { enabled, name: `Job ${id}` } })
    const home = build({ jobs: [job('late', 400), job('off', 100, false), job('soon', 100), job('nan', Number.NaN), job('mid', 200), job('later', 300)] })
    expect(home.coming).toEqual([
      { id: 'soon', name: 'Job soon', at: 100000 },
      { id: 'mid', name: 'Job mid', at: 200000 },
      { id: 'later', name: 'Job later', at: 300000 },
    ])
  })

  it('lists completed tasks, newest first, at most five', () => {
    const task = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      outcome: `Did ${id}`,
      status: 'completed',
      contentStatus: 'available',
      archivedAt: null,
      updatedAt: new Date(at(20, Number(id.length) + 1)).toISOString(),
      ...extra,
    })
    const tasks = [
      task('a'),
      task('bb'),
      task('ccc', { updatedAt: new Date(at(19)).toISOString() }),
      task('hidden', { contentStatus: 'redacted' }),
      task('old', { archivedAt: 'x' }),
      task('open', { status: 'in_progress' }),
      task('d4'),
      task('e5'),
      task('f6'),
      task('g7'),
    ]
    const home = build({ tasks })
    expect(home.completed).toHaveLength(5)
    expect(home.completed.map(item => item.id)).not.toContain('hidden')
    expect(home.completed.map(item => item.id)).not.toContain('old')
    expect(home.completed.map(item => item.id)).not.toContain('open')
    expect(home.completed[0]).toMatchObject({ title: expect.stringMatching(/^Did /), today: true })
    expect(build({ tasks: [task('ccc', { updatedAt: new Date(at(19)).toISOString() })] }).completed[0].today).toBe(false)
  })
})

describe('earnedLine', () => {
  it('says nothing until something was decided', () => expect(earnedLine(0, 5)).toBeNull())
  it('names the owner’s part first, then Conker’s', () => {
    expect(earnedLine(1, 0)).toBe('You decided 1 thing today.')
    expect(earnedLine(2, 0)).toBe('You decided 2 things today.')
    expect(earnedLine(1, 1)).toBe('You decided 1 thing today, and Conker ran 1 time.')
    expect(earnedLine(3, 4)).toBe('You decided 3 things today, and Conker ran 4 times.')
  })
})

describe('summarizePlans', () => {
  const now = at(20)
  const window = (provider: 'chatgpt' | 'claude', label: string, usedPercent: number, resetsAt: string | null, checkedAt: number) => ({ provider, window: label.toLowerCase(), label, usedPercent, resetsAt, checkedAt })

  it('shows Claude first and marks windows near their limit', () => {
    const state = summarizePlans({ windows: [window('chatgpt', 'Weekly', 10, null, now / 1000), window('claude', '5 hour', PLAN_NEAR_LIMIT, new Date(now + 1000).toISOString(), now / 1000)] }, now)
    expect(state).toMatchObject({ status: 'ready', stale: false, checkedAt: now })
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.rows.map(row => [row.name, row.near, row.key])).toEqual([
      ['Claude 5 hour', true, 'claude:5 hour'],
      ['ChatGPT Weekly', false, 'chatgpt:weekly'],
    ])
    expect(state.rows[0].resetsAt).toBe(now + 1000)
  })

  it('ignores a reset time that is past or unreadable', () => {
    const state = summarizePlans({ windows: [window('claude', 'A', 1, new Date(now - 1).toISOString(), 1), window('claude', 'B', 1, 'soon', 1)] }, now)
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.rows.map(row => row.resetsAt)).toEqual([null, null])
  })

  it('judges staleness by the oldest check', () => {
    const fresh = now / 1000
    const old = (now - PLAN_STALE_MS - 1000) / 1000
    expect(summarizePlans({ windows: [window('claude', 'A', 1, null, fresh), window('claude', 'B', 1, null, old)] }, now)).toMatchObject({ stale: true, checkedAt: old * 1000 })
    expect(summarizePlans({ windows: [] }, now)).toEqual({ status: 'ready', rows: [], checkedAt: null, stale: false })
  })
})

describe('resume', () => {
  const now = at(20)
  const chat = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Chat ${id}`,
    titleTruncated: false,
    forgotten: false,
    archivedAt: null,
    trashedAt: null,
    createdAt: new Date(at(1 + Number(id.replace(/\D/g, '') || 0))).toISOString(),
    ...extra,
  })
  const base: ResumeInput = { editorDrafts: [], chats: [], opened: [], messageDrafts: [], tasks: [] }

  it('offers opened chats that are still listed, else the newest few', () => {
    const chats = [chat('c1'), chat('c2'), chat('c3'), chat('c4'), chat('c5', { forgotten: true }), chat('c6', { archivedAt: 'x' }), chat('c7', { trashedAt: 'x' })] as never
    expect(
      resumeChats(chats, [
        { id: 'c5', at: 9 },
        { id: 'c2', at: 8 },
        { id: 'zz', at: 7 },
        { id: 'c1', at: 6 },
      ]).map(item => [item.chat.id, item.at]),
    ).toEqual([
      ['c2', 8],
      ['c1', 6],
    ])
    const fallback = resumeChats(chats, [])
    expect(fallback.map(item => item.chat.id)).toEqual(['c4', 'c3', 'c2'])
    expect(fallback).toHaveLength(RESUME_FALLBACK_CHATS)
    expect(resumeChats([chat('x1', { createdAt: 'garbage' })] as never, [])[0].at).toBe(0)
    const many = Array.from({ length: 9 }, (_, index) => chat(`m${index}`))
    expect(
      resumeChats(
        many as never,
        many.map((item, index) => ({ id: item.id, at: index })),
      ),
    ).toHaveLength(RESUME_LIMIT)
  })

  it('builds one newest-first list from drafts, messages, chats and tasks', () => {
    const items = buildResume(
      {
        editorDrafts: [
          { id: 'd 1', name: 'Mailer', kind: 'connector', revision: 3, updatedAt: new Date(at(19)).toISOString(), publishedRevision: 2 },
          { id: 'd2', name: 'Flow', kind: 'workflow', revision: 1, updatedAt: new Date(at(18)).toISOString(), publishedRevision: null },
          { id: 'd3', name: 'Unknown', kind: 'connector', revision: 1, updatedAt: 'garbage', publishedRevision: undefined },
          { id: 'd4', name: 'Published', kind: 'connector', revision: 1, updatedAt: new Date(at(19)).toISOString(), publishedRevision: 1 },
        ],
        chats: [chat('c1', { title: '', createdAt: new Date(at(5)).toISOString() }), chat('c2', { title: 'Cut', titleTruncated: true })] as never,
        opened: [
          { id: 'c1', at: at(17) },
          { id: 'c2', at: at(16) },
        ],
        messageDrafts: [
          { sessionId: 'c2', text: 'hello', updatedAt: at(20, 9) / 1000 },
          { sessionId: 'c1', text: '   ', updatedAt: at(20, 9) / 1000 },
          { sessionId: null, text: `  ${'long '.repeat(30)}\nsecond line`, updatedAt: null },
        ],
        tasks: [
          { id: 't 1', outcome: 'Write', status: 'in_progress', contentStatus: 'available', archivedAt: null, updatedAt: new Date(at(15)).toISOString() },
          { id: 't2', outcome: 'Fix', status: 'blocked', contentStatus: 'available', archivedAt: null, updatedAt: new Date(at(14)).toISOString() },
          { id: 't3', outcome: 'Done', status: 'completed', contentStatus: 'available', archivedAt: null, updatedAt: new Date(at(14)).toISOString() },
          { id: 't4', outcome: 'Hidden', status: 'in_progress', contentStatus: 'redacted', archivedAt: null, updatedAt: new Date(at(14)).toISOString() },
          { id: 't5', outcome: 'Archived', status: 'in_progress', contentStatus: 'available', archivedAt: 'x', updatedAt: new Date(at(14)).toISOString() },
        ],
      } as never,
      20,
    )
    expect(items.map(item => [item.key, item.kind, item.title, item.label, item.href])).toEqual([
      ['chat:c2', 'message-draft', 'Cut…', 'Unsent message', '/chat?session=c2'],
      ['editor:d 1', 'tool-draft', 'Mailer', 'Tool draft', '/tools?draft=d%201'],
      ['editor:d2', 'workflow-draft', 'Flow', 'Workflow draft', '/tools?draft=d2'],
      ['chat:c1', 'chat', 'Untitled chat', 'Chat', '/chat?session=c1'],
      ['task:t 1', 'task', 'Write', 'Task in progress', '/activity?tab=tasks&task=t%201'],
      ['task:t2', 'task', 'Fix', 'Task · blocked', '/activity?tab=tasks&task=t2'],
      ['chat:new', 'message-draft', `${'long '.repeat(30).trim().slice(0, 79)}…`, 'Unsent message', '/chat'],
      ['editor:d3', 'tool-draft', 'Unknown', 'Tool draft', '/tools?draft=d3'],
    ])
  })

  it('limits the list and breaks ties by key', () => {
    const drafts = ['b', 'a', 'c'].map(id => ({ id, name: id, kind: 'connector', revision: 1, updatedAt: new Date(at(10)).toISOString(), publishedRevision: null }))
    expect(buildResume({ ...base, editorDrafts: drafts } as never, 2).map(item => item.key)).toEqual(['editor:a', 'editor:b'])
    expect(buildResume(base)).toEqual([])
  })

  it('writes how long ago in plain words', () => {
    expect(resumeAge(0, now)).toBe('Earlier')
    expect(resumeAge(now - 30_000, now)).toBe('Just now')
    expect(resumeAge(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(resumeAge(at(20, 7), at(20, 12))).toBe('5 h ago')
    expect(resumeAge(at(19, 23), at(20, 8))).toBe('Yesterday')
    expect(resumeAge(at(10), now)).toBe(new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(at(10)))
  })
})
