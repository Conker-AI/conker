const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const relative = 'src/components/gateway/navigation.ts'
const source = fs.readFileSync(path.join(root, relative), 'utf8')
const compiled = ts.transpileModule(source, {
  fileName: relative,
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
assert.equal((compiled.diagnostics || []).length, 0, 'Connected navigation source must compile')
const loaded = { exports: {} }
new Function('module', 'exports', compiled.outputText)(loaded, loaded.exports)
const { gatewayCommandDestinations, gatewaySidebarDestinations, gatewayDestinations, gatewayPageNavigation, gatewayViewTitle, resolveGatewayRoute, gatewaySystemSection, gatewayAgentSection, gatewayConversationLink } = loaded.exports

assert.equal(new Set(gatewayCommandDestinations.map(item => item.path)).size, gatewayCommandDestinations.length, 'Command destinations must be unique')
assert.equal(new Set(gatewaySidebarDestinations.map(item => item.path)).size, gatewaySidebarDestinations.length, 'Sidebar destinations must be unique')
assert.deepEqual(gatewayCommandDestinations.slice(0, 2).map(item => item.title), ['New chat', 'All chats'], 'Chat is the primary entry point')
assert.deepEqual(gatewayDestinations.filter(item => item.group === 'work').map(item => item.id), ['today', 'inbox', 'tasks', 'runs', 'jobs', 'events'])
assert.deepEqual(gatewayDestinations.filter(item => item.group === 'library').map(item => item.id), ['projects', 'artifacts', 'agents', 'skills', 'tools'])
assert.equal(gatewayDestinations.find(item => item.id === 'memory').group, 'memory', 'Memory stays directly visible')
assert.equal(gatewayCommandDestinations.find(item => item.path === '/setup').title, 'Setup & readiness')
assert.equal(resolveGatewayRoute('/'), 'chat', 'The entry surface must be a conversation')
assert.equal(resolveGatewayRoute('/overview'), 'today', 'The existing overview stays reachable under Work')
for (const item of gatewayCommandDestinations) assert.ok(resolveGatewayRoute(new URL(item.path, 'https://conker.test').pathname), `${item.path} must resolve in the connected workspace`)
for (const item of gatewaySidebarDestinations) assert.equal(resolveGatewayRoute(new URL(item.path, 'https://conker.test').pathname), item.route)
for (const item of gatewayDestinations) {
  const url = new URL(item.path, 'https://conker.test')
  assert.equal(gatewayPageNavigation(url.pathname, url.search).destination.id, item.id, `${item.path} must select its navigation entry`)
}
assert.equal(gatewayPageNavigation('/activity', '?tab=unknown').destination.id, 'tasks')
assert.equal(gatewayPageNavigation('/agents', '?tab=teams').destination.id, 'agents')
assert.equal(gatewayPageNavigation('/settings', '?tab=providers').activeSection, 'providers')
assert.equal(gatewayPageNavigation('/agents/agent_0123456789abcdef0123456789abcdef/edit', '').title, 'Edit agent')
assert.equal(gatewayViewTitle('/agents', '?tab=skills'), 'Skills')
assert.equal(gatewayViewTitle('/settings', '?tab=unknown'), 'Settings')
assert.equal(gatewayViewTitle('/tools', '?view=mcp'), 'MCP servers')
assert.equal(gatewayPageNavigation('/agents', '?tab=teams&query=retain').sections.find(item => item.value === 'skills').to, '/agents?tab=skills&query=retain')

for (const pathValue of ['/journal', '/login', '/chat/new', '/unknown']) assert.equal(resolveGatewayRoute(pathValue), null, `${pathValue} is not a connected workspace route`)
assert.equal(resolveGatewayRoute('/projects/project_0123456789abcdef0123456789abcdef'), 'projects')
assert.equal(resolveGatewayRoute('/artifacts/artifact_0123456789abcdef0123456789abcdef/'), 'artifacts')
assert.equal(resolveGatewayRoute('/agents/agent_0123456789abcdef0123456789abcdef/edit'), 'agents')
assert.equal(resolveGatewayRoute('/projects/not-an-id'), null)
assert.equal(resolveGatewayRoute('/system/'), 'system')
assert.equal(gatewayConversationLink('ses_a'), '/chat?session=ses_a')
assert.equal(gatewayConversationLink('ses_a', 'msg_b'), '/chat?session=ses_a&message=msg_b')
const encodedConversation = new URL(gatewayConversationLink('session &/\u05d0', 'message ?#\u05d1'), 'https://conker.test')
assert.equal(resolveGatewayRoute(encodedConversation.pathname), 'chat')
assert.equal(encodedConversation.searchParams.get('session'), 'session &/\u05d0')
assert.equal(encodedConversation.searchParams.get('message'), 'message ?#\u05d1')
for (const component of ['activity-details', 'task-dispatch-review', 'proposals-panel']) {
  const componentSource = fs.readFileSync(path.join(root, `src/components/gateway/${component}.tsx`), 'utf8')
  assert.match(componentSource, /gatewayConversationLink/)
  assert.doesNotMatch(componentSource, /\/chats\?session=/,
    `${component} must open the transcript, not the conversation collection`)
}

assert.equal(gatewaySystemSection('?tab=terminal'), 'terminal')
assert.equal(gatewaySystemSection('?tab=unknown'), 'overview')
assert.equal(gatewayAgentSection('?tab=teams'), 'teams')
assert.equal(gatewayAgentSection('?tab=templates'), 'agents')

const header = fs.readFileSync(path.join(root, 'src/components/gateway/header.tsx'), 'utf8')
const sidebar = fs.readFileSync(path.join(root, 'src/components/gateway/chat-sidebar.tsx'), 'utf8')
const workspace = fs.readFileSync(path.join(root, 'src/components/gateway/workspace.tsx'), 'utf8')
assert.match(header, /UniversalSearchTrigger/)
const search = fs.readFileSync(path.join(root, 'src/components/gateway/universal-search.tsx'), 'utf8')
assert.match(search, /gatewayCommandDestinations/)
assert.doesNotMatch(header, /Object\.values\(appNavigation\)/)
assert.match(header, /gatewayPageNavigation/)
assert.match(sidebar, /gatewayDestinations\.filter/)
assert.equal(gatewaySidebarDestinations.find(item => item.route === 'chats')?.path, '/chats')
assert.equal(gatewaySidebarDestinations.find(item => item.route === 'projects')?.path, '/projects')
assert.doesNotMatch(sidebar, /item\.route !== 'projects'/, 'Projects must remain reachable after its recent-list heading becomes collapse-only')
assert.match(sidebar, /to="\/setup"/)
assert.match(sidebar, /setupSummary\.resolved/)
assert.match(sidebar, /setupStatus\.state !== 'complete'/, 'The setup prompt must disappear when verified setup is complete')
assert.match(sidebar, /className="conker-history-list"/)
assert.match(sidebar, /UniversalSearchContext/)
assert.doesNotMatch(sidebar, /control\.projects\.list/, 'The chat-first sidebar must not fetch a hidden project collection')
assert.match(sidebar, /request\.current\?\.abort\(\)/, 'Superseded history reads must be canceled')
const styles = fs.readFileSync(path.join(root, 'src/styles/connected-workspace.css'), 'utf8')
assert.match(styles, /\.conker-destinations\{[^}]*max-height:[^}]*overflow-y:auto/,
  'Expanded navigation must leave room for history')
assert.match(styles, /\.conker-history-list\{[^}]*overflow:auto/)
const shell = fs.readFileSync(path.join(root, 'src/components/gateway/workspace-shell.tsx'), 'utf8')
assert.doesNotMatch(shell, /WorkspaceRail|conker-statusbar|'Ready'/, 'Duplicate navigation and idle-as-ready status must not return')
assert.match(shell, /tabsOpen && !operation/, 'Hidden tabs must not fetch a second chat list')
assert.match(shell, /DetailPanel open=\{contextOpen\}/, 'Mobile context must use the keyboard-safe shared inspector')
const tools = fs.readFileSync(path.join(root, 'src/components/gateway/tools-inventory.tsx'), 'utf8')
assert.match(tools, /Actions follow your saved permissions and approval rules/)
assert.doesNotMatch(tools, /Anything that sends, spends or changes something still asks/,
  'The UI must not promise per-run confirmation for workflows configured to allow automatic runs')
const systemStatus = fs.readFileSync(path.join(root, 'src/components/gateway/system-status.tsx'), 'utf8')
assert.match(systemStatus, /Core checks passed/)
assert.match(systemStatus, /not every tool, schedule or host capability/)
assert.doesNotMatch(systemStatus, /Everything is working/,
  'Passing core diagnostics must not imply untested capabilities are ready')
assert.match(workspace, /resolveGatewayRoute\(location\.pathname\)/)

const primitives = fs.readFileSync(path.join(root, 'src/components/design-system/primitives.tsx'), 'utf8')
assert.doesNotMatch(primitives, /aria-labelledby=\{id\}[\s\S]{0,160}data-slot="collection-row"|data-slot="collection-row"[\s\S]{0,160}aria-labelledby=\{id\}/,
  'Collection rows must let visible descendant text form their accessible name')

console.log('Connected navigation registry, discoverability, detail routes and safe section fallbacks passed.')
