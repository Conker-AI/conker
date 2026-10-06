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
const { gatewayCommandDestinations, gatewaySidebarDestinations, resolveGatewayRoute, gatewaySystemSection, gatewayAgentSection } = loaded.exports

assert.equal(new Set(gatewayCommandDestinations.map(item => item.path)).size, gatewayCommandDestinations.length, 'Command destinations must be unique')
assert.equal(new Set(gatewaySidebarDestinations.map(item => item.path)).size, gatewaySidebarDestinations.length, 'Sidebar destinations must be unique')
assert.deepEqual(gatewaySidebarDestinations.slice(0, 3).map(item => item.title), ['Today', 'Chats', 'Inbox'], 'Primary sidebar order must put Today, Chats and Inbox first')
assert.equal(gatewayCommandDestinations.find(item => item.path === '/setup').title, 'Setup & readiness')
for (const item of gatewayCommandDestinations) assert.ok(resolveGatewayRoute(item.path), `${item.path} must resolve in the connected workspace`)
for (const item of gatewaySidebarDestinations) assert.equal(resolveGatewayRoute(item.path), item.route)

for (const pathValue of ['/journal', '/login', '/chat/new', '/unknown']) assert.equal(resolveGatewayRoute(pathValue), null, `${pathValue} is not a connected workspace route`)
assert.equal(resolveGatewayRoute('/projects/project_0123456789abcdef0123456789abcdef'), 'projects')
assert.equal(resolveGatewayRoute('/artifacts/artifact_0123456789abcdef0123456789abcdef/'), 'artifacts')
assert.equal(resolveGatewayRoute('/agents/agent_0123456789abcdef0123456789abcdef/edit'), 'agents')
assert.equal(resolveGatewayRoute('/projects/not-an-id'), null)
assert.equal(resolveGatewayRoute('/system/'), 'system')

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
assert.match(sidebar, /primaryDestinations\.map/)
assert.match(sidebar, /moreDestinations\.map/)
assert.equal(gatewaySidebarDestinations.find(item => item.route === 'chats')?.path, '/chats')
assert.equal(gatewaySidebarDestinations.find(item => item.route === 'projects')?.path, '/projects')
assert.doesNotMatch(sidebar, /item\.route !== 'projects'/, 'Projects must remain reachable after its recent-list heading becomes collapse-only')
assert.match(sidebar, /to="\/setup"/)
assert.match(sidebar, /setupSummary\.resolved/)
assert.match(sidebar, /setupStatus\.state !== 'complete'/, 'The setup prompt must disappear when verified setup is complete')
assert.match(sidebar, /CollapsibleContent className="sidebar-more-destinations overflow-y-auto"/,
  'Expanded destinations must use the height-bounded scroll region rather than consuming the recent lists')
const styles = fs.readFileSync(path.join(root, 'src/styles/design-system.css'), 'utf8')
assert.match(styles, /\.sidebar-more-destinations\s*\{\s*max-height:clamp\(var\(--control-height\),calc\(100dvh - var\(--sidebar-more-reserve\)\),40dvh\)/,
  'Short windows must reserve space for fixed navigation, profile and recent lists')
const tools = fs.readFileSync(path.join(root, 'src/components/gateway/tools-inventory.tsx'), 'utf8')
assert.match(tools, /Actions follow your saved permissions and approval rules/)
assert.doesNotMatch(tools, /Anything that sends, spends or changes something still asks/,
  'The UI must not promise per-run confirmation for workflows configured to allow automatic runs')
assert.match(workspace, /resolveGatewayRoute\(location\.pathname\)/)

const primitives = fs.readFileSync(path.join(root, 'src/components/design-system/primitives.tsx'), 'utf8')
assert.doesNotMatch(primitives, /aria-labelledby=\{id\}[\s\S]{0,160}data-slot="collection-row"|data-slot="collection-row"[\s\S]{0,160}aria-labelledby=\{id\}/,
  'Collection rows must let visible descendant text form their accessible name')

console.log('Connected navigation registry, discoverability, detail routes and safe section fallbacks passed.')
