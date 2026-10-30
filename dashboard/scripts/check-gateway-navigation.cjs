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
assert.deepEqual(gatewaySidebarDestinations.map(item => item.title), ['Home', 'Inbox', 'Chats', 'Projects', 'Memory', 'Agents', 'Tools', 'Cron jobs', 'Server', 'Settings'],
  'The sidebar lists the approved places in order (prototype v7)')
assert.deepEqual(gatewayDestinations.filter(item => item.group === 'overview').map(item => item.id), ['today', 'inbox', 'chats'])
assert.deepEqual(gatewayDestinations.filter(item => item.group === 'workspace').map(item => item.id), ['projects', 'memory', 'agents', 'tools', 'jobs'])
assert.deepEqual(gatewayDestinations.filter(item => item.group === 'system').map(item => item.id), ['system', 'settings'])
assert.ok(gatewayCommandDestinations.some(item => item.id === 'chat' && item.title === 'New chat'), 'New chat stays one search away and behind Ask Conker')
assert.equal(gatewayCommandDestinations.find(item => item.path === '/setup').title, 'Setup & readiness')
assert.equal(resolveGatewayRoute('/'), 'today', 'Conker opens on Home, the glance-and-go screen')
assert.equal(resolveGatewayRoute('/overview'), 'today', 'Home keeps its address')
for (const item of gatewayCommandDestinations) assert.ok(resolveGatewayRoute(new URL(item.path, 'https://conker.test').pathname), `${item.path} must resolve in the connected workspace`)
for (const item of gatewaySidebarDestinations) assert.equal(resolveGatewayRoute(new URL(item.path, 'https://conker.test').pathname), item.route)
for (const item of gatewayDestinations) {
  const url = new URL(item.path, 'https://conker.test')
  assert.equal(gatewayPageNavigation(url.pathname, url.search).destination.id, item.id, `${item.path} must select its navigation entry`)
}
assert.equal(gatewayPageNavigation('/activity', '?tab=unknown').destination.id, 'tasks')
assert.equal(gatewayPageNavigation('/agents', '?tab=teams').destination.id, 'agents')
assert.deepEqual(gatewayPageNavigation('/settings', '?tab=providers').sections, [], 'Settings keeps its topics in the screen, not in header tabs')
assert.equal(gatewayPageNavigation('/agents/agent_0123456789abcdef0123456789abcdef/edit', '').title, 'Edit agent')
assert.equal(gatewayViewTitle('/agents', '?tab=skills'), 'Skills')
assert.equal(gatewayViewTitle('/settings', '?tab=unknown'), 'Settings')
assert.equal(gatewayViewTitle('/tools', '?view=mcp'), 'MCP servers')
assert.deepEqual(gatewayPageNavigation('/system', '').sections.map(item => item.value), ['overview', 'services', 'backups', 'processes', 'ports', 'terminal', 'native-sessions', 'files'], 'Services replaced Containers in the Server list')
assert.equal(gatewayPageNavigation('/system', '?tab=containers').activeSection, 'services', 'Containers opens from Services and lights it up')
assert.equal(gatewayViewTitle('/system', '?tab=containers'), 'Containers')
assert.equal(gatewaySystemSection('?tab=containers'), 'containers', 'old Containers links still open the page')
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
assert.equal(gatewaySystemSection('?tab=native-sessions'), 'native-sessions')
assert.equal(gatewaySystemSection('?tab=unknown'), 'overview')
assert.equal(gatewayAgentSection('?tab=teams'), 'teams')
assert.equal(gatewayAgentSection('?tab=templates'), 'agents')

