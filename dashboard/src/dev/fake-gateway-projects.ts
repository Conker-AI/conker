/**
 * Development-only projects and artifacts for the preview, in the shapes the real projects and
 * artifacts clients parse. Writes check the expected revision like Pi does.
 */
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean | readonly string[]> }

export function createFakeProjects(now: () => number, iso: (seconds: number) => string, fail: (status: number) => never, next: () => number, sessions: FakeChatStore['sessions'], weekSessionId: string) {
  const projectView = (id: string, revision: number, fields: Json, links: Json[] = [], archivedAt: number | null = null): Json => ({
    schemaVersion: 1,
    id,
    revision,
    ...fields,
    createdAt: now() - 5400,
    updatedAt: now() - 900,
    archivedAt,
    links,
    authority: 'none',
    contentIncluded: false,
    grantsInherited: false,
  })
  const projects: Json[] = [
    projectView(
      `project_${'2'.repeat(32)}`,
      1,
      {
        name: 'School and judo',
        description: 'Plans, deadlines, and training commitments that shape the week.',
        instructions: 'Keep school deadlines realistic around Tuesday and Thursday training. Prefer short morning study blocks.',
      },
      [
        {
          reference: { kind: 'conversation', sessionId: weekSessionId },
          mode: 'live-reference',
          snapshot: { originSessionId: weekSessionId, linkedAt: now() - 3600 },
          availability: 'available',
          label: 'Plan my week',
          labelSource: 'live-source',
          privacy: { memoryDisabled: false, harnessDisabled: false, incognito: false },
        },
      ],
    ),
  ]
  const artifactView = (id: string, title: string, content: Json, createdAt = iso(now() - 4200)): Json => ({
    schemaVersion: 1,
    id,
    title,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    provenance: 'pi',
    origin: 'owner-authored',
    source: null,
    task: null,
    availability: 'available',
    privacy: null,
    privateOrigin: false,
    taskAvailability: 'none',
    authority: 'none',
    execution: 'not-wired',
    contentIncluded: true,
    versionCount: 1,
    currentVersion: 1,
    versions: [{ version: 1, title, content, createdAt, author: 'owner', note: 'Created by owner.', citations: [] }],
  })
  const artifacts: Json[] = [
    artifactView(`artifact_${'3'.repeat(32)}`, 'Weekly plan', {
      kind: 'markdown',
      text: '# This week\n\n- Finish the physics worksheet by Friday.\n- Keep Tuesday and Thursday homework light around judo.\n- Use one short morning revision block.',
    }),
  ]
  const artifactSummary = (item: Json): Json => {
    const { versions, ...summary } = item
    void versions
    return { ...summary, contentIncluded: false }
  }

  function handle(path: string, method: string, options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/control/pi/projects' && method === 'GET') return { schemaVersion: 1, results: projects, nextCursor: null }
    if (path === '/api/control/pi/projects' && method === 'POST') {
      const created = projectView(`project_${next().toString(16).padStart(32, '0')}`, 1, options.body ?? {})
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
        const reference = options.body?.reference as Json,
          key = JSON.stringify(reference)
        if ((item.links as Json[]).some(link => JSON.stringify(link.reference) === key)) fail(409)
        const source = reference.kind === 'conversation' ? sessions.find(session => session.id === reference.sessionId) : null
        ;(item.links as Json[]).push({
          reference,
          mode: 'live-reference',
          snapshot: { originSessionId: source?.id ?? weekSessionId, linkedAt: now() },
          availability: source ? 'available' : 'unavailable',
          label: source?.title ?? 'Unavailable source',
          labelSource: source ? 'live-source' : 'unavailable',
          privacy: source ? { memoryDisabled: false, harnessDisabled: false, incognito: false } : null,
        })
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
      const copied = path.endsWith('/from-message'),
        title = String(options.body?.title ?? 'Untitled artifact')
      const content = copied ? { kind: 'markdown', text: sessions.flatMap(item => item.messages).find(item => item.id === options.body?.messageId)?.content ?? 'Copied response' } : (options.body?.content as Json)
      const created = artifactView(`artifact_${next().toString(16).padStart(32, '0')}`, title, content)
      if (copied)
        Object.assign(created, {
          origin: 'conversation-copy',
          source: { sessionId: options.body?.sessionId, messageId: options.body?.messageId },
          privacy: { memoryDisabled: false, harnessDisabled: false, incognito: false },
        })
      artifacts.push(created)
      return created
    }
    if ((match = path.match(/^\/api\/control\/pi\/artifacts\/(artifact_[0-9a-f]{32})\/export$/)) && method === 'GET') {
      const item = artifacts.find(row => row.id === match![1]) ?? fail(404),
        versions = item.versions as Json[]
      const selected = versions.find(version => version.version === Number(options.query?.version ?? item.currentVersion)) ?? fail(404)
      const content = selected.content as Json,
        kind = String(content.kind)
      const text = kind === 'markdown' || kind === 'html' || kind === 'code' ? String(content.text) : JSON.stringify(content, null, 2)
      const mime = kind === 'table' ? 'text/csv;charset=utf-8' : ['chart', 'diagram', 'media'].includes(kind) ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'
      return { schemaVersion: 1, artifactId: item.id, version: selected.version, filename: 'artifact.txt', mime, text, provenance: 'pi', privateOrigin: item.privateOrigin, authority: 'none', contentIncluded: true, execution: 'not-wired' }
    }
    if ((match = path.match(/^\/api\/control\/pi\/artifacts\/(artifact_[0-9a-f]{32})$/)) && method === 'GET') return artifacts.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/artifacts\/(artifact_[0-9a-f]{32})\/(versions|restore|archive)$/)) && method === 'POST') {
      const item = artifacts.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision) fail(409)
      const versions = item.versions as Json[],
        action = match[2]
      if (action === 'archive') item.archivedAt = options.body?.archived ? iso(now()) : null
      else {
        const source = action === 'restore' ? (versions.find(version => version.version === options.body?.version) ?? fail(404)) : null
        const prior = versions.at(-1)!,
          number = Number(prior.version) + 1
        const next =
          action === 'restore'
            ? { ...structuredClone(source), version: number, createdAt: iso(now()), author: 'owner', note: `Restored version ${source!.version} as a new version.`, restoredFromVersion: source!.version }
            : {
                version: number,
                title: options.body?.title ?? item.title,
                content: options.body?.content,
                createdAt: iso(now()),
                author: 'owner',
                note: options.body?.note ?? 'Edited by owner.',
                citations: options.body?.preserveCitations ? (prior.citations ?? []) : [],
              }
        versions.push(next)
        item.title = next.title
        item.versionCount = versions.length
        item.currentVersion = number
      }
      item.revision = Number(item.revision) + 1
      item.updatedAt = iso(now())
      return item
    }
    return undefined
  }
  return { handle, projects, artifacts }
}
