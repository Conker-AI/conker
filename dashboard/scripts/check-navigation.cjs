const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const requireApp = createRequire(path.join(root, 'package.json'))
const ts = requireApp('typescript')
const cache = new Map()
globalThis.crypto ??= webcrypto

// Run the routing policy and fixture mutations directly against the source.
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const filename = path.join(root, relative)
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  assert.equal((compiled.diagnostics || []).length, 0, `Invalid source: ${relative}`)
  const module = { exports: {} }
  cache.set(relative, module)
  const resolve = request => request.startsWith('.')
    ? load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
    : requireApp(request)
  new Function('require', 'module', 'exports', compiled.outputText)(resolve, module, module.exports)
  return module.exports
}

async function main() {
  const { appNavigation, pageSections, matchAppRoute, activePageSection, pageSectionHref, getPageNavigation } = load('src/config/navigation.ts')
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const client = createFixtureClient()
  const data = await client.load()
  const checks = []
  const check = (name, run) => { run(); checks.push(name) }

  check('Route paths are unique and every parent chain reaches a valid root', () => {
    assert.equal(new Set(Object.values(appNavigation).map(route => route.path)).size, Object.keys(appNavigation).length)
    for (const key of Object.keys(appNavigation)) {
      const visited = new Set([key])
      let parent = appNavigation[key].parent
      while (parent) {
        assert.ok(appNavigation[parent], `Unknown ancestor ${parent}`)
        assert.ok(!visited.has(parent), `Ancestor cycle at ${parent}`)
        visited.add(parent); parent = appNavigation[parent].parent
      }
    }
  })
  check('Sidebar destinations are independent roots while Home remains the entry point', () => {
    const roots = ['home', 'companion', 'chats', 'inbox', 'memory', 'projects', 'artifacts', 'journal', 'agents', 'tools', 'jobs', 'system', 'settings']
    for (const key of roots) {
      const route = appNavigation[key]
      assert.equal(route.parent, undefined, `${key} must be a top-level destination`)
      assert.deepEqual(getPageNavigation(route.path, '', data).crumbs, [{ title: route.title, to: route.path }])
    }
    assert.equal(appNavigation.home.path, '/')
    assert.equal(matchAppRoute('/').key, 'home')
    assert.deepEqual(getPageNavigation('/settings/companion', '', data).crumbs.map(crumb => crumb.to), ['/settings', '/settings/companion'])
  })
  check('Specific routes, detail routes, trailing slashes, and unknown paths resolve correctly', () => {
    assert.equal(matchAppRoute('/settings/companion').key, 'companionSettings')
    assert.equal(matchAppRoute('/settings/').key, 'settings')
    assert.equal(matchAppRoute('/chat/week').params.id, 'week')
    assert.equal(matchAppRoute('/chat/new').key, 'newChat')
    assert.equal(matchAppRoute('/activity').key, 'activity')
    assert.equal(matchAppRoute('/projects').key, 'projects')
    assert.equal(matchAppRoute('/projects/project_one').key, 'project')
    assert.equal(matchAppRoute('/projects/project_one/unknown').key, 'notFound')
    assert.equal(matchAppRoute('/artifacts').key, 'artifacts')
    assert.equal(matchAppRoute('/artifacts/output_one').key, 'artifact')
    assert.equal(matchAppRoute('/artifacts/output_one/unknown').key, 'notFound')
    assert.equal(matchAppRoute('/agents/workshop/edit').key, 'editAgent')
    assert.deepEqual(getPageNavigation('/activity', '?tab=runs', data).sections.map(section => section.value), ['tasks', 'runs', 'events'])
    assert.deepEqual(getPageNavigation('/chat/new', '', data).crumbs.map(crumb => crumb.to), ['/chat', '/chat/new'])
    assert.equal(getPageNavigation('/chat', '', data).actions.find(action => action.label === 'New chat').to, '/chat/new')
    assert.equal(matchAppRoute('/inbox/coach').key, 'request')
    assert.equal(matchAppRoute('/chat/week/unknown').key, 'notFound')
  })
  check('All sections support direct URLs and invalid values fall back to the first section', () => {
    for (const [key, sections] of Object.entries(pageSections)) {
      assert.equal(activePageSection(key, ''), sections[0].value)
      assert.equal(activePageSection(key, '?tab=unknown'), sections[0].value)
      for (const section of sections) assert.equal(activePageSection(key, `?tab=${section.value}`), section.value)
    }
    assert.equal(activePageSection('home', '?tab=agents'), undefined)
  })
  check('Section links preserve unrelated filters and clear only the default tab parameter', () => {
    const linked = new URL(pageSectionHref('chats', '?q=Conker&tag=a&tag=b', 'agents'), 'http://localhost')
    assert.equal(linked.pathname, '/chat')
    assert.equal(linked.searchParams.get('tab'), 'agents')
    assert.equal(linked.searchParams.get('q'), 'Conker')
    assert.deepEqual(linked.searchParams.getAll('tag'), ['a', 'b'])
    assert.equal(pageSectionHref('chats', '?q=Conker&tab=agents', 'sessions'), '/chat?q=Conker')
    assert.equal(pageSectionHref('settings', '?tab=account', 'unknown'), '/settings')
  })
  check('Detail breadcrumbs use real names and a deterministic parent on direct loads', () => {
    const withProject = { ...data, projects: [{ id: 'project_one', name: 'Research workspace' }] }
    const project = getPageNavigation('/projects/project_one', '', withProject)
    assert.equal(project.title, 'Research workspace')
    assert.deepEqual(project.crumbs, [{ title: 'Projects', to: '/projects' }, { title: 'Research workspace', to: '/projects/project_one' }])
    assert.equal(getPageNavigation('/projects/missing', '', data).title, 'Project not found')
    const withArtifact = { ...data, artifacts: [{ id: 'output_one', title: 'Owner report' }] }
    assert.deepEqual(getPageNavigation('/artifacts/output_one', '?version=1', withArtifact).crumbs, [{ title: 'Artifacts', to: '/artifacts' }, { title: 'Owner report', to: '/artifacts/output_one' }])
    assert.equal(getPageNavigation('/artifacts/missing', '', data).title, 'Artifact not found')
    const conversation = getPageNavigation('/chat/week', '', data)
    assert.deepEqual(conversation.crumbs.map(crumb => crumb.to), ['/chat', '/chat/week'])
    assert.equal(conversation.title, data.sessions.find(session => session.id === 'week').title)
    const missing = getPageNavigation('/inbox/missing', '', data)
    assert.equal(missing.title, 'Request not found')
    assert.equal(missing.crumbs.at(-2).to, '/inbox')
    assert.deepEqual(getPageNavigation('/unavailable', '', data).crumbs, [{ title: 'Page not found', to: '/unavailable' }])
  })
  check('Related navigation uses the saved companion name and keeps agent-specific controls scoped', () => {
    const renamed = { ...data, profile: { ...data.profile, name: 'Hazel' } }
    assert.equal(getPageNavigation('/', '', renamed).actions[0].label, 'Talk to Hazel')
    assert.equal(getPageNavigation('/companion', '', data).actions.length, 0) // Conversation menu owns editing.
    assert.equal(getPageNavigation('/chat/reading', '', data).actions.length, 0)
    assert.equal(getPageNavigation('/settings/companion', '', data).actions[0].to, '/companion')
  })
  await client.decideTicket('coach', 'Denied')
  const updated = await client.load()
  check('Decision counts refresh and reviewed requests return to the history route', () => {
    assert.equal(getPageNavigation('/inbox', '', data).sections[0].badge, 3)
    assert.equal(getPageNavigation('/inbox', '', updated).sections[0].badge, 2)
    assert.equal(getPageNavigation('/inbox/coach', '', updated).crumbs.at(-2).to, '/inbox?tab=history')
  })
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
