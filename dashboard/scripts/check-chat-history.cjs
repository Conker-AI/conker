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
    for (const child of [node.props?.children].flat()) visit(child, callback)
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
  return { render, resize, scroll, jump, target, scroller, observers }
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
delete global.ResizeObserver
console.log('Chat history: linked-message focus, delayed loading, hidden workspace, streaming and manual scroll passed.')