const header = fs.readFileSync(path.join(root, 'src/components/gateway/header.tsx'), 'utf8')
const sidebar = fs.readFileSync(path.join(root, 'src/components/gateway/gateway-sidebar.tsx'), 'utf8')
const attention = fs.readFileSync(path.join(root, 'src/components/gateway/inbox-attention.tsx'), 'utf8')
const workspace = fs.readFileSync(path.join(root, 'src/components/gateway/workspace.tsx'), 'utf8')
assert.match(header, /UniversalSearchTrigger/)
const search = fs.readFileSync(path.join(root, 'src/components/gateway/universal-search-dialog.tsx'), 'utf8')
assert.match(search, /gatewayCommandDestinations/)
assert.doesNotMatch(header, /Object\.values\(appNavigation\)/)
assert.match(header, /gatewayPageNavigation/)
assert.match(sidebar, /gatewaySidebarDestinations\.filter/, 'The sidebar renders the shared destinations')
assert.equal(gatewaySidebarDestinations.find(item => item.route === 'chats')?.path, '/chats')
assert.equal(gatewaySidebarDestinations.find(item => item.route === 'projects')?.path, '/projects')
assert.match(sidebar, /UniversalSearchContext/)
assert.match(sidebar, /Ask Conker/, 'The one primary action sits above the places')
assert.doesNotMatch(sidebar, /Recent chats|OwnerAvatar|DropdownMenu|to="\/setup"/, 'No chat history, profile badge, account menu or status links in the sidebar (owner, 24 October)')
assert.doesNotMatch(sidebar, /control\.projects\.list|listSessions|useSessionDiscovery/, 'The sidebar lists places and fetches no collections')
assert.match(attention, /request\.current\?\.abort\(\)/, 'Superseded Inbox-count reads must be canceled')
assert.match(workspace, /<InboxAttentionProvider owner=\{owner\}/, 'One Inbox count feeds the sidebar and every phone menu button')
const shell = fs.readFileSync(path.join(root, 'src/components/gateway/workspace-shell.tsx'), 'utf8')
assert.doesNotMatch(shell, /WorkspaceRail|conker-statusbar|'Ready'/, 'Duplicate navigation and idle-as-ready status must not return')
assert.doesNotMatch(shell, /role="tablist"|workspace-tabs|runtime\.listSessions/, 'One main view: no open-views tabs and no second chat list')
assert.match(shell, /<InlineDetails open=\{contextOpen\}/, 'Conversation views open in place under the chat bar')
assert.doesNotMatch(shell, /conker-reference|<DetailPanel/, 'No side column or sheet for conversation views (owner: no side windows)')
assert.match(header, /\{shell\?\.panel\}/, 'The chat bar renders the open view directly below itself')
const views = fs.readFileSync(path.join(root, 'src/components/gateway/conversation-views.tsx'), 'utf8')
const viewList = fs.readFileSync(path.join(root, 'src/components/gateway/conversation-view-list.ts'), 'utf8')
assert.deepEqual([...viewList.matchAll(/id: '([a-z]+)'/g)].map(match => match[1]), ['context', 'thinking', 'logs'], 'Conversation views are Context, Thinking and Logs, in that order')
assert.match(header, /<ConversationViewStrip open=\{shell\.view\} onToggle=\{shell\.toggleView\} compact=\{isMobile\} \/>/, 'Phones fold the views strip into one menu')
assert.match(views, /aria-pressed=\{open === id\}/, 'The open view is announced on its strip button')
assert.doesNotMatch(views, /setTimeout|setInterval|Math\.random/, 'Views show saved records only; no timers or invented steps')
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

