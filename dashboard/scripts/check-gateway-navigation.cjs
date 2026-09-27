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
assert.match(header, /gatewayCommandDestinations\.map/)
assert.doesNotMatch(header, /Object\.values\(appNavigation\)/)
assert.match(sidebar, /gatewaySidebarDestinations\.map/)
assert.match(workspace, /resolveGatewayRoute\(location\.pathname\)/)

console.log('Connected navigation registry, discoverability, detail routes and safe section fallbacks passed.')
