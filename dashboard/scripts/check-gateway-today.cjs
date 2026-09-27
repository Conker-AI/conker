const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/gateway/today-model.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleRecord = { exports: {} }
new Function('require', 'module', 'exports', code)(require, moduleRecord, moduleRecord.exports)
const { buildTodaySnapshot } = moduleRecord.exports

const request = (id, updatedAt, status = 'pending', reviewable = true) => ({ id, updatedAt, status, reviewable })
const task = (id, updatedAt, status, changes = {}) => ({ id, updatedAt, status, contentStatus: 'available', archivedAt: null, ...changes })
const session = (id, createdAt, status = 'open') => ({ id, createdAt, status })
const proposal = (id, createdAt, state = 'open') => ({ id, createdAt, state })

const input = {
  requests: [request('old', '2026-09-20T00:00:00Z'), request('new', '2026-09-21T00:00:00Z'), request('done', '2026-09-22T00:00:00Z', 'approved', false)],
  tasks: [task('active', '2026-09-21T00:00:00Z', 'in_progress'), task('blocked', '2026-09-22T00:00:00Z', 'blocked'), task('complete', '2026-09-23T00:00:00Z', 'completed'), task('archived', '2026-09-24T00:00:00Z', 'planned', { archivedAt: '2026-09-25T00:00:00Z' }), task('forgotten', '2026-09-25T00:00:00Z', 'planned', { contentStatus: 'forgotten' })],
  sessions: [session('closed', '2026-09-23T00:00:00Z', 'closed'), session('recent', '2026-09-22T00:00:00Z'), session('older', '2026-09-21T00:00:00Z')],
  proposals: [proposal('past', 10, 'declined'), proposal('suggestion', 20)],
}
const snapshot = buildTodaySnapshot(input)
assert.deepEqual(snapshot.waiting.map(item => item.id), ['new', 'old'])
assert.deepEqual(snapshot.activeTasks.map(item => item.id), ['blocked', 'active'])
assert.deepEqual(snapshot.completedTasks.map(item => item.id), ['complete'])
assert.deepEqual(snapshot.conversations.map(item => item.id), ['recent', 'older'])
assert.deepEqual(snapshot.suggestions.map(item => item.id), ['suggestion'])
assert.equal(input.tasks.length, 5, 'derivation must not mutate source collections')

const bounded = buildTodaySnapshot({
  requests: Array.from({ length: 8 }, (_, index) => request(`r${index}`, `2026-09-${String(10 + index).padStart(2, '0')}T00:00:00Z`)),
  tasks: Array.from({ length: 8 }, (_, index) => task(`t${index}`, `2026-09-${String(10 + index).padStart(2, '0')}T00:00:00Z`, index < 5 ? 'planned' : 'completed')),
  sessions: Array.from({ length: 8 }, (_, index) => session(`s${index}`, `2026-09-${String(10 + index).padStart(2, '0')}T00:00:00Z`)),
  proposals: Array.from({ length: 8 }, (_, index) => proposal(`p${index}`, index + 1)),
})
assert.equal(bounded.waiting.length, 3)
assert.equal(bounded.activeTasks.length, 4)
assert.equal(bounded.conversations.length, 4)
assert.equal(bounded.completedTasks.length, 3)
assert.equal(bounded.suggestions.length, 3)
console.log('Gateway Today passed: honest filtering, newest-first ordering, privacy exclusions and bounded groups.')
