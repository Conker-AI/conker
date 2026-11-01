// Proves the pure logic behind the per-message "Context rule" menu: setting a rule, "Default" clearing it,
// other messages' rules kept, invalid ids and rules refused, and the label for each rule.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/chat/message-context-rules.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const loaded = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputText)(() => { throw new Error('Message rules must have no runtime dependencies') }, loaded, loaded.exports)
const { messageRules, ruleWords, ruleLabel, canRuleMessage, messageRuleOf, withMessageRule } = loaded.exports

const A = 'msg_0000000000000001', B = 'msg_0000000000000002', C = 'msg_00000000000000ff'
const policy = {
  sessionInstructions: 'Be brief.',
  messagePolicies: { [A]: 'exclude', [B]: 'retrieve' },
  budget: { contextWindowTokens: 1000, outputReserveTokens: 100, otherInputTokens: 5 },
}
const snapshot = JSON.stringify(policy)

function main() {
  // Setting a rule on a new message keeps the other messages, the instructions and the budget.
  const added = withMessageRule(policy, C, 'keep-exact')
  assert.deepEqual(added.messagePolicies, { [A]: 'exclude', [B]: 'retrieve', [C]: 'keep-exact' })
  assert.equal(added.sessionInstructions, 'Be brief.')
  assert.deepEqual(added.budget, policy.budget)

  // Changing a rule replaces only that message's rule.
  assert.deepEqual(withMessageRule(policy, A, 'allow-summary').messagePolicies, { [A]: 'allow-summary', [B]: 'retrieve' })

  // "Default" removes the key and keeps the rest; clearing a message with no rule changes nothing.
  const cleared = withMessageRule(policy, A, null)
  assert.deepEqual(cleared.messagePolicies, { [B]: 'retrieve' })
  assert.ok(!Object.hasOwn(cleared.messagePolicies, A))
  assert.deepEqual(withMessageRule(policy, C, null).messagePolicies, policy.messagePolicies)

  // The input policy is never changed.
  assert.equal(JSON.stringify(policy), snapshot)

  // A chat with no policy yet gets the Context sheet's defaults.
  const first = withMessageRule(null, A, 'exclude')
  assert.deepEqual(first, { sessionInstructions: '', messagePolicies: { [A]: 'exclude' }, budget: { contextWindowTokens: 128000, outputReserveTokens: 4096, otherInputTokens: 0 } })
  assert.deepEqual(withMessageRule(null, A, null).messagePolicies, {})

  // Invalid message ids and rules are refused.
  for (const id of ['', 'msg_1', 'msg_000000000000000G', 'ses_0000000000000001', ` ${A}`, `${A}x`, '__proto__', 'a']) {
    assert.equal(canRuleMessage(id), false, id)
    assert.throws(() => withMessageRule(policy, id, 'exclude'), /message id/, id)
  }
  assert.equal(canRuleMessage(A), true)
  assert.throws(() => withMessageRule(policy, A, 'truncate'), /message rule/)
  assert.throws(() => withMessageRule(policy, A, undefined), /message rule/)

  // Reading a rule back.
  assert.equal(messageRuleOf(policy, A), 'exclude')
  assert.equal(messageRuleOf(policy, C), null)
  assert.equal(messageRuleOf(null, A), null)
  assert.equal(messageRuleOf(policy, 'constructor'), null)

  // Each rule has its own label word, in the Context sheet's words, capitalised.
  assert.deepEqual([...messageRules].sort(), ['allow-summary', 'exclude', 'keep-exact', 'retrieve'])
  assert.deepEqual(ruleWords, { 'keep-exact': 'kept word for word', exclude: 'left out', 'allow-summary': 'may be summarised', retrieve: 'brought back when relevant' })
  assert.deepEqual(messageRules.map(ruleLabel), ['Kept word for word', 'Left out', 'May be summarised', 'Brought back when relevant'])

  console.log('Message context rule check passed')
}

try { main() } catch (error) { console.error(error); process.exit(1) }