// Execute the workspace's real route-selection effect, independently of visual children.
// Browser Back/Forward and the brand link only change the URL; neither calls New chat.
let currentUrl = new URL('https://conker.test/chat'), layoutEffects = []
const runtimeModule = { exports: {} }
const noView = () => null
const mockedReact = {
  lazy: () => function LazyWorkspace() { return null }, Suspense: noView,
  useCallback: value => value, useState: value => [value, () => {}],
  useLayoutEffect: effect => layoutEffects.push(effect),
}
new Function('require', 'module', 'exports', ts.transpileModule(workspace, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText)(request => {
  if (request === 'react') return mockedReact
  if (request === 'react/jsx-runtime') return require(request)
  if (request === 'zustand') return { useStore: (store, select) => select(store.getState()) }
  if (request === 'react-router-dom') return { Link: noView, useLocation: () => currentUrl, useNavigate: () => () => {}, useSearchParams: () => [currentUrl.searchParams] }
  if (request === './navigation') return loaded.exports
  if (request === '@/lib/utils') return { cn: (...values) => values.filter(Boolean).join(' ') }
  return new Proxy({}, { get: () => noView })
}, runtimeModule, runtimeModule.exports)
let selectionState = { selected: 'ses_before', operation: 'send', taskIntent: null, uncertain: { ses_before: { requestId: 'retained_request_identity' } } }
let selectionWrites = 0
const conversationState = { getState: () => selectionState, setState: patch => { selectionWrites++; selectionState = { ...selectionState, ...patch } } }
const workspaceProps = { conversationState, control: { search: {} }, sourcePrivacy: {}, runtime: {}, activity: {}, authStore: {}, owner: {}, proposals: {}, ownerState: {}, activityState: {} }
function runtimeChild(node) {
  if (!node || typeof node !== 'object') return null
  if (node.props?.onSelectSession) return node
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
  return children.map(runtimeChild).find(Boolean) ?? null
}
function visit(href, expected, reason) {
  currentUrl = new URL(href, 'https://conker.test'); layoutEffects = []
  const tree = runtimeModule.exports.GatewayWorkspace(workspaceProps)
  layoutEffects.forEach(effect => effect())
  assert.equal(selectionState.selected, expected, reason)
  assert.equal(selectionState.operation, 'send', 'Navigation never cancels an in-flight operation')
  assert.equal(selectionState.uncertain.ses_before.requestId, 'retained_request_identity', 'Navigation retains recovery identities')
  return runtimeChild(tree)
}
const initialRuntime = visit('/chat', null, 'Brand /chat link selects the unsent new-chat draft')
visit('/chat?session=ses_a&message=msg_a', 'ses_a', 'Direct conversation/message links select their chat')
visit('/chat?session=ses_b', 'ses_b', 'A second history entry selects its own chat')
visit('/chat?session=ses_a&message=msg_a', 'ses_a', 'Browser Back restores the preceding chat')
visit('/chat', null, 'Browser Back to the new-chat entry clears the previous selection')
visit('/chat?session=ses_a&message=msg_a', 'ses_a', 'Browser Forward restores the session')
const writesBeforeHidden = selectionWrites
const hiddenRuntime = visit('/memory?session=unrelated', 'ses_a', 'Other routes preserve the hidden conversation')
assert.equal(selectionWrites, writesBeforeHidden)
assert.equal(hiddenRuntime.type, initialRuntime.type, 'Chat remains the same mounted component across routes')
assert.equal(hiddenRuntime.key, initialRuntime.key, 'A route switch cannot remount chat via a new key')
assert.equal(hiddenRuntime.props.visible, false)
visit('/chat?message=msg_orphan', null, 'A message-only URL must not reuse a previous conversation')
visit('/chat?session=ses_b', 'ses_b', 'Selection can recover after returning from another workspace')
visit('/', 'ses_b', 'Home (the root) keeps the hidden conversation like every other non-chat route')
visit('/chat?session=../invalid', null, 'Malformed session parameters cannot leave a prior chat visible')

const primitives = fs.readFileSync(path.join(root, 'src/components/design-system/primitives.tsx'), 'utf8')
assert.doesNotMatch(primitives, /aria-labelledby=\{id\}[\s\S]{0,160}data-slot="collection-row"|data-slot="collection-row"[\s\S]{0,160}aria-labelledby=\{id\}/,
  'Collection rows must let visible descendant text form their accessible name')

// Execute the sidebar's focus lifecycle with controlled frames and DOM availability.
const focusSource = fs.readFileSync(path.join(root, 'src/lib/sidebar-focus.ts'), 'utf8')
const focusModule = { exports: {} }, frames = []
let focused = null, otherDialog = false
class FocusElement {
  isConnected = true; disabled = false; hidden = false; rects = [1]
  matches() { return this.disabled }
  closest() { return this.hidden ? this : null }
  getClientRects() { return this.rects }
  focus(options) { assert.equal(options.preventScroll, true); focused = this }
}
const body = new FocusElement(), content = new FocusElement(), opener = new FocusElement(), editor = new FocusElement()
const focusDocument = { body, activeElement: body, querySelector: () => otherDialog ? { contains: element => element === editor } : null }
const focusWindow = { location: { href: 'https://conker.test/setup' } }
const wrapper = Object.assign(new FocusElement(), { querySelector: () => content })
let mountedRoot = wrapper
new Function('module', 'exports', 'document', 'window', 'HTMLElement', 'requestAnimationFrame', ts.transpileModule(focusSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(focusModule, focusModule.exports, focusDocument, focusWindow, FocusElement, frame => frames.push(frame))
const focus = focusModule.exports.createSidebarFocus()
function closeSidebar(destination) {
  focus.change(false, undefined, destination)
  assert.equal(focus.restore(() => mountedRoot), false, 'The explicit return target replaces the Base UI missing-trigger fallback')
}
function flushFrames() { for (const frame of frames.splice(0)) frame() }
focus.change(true, opener); closeSidebar(); flushFrames(); assert.equal(focused, opener, 'Escape/outside/close button return to the actual opener')
focusDocument.activeElement = editor; focus.change(true); closeSidebar(); flushFrames(); assert.equal(focused, editor, 'Keyboard opening retains the focused editor')
focus.change(true, opener); closeSidebar('content'); flushFrames(); assert.equal(focused, content, 'Navigation focuses destination content even when the URL is unchanged')
focus.change(true, opener); focusWindow.location.href = 'https://conker.test/memory'; closeSidebar(); flushFrames(); assert.equal(focused, content, 'A changed route must not restore focus to its prior control')
focus.change(true, opener); closeSidebar(); otherDialog = true; focused = editor; flushFrames(); assert.equal(focused, editor, 'Closing does not steal focus from another open dialog')
focus.change(true, editor); closeSidebar(); focusDocument.activeElement = body; focused = body; flushFrames(); assert.equal(focused, editor, 'A shortcut opened from a dialog returns to its input when focus was lost')
focus.change(true, editor); closeSidebar(); focusDocument.activeElement = editor; focused = null; flushFrames(); assert.equal(focused, null, 'An open dialog that already owns focus is left alone')
otherDialog = false; focus.change(true, opener); closeSidebar(); focused = editor; focus.change(true, editor); flushFrames(); assert.equal(focused, editor, 'A reopened sidebar invalidates prior close callbacks')
closeSidebar(); mountedRoot = null; focused = body; flushFrames(); assert.equal(focused, body, 'Auth/workspace unmount fences deferred focus')
mountedRoot = wrapper; focus.change(true, opener); closeSidebar(); mountedRoot = Object.assign(new FocusElement(), { querySelector: () => content }); flushFrames(); assert.equal(focused, body, 'A replacement workspace never inherits an older focus callback')
mountedRoot = wrapper
for (const patch of [{ isConnected: false }, { disabled: true }, { hidden: true }, { rects: [] }]) {
  Object.assign(opener, { isConnected: true, disabled: false, hidden: false, rects: [1] }, patch)
  focus.change(true, opener); closeSidebar(); flushFrames(); assert.equal(focused, content, 'Unavailable openers fall back to the current main content')
}
const sidebarPrimitive = fs.readFileSync(path.join(root, 'src/components/ui/sidebar.tsx'), 'utf8')
assert.match(sidebarPrimitive, /finalFocus=\{restoreMobileFocus\}/)
assert.match(sidebarPrimitive, /if \(!event\.defaultPrevented\) toggleSidebar\(event\.currentTarget\)/, 'Prevented opener actions must not open the sidebar')
assert.match(sidebarPrimitive, /<main\s+tabIndex=\{-1\}/, 'Navigation content accepts programmatic focus without adding a Tab stop')
assert.match(sidebar, /setOpenMobile\(false, 'content'\)/, 'New chat and destination actions explicitly hand focus to content')
const appbarSource = fs.readFileSync(path.join(root, 'src/components/design-system/workspace-chrome.tsx'), 'utf8')
assert.match(appbarSource, /showSidebarTrigger = isMobile \|\| state === 'collapsed'/, 'The real mobile opener remains mounted behind the Sheet')

console.log('Connected navigation, route continuity and mobile sidebar focus restoration/lifetime fences passed.')
