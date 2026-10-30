// The Inbox and Server tell the truth: no "All clear" before every source answered, a failed
// source is named, an approval is not "Done" until the saved request says it ran, and a healthy
// Server check says OK (Working means "Conker is doing it now").
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    const target = request.startsWith('@/') ? `src/${request.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))
    return load(`${target}.ts`)
  }, module, module.exports)
  return module.exports
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const { inboxSummary } = load('src/components/inbox/inbox-summary.ts')
const { approvalProgress, approvalProgressText, APPROVAL_UNKNOWN_AFTER_MS } = load('src/components/inbox/approval-progress.ts')
const { parseOwnerRequest } = load('src/lib/gateway/owner.ts')

// Summary: loading, then failed parts, then the count.
const ok = { answered: true, failed: false }, waiting = { answered: false, failed: false }, failed = { answered: true, failed: true }
assert.deepEqual(inboxSummary([ok, waiting, ok], 0, 0), { state: 'loading', text: 'Loading your Inbox…' }, 'One source still loading: no "All clear"')
assert.deepEqual(inboxSummary([waiting, waiting], 3, 1).state, 'loading', 'Nothing is counted before every source answered')
assert.deepEqual(inboxSummary([ok, failed], 0, 2), { state: 'partial', text: 'Part of your Inbox didn’t load' }, 'A failed source is never "All clear"')
assert.equal(inboxSummary([ok, failed], 2, 0).text, '2 need you · part of your Inbox didn’t load')
assert.equal(inboxSummary([{ answered: false, failed: true }, ok], 0, 0).state, 'partial', 'A failure counts as an answer')
assert.deepEqual(inboxSummary([ok, ok], 0, 4), { state: 'ready', text: 'All clear · 4 decided today' })
assert.equal(inboxSummary([ok, ok], 1, 0).text, '1 needs you · 0 decided today')
assert.equal(inboxSummary([], 0, 0).state, 'ready')

// Approval: Working until ToolGate marks it used, then "ran"; failed when it can no longer run.
const base = { id: 'request_one', kind: 'verification', title: 'Send an email to coach', details: '', actor: 'Conker', severity: 'normal', status: 'approved', created_at: '2026-10-29T12:00:00+00:00', updated_at: '2026-10-29T12:01:00+00:00',
  decision: { status: 'approved', actor: 'owner', note: '', at: '2026-10-29T12:01:00+00:00' }, action: { subject_type: 'tool', subject_id: 'email.send', version: 1, args: { to: 'coach@example.com' } },
  approval: { expires_at: null, consumed_at: null, origin_valid: true }, reviewable: false, unavailable_reason: 'already_decided', card: 'send' }
const request = (change = {}) => parseOwnerRequest({ ...base, ...change, approval: { ...base.approval, ...change.approval } })
const since = Date.parse('2026-10-29T12:01:00Z')
const approved = request()
assert.equal(approvalProgress(approved, since + 1000, since), 'working')
assert.equal(approvalProgressText('working', approved, since), 'Approved “Send an email to coach”. Sending now…', 'Says what is true: approved, sending now')
assert.ok(!/Done/.test(approvalProgressText('working', approved, since)), 'Never "Done" while working')
assert.equal(approvalProgressText('working', request({ card: 'do' }), since), 'Approved “Send an email to coach”. Conker is doing it now…')
const ran = request({ unavailable_reason: 'consumed', approval: { consumed_at: '2026-10-29T12:01:03+00:00' } })
assert.equal(approvalProgress(ran, since + 3000, since), 'ran', 'Used by ToolGate: it ran')
assert.match(approvalProgressText('ran', ran, since), /^“Send an email to coach” ran at .+\. The chat shows how it went\.$/)
assert.equal(approvalProgress(approved, since + APPROVAL_UNKNOWN_AFTER_MS, since), 'unknown', 'No word for a minute: Unknown, never Done')
assert.match(approvalProgressText('unknown', approved, since), /isn’t confirmed yet/)
const cancelled = request({ status: 'cancelled', decision: { ...base.decision, status: 'cancelled' } })
assert.equal(approvalProgress(cancelled, since, since), 'failed')
assert.match(approvalProgressText('failed', cancelled, since), /didn’t run: the request was cancelled\. Nothing was done/)
const bounded = request({ approval: { expires_at: '2026-10-29T12:05:00+00:00' } })
assert.equal(approvalProgress(bounded, Date.parse('2026-10-29T12:04:00Z'), Date.parse('2026-10-29T12:03:30Z')), 'working')
assert.equal(approvalProgress(bounded, Date.parse('2026-10-29T12:06:00Z'), since), 'failed', 'A bounded approval that ran out did not run')
assert.match(approvalProgressText('failed', bounded, Date.parse('2026-10-29T12:06:00Z')), /the approval ran out before Conker used it/)
assert.equal(approvalProgress(request({ approval: { origin_valid: false }, unavailable_reason: 'invalid_origin' }), since, since), 'failed')

// The screens use these, and the old untrue lines are gone.
const inbox = read('src/components/gateway/owner-workspace.tsx')
assert.ok(!inbox.includes('Done. Conker is doing it now'), 'The Inbox no longer says Done right after an approval')
assert.match(inbox, /inboxSummary\(\[/, 'The Inbox summary waits for every source')
for (const source of ['listed', 'ideas.items !== null', 'notes.answered', 'requests.answered', 'questions.answered']) assert.ok(inbox.includes(source), `The summary waits for ${source}`)
assert.match(inbox, /notes\.error !== null && <InlineError/, 'A failed AI job notes read is shown')
assert.ok(inbox.includes('Permission requests didn’t load'), 'A failed decisions read is named')
assert.match(inbox, /approvals\.follow\(updated\)/, 'An approval is followed until it ran')
for (const file of ['src/components/inbox/agent-notes.ts', 'src/components/inbox/asks.ts', 'src/components/inbox/change-requests.ts']) assert.match(read(file), /answered: !client \|\| items !== null \|\| error !== null/, `${file} says when it answered`)
const server = read('src/components/gateway/system-status.tsx')
assert.match(server, /ok: 'OK'/, 'A healthy Server check says OK')
assert.ok(!/'Working'/.test(server) && !/System status/.test(server), 'Server: no "Working" for healthy, no "System status"')
for (const file of ['src/components/resilience/error-details.ts', 'src/lib/gateway/transport.ts', 'src/components/gateway/agents-workspace.tsx']) assert.ok(!/check System/i.test(read(file)), `${file}: the place is called Server`)
console.log('Inbox honesty passed: loading and failed sources, approval Working/ran/failed/unknown, Server says OK.')
