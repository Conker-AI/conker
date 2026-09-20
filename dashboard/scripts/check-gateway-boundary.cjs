const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createStore } = require('zustand/vanilla')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/components/auth/gateway-boundary.tsx'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const moduleResult = { exports: {} }
const primitive = tag => ({ children, ...props }) => React.createElement(tag, props, children)
// Isolate authorization rendering from visual primitives and fixture composition.
const modules = {
  '@/components/companion-portrait': { CompanionPortrait: () => null },
  '@/components/design-system/primitives': {
    PageHeader: ({ title, description }) => React.createElement('header', null, React.createElement('h1', null, title), React.createElement('p', null, description)),
  },
  '@/components/design-system/overlays': {
    FormActions: ({ children }) => React.createElement('div', null, children),
  },
  '@/components/layouts/page-container': { PageContainer: primitive('div') },
  '@/components/mode-toggle': { ModeToggle: () => null },
  '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', null, children) },
  '@/components/ui/button': { Button: ({ children, variant: _variant, ...props }) => React.createElement('button', props, children) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/label': { Label: primitive('label') },
  'lucide-react': { LogOut: () => null, RefreshCw: () => null },
}
new Function('require', 'module', 'exports', code)(request => {
  if (modules[request]) return modules[request]
  if (['react', 'react/jsx-runtime', 'zustand'].includes(request)) return require(request)
  throw new Error('Unexpected boundary dependency: ' + request)
}, moduleResult, moduleResult.exports)
const { GatewayBoundary, GatewayStatusSurface } = moduleResult.exports
let requests = 0, childrenRendered = 0
function ProtectedWorkspace() { childrenRendered++; return React.createElement('div', null, 'PRIVATE_WORKSPACE_SENTINEL') }
function state(patch = {}) {
  const action = async () => { requests++; return true }
  return createStore(() => ({
    phase: 'checking', pending: false, error: null, session: null, logoutUnconfirmed: false,
    bootstrap: action, revalidate: action, login: action, logout: action, ...patch,
  }))
}
const session = { authenticated: true, sessionId: 'session', expiresAt: 1800000000, setupRequired: false }
function render(store) { return renderToStaticMarkup(React.createElement(GatewayBoundary, { store }, React.createElement(ProtectedWorkspace))) }
for (const phase of ['checking', 'anonymous', 'setup-required', 'error']) {
  const html = render(state({ phase }))
  assert.ok(!html.includes('PRIVATE_WORKSPACE_SENTINEL'), phase + ' must gate protected children')
}
assert.equal(childrenRendered, 0, 'Protected component is never invoked while access is unverified')
for (const patch of [{ pending: true }, { logoutUnconfirmed: true }, { session: null }, { session: { ...session, setupRequired: true } }, { session: { ...session, authenticated: false } }]) {
  assert.ok(!render(state({ phase: 'authenticated', session, ...patch })).includes('PRIVATE_WORKSPACE_SENTINEL'), 'Contradictory or pending state cannot mount protected work')
}
assert.ok(render(state({ phase: 'authenticated', session })).includes('PRIVATE_WORKSPACE_SENTINEL'))
assert.equal(childrenRendered, 1)
const setup = render(state({ phase: 'setup-required' }))
assert.ok(setup.includes('conker auth setup'))
assert.ok(!setup.includes('type="password"'), 'Setup is host-only, never a browser claim form')
const signIn = render(state({ phase: 'anonymous' }))
assert.ok(signIn.includes('autoComplete="current-password"'))
assert.ok(signIn.includes('value=""'), 'Password starts empty; no snapshot or persisted secret is consulted')
const locked = render(state({ phase: 'error', logoutUnconfirmed: true, error: { message: 'Gateway unavailable.' } }))
assert.ok(locked.includes('Retry sign out'))
assert.ok(!locked.includes('Retry connection'), 'Unconfirmed logout cannot silently reopen access through a generic retry')
const status = renderToStaticMarkup(React.createElement(GatewayStatusSurface, { store: state({ phase: 'authenticated', session }) }))
assert.ok(status.includes('Your browser is signed in'))
assert.ok(status.includes('live conversation workspace is not connected'))
assert.equal(requests, 0, 'Rendering never performs an auth request; lifecycle bootstrap belongs to the mounted boundary')
console.log('Gateway boundary non-authenticated gating, host setup, empty password, logout lock and snapshot-independent status checks passed.')
