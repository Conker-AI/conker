const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(file, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const record = { exports: {} }
  new Function('require', 'module', 'exports', 'globalThis', code)(require, record, record.exports, { ...globalThis, ...globals })
  return record.exports
}
const { buildResume, resumeAge, resumeChats, RESUME_LIMIT, RESUME_FALLBACK_CHATS } = load('src/components/gateway/home-resume-model.ts')

const now = new Date(2026, 10, 12, 15, 0, 0).getTime()
const ago = minutes => now - minutes * 60_000
const iso = minutes => new Date(ago(minutes)).toISOString()
const chat = (id, minutes, changes = {}) => ({ id, parentId: null, title: id, status: 'open', createdAt: iso(minutes), closedAt: null, summaryPreview: null, forgotten: false, titleTruncated: false, summaryTruncated: false, archivedAt: null, trashedAt: null, ...changes })
const draft = (id, kind, revision, publishedRevision, minutes) => ({ id, name: id, kind, revision, updatedAt: iso(minutes), publishedRevision })
const task = (id, status, minutes, changes = {}) => ({ id, outcome: id, status, updatedAt: iso(minutes), contentStatus: 'available', archivedAt: null, ...changes })

const input = {
  editorDrafts: [draft('never', 'connector', 1, null, 30), draft('edited', 'workflow', 3, 2, 50), draft('published', 'workflow', 2, 2, 5), draft('unknown', 'connector', 1, undefined, 400)],
  chats: [chat('week', 3000), chat('sky', 2000), chat('gone', 10, { forgotten: true, title: '' }), chat('trashed', 10, { trashedAt: iso(5) }), chat('archived', 10, { archivedAt: iso(5) }), chat('', 900, { id: 'untitled', title: '' })],
  opened: [{ id: 'gone', at: ago(1) }, { id: 'trashed', at: ago(1) }, { id: 'archived', at: ago(1) }, { id: 'week', at: ago(12) }, { id: 'sky', at: ago(300) }, { id: 'missing', at: ago(2) }],
  messageDrafts: [{ sessionId: null, text: '  Ask coach about Saturday\nsecond line', updatedAt: ago(3) / 1000 }, { sessionId: 'sky', text: 'half a question', updatedAt: ago(100) / 1000 }, { sessionId: 'week', text: '   ', updatedAt: ago(1) / 1000 }],
  tasks: [task('active', 'in_progress', 60), task('stuck', 'blocked', 200), task('later', 'planned', 1), task('done', 'completed', 1), task('forgotten', 'in_progress', 1, { contentStatus: 'forgotten' }), task('old', 'in_progress', 1, { archivedAt: iso(1) })],
}
const items = buildResume(input)
assert.equal(items.length, RESUME_LIMIT, 'At most six cards')
assert.deepEqual(items.map(item => item.key), ['chat:new', 'chat:week', 'editor:never', 'editor:edited', 'task:active', 'chat:sky'], 'Newest first across every kind')
assert.ok(!items.some(item => ['editor:published'].includes(item.key)), 'A draft whose latest revision is published is finished')
assert.ok(!items.some(item => /gone|trashed|archived|missing/.test(item.key)), 'Forgotten, trashed, archived and unlisted chats never come back')
assert.ok(!items.some(item => /later|done|forgotten|old/.test(item.key)), 'Only live tasks in progress or blocked')
const byKey = Object.fromEntries(buildResume(input, 20).map(item => [item.key, item]))
assert.equal(byKey['editor:unknown'].label, 'Tool draft', 'A draft whose publications did not load is still offered')
assert.equal(byKey['editor:never'].href, '/tools?draft=never')
assert.equal(byKey['editor:edited'].label, 'Workflow draft')
assert.equal(byKey['chat:new'].title, 'Ask coach about Saturday', 'The new-chat draft is named by its first line')
assert.equal(byKey['chat:new'].href, '/chat')
assert.equal(byKey['chat:sky'].label, 'Unsent message', 'An opened chat with an unsent message says so')
assert.equal(byKey['chat:sky'].at, ago(100), 'The later of opened and typed counts')
assert.equal(byKey['chat:week'].label, 'Chat', 'Whitespace is not an unsent message')
assert.equal(byKey['chat:week'].href, '/chat?session=week')
assert.equal(byKey['task:stuck'].label, 'Task · blocked')
assert.equal(byKey['task:active'].href, '/activity?tab=tasks&task=active')
assert.equal(input.opened.length, 6, 'Derivation must not mutate its input')

const fallback = resumeChats(input.chats, [])
assert.equal(fallback.length, 3, `With no opened record, the newest ${RESUME_FALLBACK_CHATS} listed chats stand in`)
assert.deepEqual(fallback.map(item => item.chat.id), ['untitled', 'sky', 'week'])
assert.equal(buildResume({ ...input, opened: [], editorDrafts: [], messageDrafts: [], tasks: [] }).find(item => item.key === 'chat:untitled').title, 'Untitled chat')
assert.deepEqual(buildResume({ editorDrafts: [], chats: [], opened: [], messageDrafts: [], tasks: [] }), [], 'Nothing unfinished: an empty list, so Home hides the row')

assert.equal(resumeAge(ago(0.5), now), 'Just now')
assert.equal(resumeAge(ago(5), now), '5 min ago')
assert.equal(resumeAge(ago(180), now), '3 h ago')
assert.equal(resumeAge(new Date(2026, 10, 11, 9).getTime(), now), 'Yesterday')
assert.equal(resumeAge(0, now), 'Earlier')

// The opened-chats record: ids and times only, newest first, bounded, and garbage is ignored.
const store = new Map()
const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) }
const recent = load('src/lib/recent-chats.ts', { localStorage })
recent.rememberOpenedChat('ses_a', 1); recent.rememberOpenedChat('ses_b', 2); recent.rememberOpenedChat('ses_a', 3); recent.rememberOpenedChat('bad id!', 4)
assert.deepEqual(recent.readOpenedChats(), [{ id: 'ses_a', at: 3 }, { id: 'ses_b', at: 2 }], 'Reopening moves a chat to the front; bad ids are refused')
for (let index = 0; index < 20; index++) recent.rememberOpenedChat(`ses_${index}`, 10 + index)
assert.equal(recent.readOpenedChats().length, recent.RECENT_CHATS_LIMIT)
assert.equal(JSON.parse(store.get('conker.recent-chats')).every(item => Object.keys(item).sort().join() === 'at,id'), true, 'Nothing but ids and times is stored')
store.set('conker.recent-chats', '{"not":"a list"}')
assert.deepEqual(recent.readOpenedChats(), [])
const blocked = load('src/lib/recent-chats.ts', { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } })
assert.deepEqual(blocked.readOpenedChats(), []); blocked.rememberOpenedChat('ses_a')

console.log('gateway resume checks passed')
