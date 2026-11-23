/**
 * Development-only search for the preview: exact text over the preview's chats, memories, projects,
 * artifacts, agents, tools and jobs, with settings kept in local storage. Semantic search stays off.
 */
import { searchSources, type SearchResult, type SearchSettings } from '@/lib/gateway/search'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean | readonly string[]> }
type Sources = {
  sessions: FakeChatStore['sessions']
  sessionSettings: Map<string, Json>
  memories: { id: string; type: string; title: string; preview: string }[]
  projects: Json[]
  artifacts: Json[]
  agents: Json[]
  tools: { id: string; name: string; description: string }[]
  jobs: Json[]
}

export function createFakeSearch(fail: (status: number) => never, { sessions, sessionSettings, memories, projects, artifacts, agents, tools, jobs }: Sources) {
  let searchSettings: SearchSettings = { revision: 0, configuration: { sources: [...searchSources], exactText: true, semantic: false, reranking: false } }
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem('conker-preview-search-settings') ?? 'null') as SearchSettings | null
    if (
      value &&
      Number.isInteger(value.revision) &&
      value.revision >= 0 &&
      Array.isArray(value.configuration?.sources) &&
      value.configuration.sources.every(source => searchSources.includes(source)) &&
      typeof value.configuration.exactText === 'boolean'
    )
      searchSettings = { revision: value.revision, configuration: { ...value.configuration, semantic: false, reranking: false } }
  } catch {
    /* Preview preferences are optional; malformed storage uses safe defaults. */
  }

  function handle(path: string, method: string, options: Request): Json | undefined {
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
      const query = String(options.query?.q ?? '')
          .trim()
          .toLocaleLowerCase(),
        stage = String(options.query?.stage ?? 'metadata')
      const results: SearchResult[] = []
      const add = (source: SearchResult['source'], recordId: string, title: string, text: string, href: string, role: SearchResult['role'] = null) => {
        if (!searchSettings.configuration.sources.includes(source) || !query || !(stage === 'text' ? text : `${title}\n${text}`).toLocaleLowerCase().includes(query)) return
        const position = Math.max(0, text.toLocaleLowerCase().indexOf(query) - 80)
        results.push({ id: `${source}:${recordId}:${stage}`, source, recordId, title, excerpt: text.slice(position, position + 400), href, role, matchType: stage === 'text' ? 'text' : 'metadata' })
      }
      if (stage === 'metadata' || (stage === 'text' && searchSettings.configuration.exactText)) {
        for (const session of sessions) {
          const privacy = (sessionSettings.get(session.id)?.settings as Json | undefined)?.privacy as Json | undefined
          if (privacy?.memoryDisabled || privacy?.harnessDisabled) continue
          if (stage === 'text')
            for (const message of session.messages)
              if (message.role !== 'tool') add('conversations', message.id, session.title, message.content, `/chat?session=${session.id}&message=${message.id}`, message.role)
              else add('conversations', session.id, session.title, '', `/chat?session=${session.id}`)
        }
        for (const item of memories) add('memory', item.id, item.title, item.preview, `/memory?view=database&record=${item.id}&kind=${item.type}`)
        for (const item of projects) add('projects', String(item.id), String(item.name), String(stage === 'text' ? item.instructions : item.description), `/projects/${item.id}`)
        for (const item of artifacts) {
          const versions = item.versions as Json[],
            body = versions[versions.length - 1]?.content as Json
          if (item.availability === 'available' && !item.privateOrigin)
            add('artifacts', String(item.id), String(item.title), stage === 'text' && ['markdown', 'code'].includes(String(body?.kind)) ? String(body.text) : '', `/artifacts/${item.id}`)
        }
        for (const item of agents) {
          const config = item.configuration as Json
          add('agents', String(item.id), String(config.name), String(stage === 'text' ? config.instructions : config.role), item.id === 'companion' ? '/settings/companion?tab=harness' : `/agents/${item.id}/edit`)
        }
        for (const item of tools) add('tools', item.id, item.name, item.description, `/tools?tool=${encodeURIComponent(item.id)}`)
        for (const item of jobs) {
          const config = item.definition as Json
          add('jobs', String(item.id), String(config.name), String(config.state), `/jobs/${item.id}`)
        }
      }
      const offset = Number(options.query?.cursor ?? 0)
      if (!Number.isInteger(offset) || offset < 0) fail(422)
      return {
        stage,
        results: results.slice(offset, offset + 30),
        nextCursor: results.length > offset + 30 ? String(offset + 30) : null,
        coverage: stage === 'semantic' ? [] : searchSettings.configuration.sources.map(source => ({ source, status: 'searched' })),
        ranking: { status: 'disabled' },
      }
    }
    return undefined
  }
  return handle
}
