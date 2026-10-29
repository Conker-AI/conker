const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const filename = path.resolve(__dirname, '../src/components/chat/history.tsx')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function historyHarness() {
  const hooks = [], observers = [], pendingEffects = []
  let cursor = 0
  const react = {
    useRef: value => { const index = cursor++; return hooks[index] ??= { current: value } },
    useState: value => {
      const index = cursor++
      hooks[index] ??= { value }
      return [hooks[index].value, next => { hooks[index].value = next }]
    },
    useLayoutEffect: (run, dependencies) => {
      const index = cursor++, previous = hooks[index]
      if (!previous || dependencies.some((item, position) => item !== previous.dependencies[position])) {
        pendingEffects.push(() => {
          previous?.cleanup?.()
          hooks[index] = { dependencies, cleanup: run() }
        })
      }
    },
  }
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  const jsx = (type, props) => ({ type, props })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === './composer') return { conversationColumn: 'conversation-column' }
    if (name === '@/pwa/chat-navigation') return { useSwipeBack: () => {}, useBackToChats: () => () => {} }
    return new Proxy({}, { get: (_, property) => property })
  }, module, module.exports)
  const targets = new Map()
  const scroller = {
    clientHeight: 400, scrollHeight: 1600, scrollTop: 0,
    getBoundingClientRect: () => ({ top: 64 }),
  }
  const body = {
    ownerDocument: { getElementById: id => targets.get(id) ?? null },
    contains: target => [...targets.values()].includes(target),
  }
  let tree, props
  function visit(node, callback) {
    if (!node || typeof node !== 'object') return
    callback(node)
    // Base UI composes controls through `render`, so the rendered element can live there.
    for (const child of [node.props?.children, node.props?.render].flat()) visit(child, callback)
  }
  function render(next = props) {
    props = next; cursor = 0
    tree = module.exports.ConversationHistory(props)
    visit(tree, node => {
      if (node.props?.ref) node.props.ref.current = node.props['aria-label'] ? scroller : body
    })
    for (const run of pendingEffects.splice(0)) run()
  }
  const resize = () => { for (const observer of observers) if (!observer.disconnected) observer.callback() }
  const scroll = top => {
    scroller.scrollTop = top
    visit(tree, node => { if (node.props?.onScroll) node.props.onScroll({ currentTarget: scroller }) })
  }
  const jump = () => {
    render()
    let action
    visit(tree, node => { if (node.props?.['aria-label'] === 'Jump to latest message') action = node.props.onClick })
    assert.ok(action, 'Latest-message control is available away from the bottom')
    action()
  }
  const target = (id, offset) => targets.set(`record-${id}`, {
    getBoundingClientRect: () => ({ top: 64 + offset - scroller.scrollTop }),
  })
  const inspectDisclosure = () => {
    global.Element = class { closest(selector) { return selector === 'summary' ? this : null } }
    visit(tree, node => { if (node.props?.onClickCapture) node.props.onClickCapture({ target: new global.Element() }) })
  }
  return { render, resize, scroll, jump, target, inspectDisclosure, scroller, observers }
}

// The linked message must win over an already queued bottom-of-history scroll event.
let test = historyHarness()
test.render({ sessionId: 'one', focusedMessageId: null, children: null })
test.target('match', 600)
test.render({ sessionId: 'one', focusedMessageId: 'match', children: null })
assert.equal(test.scroller.scrollTop, 584, 'A same-session message link is positioned below the appbar')
test.scroll(1200)
test.scroller.scrollHeight = 1900
test.resize()
assert.equal(test.scroller.scrollTop, 1200, 'A focus-link scroll event cannot re-enable auto-follow')
test.jump()
assert.equal(test.scroller.scrollTop, 1900)
test.scroller.scrollHeight = 2100
test.resize()
assert.equal(test.scroller.scrollTop, 2100, 'Explicit Latest restores follow during streaming')

test = historyHarness()
test.render({ sessionId: 'loading', focusedMessageId: 'delayed', children: null })
test.target('delayed', 900)
test.resize()
assert.equal(test.scroller.scrollTop, 884, 'A message arriving after history loads is revealed')
test.scroll(300)
test.scroller.scrollHeight = 2000
test.resize()
assert.equal(test.scroller.scrollTop, 300, 'Later markdown or stream layout cannot erase manual inspection')
test.render({ sessionId: 'next', focusedMessageId: null, children: null })
assert.equal(test.observers[0].disconnected, true, 'Session changes disconnect the old observer')
assert.equal(test.scroller.scrollTop, 2000)

test = historyHarness()
test.scroller.clientHeight = 0
test.target('hidden', 500)
test.render({ sessionId: 'hidden', focusedMessageId: 'hidden', children: null })
assert.equal(test.scroller.scrollTop, 0, 'A hidden workspace does not consume its message focus')
test.scroller.clientHeight = 400
test.resize()
assert.equal(test.scroller.scrollTop, 484)

test = historyHarness()
test.render({ sessionId: 'ordinary', children: null })
test.scroll(200)
test.scroller.scrollHeight = 1800
test.resize()
assert.equal(test.scroller.scrollTop, 200, 'Ordinary manual scroll pauses auto-follow')
test.scroll(1370)
test.scroller.scrollHeight = 2000
test.resize()
assert.equal(test.scroller.scrollTop, 2000, 'Returning near the bottom resumes ordinary auto-follow')
test = historyHarness()
test.render({ sessionId: 'usage', children: null })
test.scroll(1200)
test.inspectDisclosure()
test.scroller.scrollHeight = 2300
test.resize()
assert.equal(test.scroller.scrollTop, 1200, 'Opening reference details preserves their heading instead of following their expanded bottom')
test.scroller.scrollHeight = 2400
test.resize()
assert.equal(test.scroller.scrollTop, 1200, 'The asynchronous usage read also preserves the reading position')
test.jump()
test.scroller.scrollHeight = 2500
test.resize()
assert.equal(test.scroller.scrollTop, 2500, 'Latest explicitly restores normal stream following after inspection')

// The on-screen keyboard shrinks the history; the lines being read at its bottom stay in view.
test = historyHarness()
test.render({ sessionId: 'keyboard', children: null })
test.scroll(1000)
test.scroller.clientHeight = 250
test.resize()
assert.equal(test.scroller.scrollTop, 1150, 'Opening the keyboard keeps the bottom of the reading position in view')
test.scroller.clientHeight = 400
test.resize()
assert.equal(test.scroller.scrollTop, 1000, 'Closing the keyboard returns to the same reading position')
test = historyHarness()
test.render({ sessionId: 'keyboard-latest', children: null })
test.scroller.clientHeight = 250
test.resize()
assert.equal(test.scroller.scrollTop, 1600, 'At the latest message, opening the keyboard keeps the latest message visible')
test = historyHarness()
test.render({ sessionId: 'keyboard-hidden', children: null })
test.scroll(500)
test.scroller.clientHeight = 0
test.resize()
test.scroller.clientHeight = 400
test.resize()
assert.equal(test.scroller.scrollTop, 500, 'Hiding and showing the chat workspace does not move the reading position')

delete global.ResizeObserver
delete global.Element
console.log('Chat history: linked-message focus, delayed loading, hidden workspace, streaming, manual scroll and keyboard passed.')
