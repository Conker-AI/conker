const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/gateway/home-model.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleRecord = { exports: {} }
new Function('require', 'module', 'exports', code)(require, moduleRecord, moduleRecord.exports)
const { buildHome, HOME_CHART_DAYS, summarizePlans, PLAN_NEAR_LIMIT } = moduleRecord.exports

const now = new Date(2026, 9, 24, 15, 0, 0).getTime()
const at = (daysAgo, hour = 10) => { const date = new Date(now); date.setDate(date.getDate() - daysAgo); date.setHours(hour, 0, 0, 0); return date }
const iso = (daysAgo, hour) => at(daysAgo, hour).toISOString()
const request = (id, updatedAt, status = 'pending', reviewable = true, decision = null) => ({ id, title: id, details: '', actor: 'Conker', updatedAt, status, reviewable, decision })
const proposal = (id, createdAt, state = 'open', decidedAt = null) => ({ id, title: id, suggestion: '', createdAt, state, decidedAt })
const task = (id, updatedAt, status, changes = {}) => ({ id, outcome: id, updatedAt, status, contentStatus: 'available', archivedAt: null, ...changes })
const run = (id, daysAgo) => ({ id, startedAt: iso(daysAgo, 9), endedAt: iso(daysAgo, 9) })
const job = (id, nextAt, enabled = true) => ({ id, nextAt, definition: { name: id, enabled } })

const input = {
  requests: [request('old', iso(2)), request('new', iso(0)), request('hidden', iso(0), 'pending', false),
    request('approved-today', iso(0), 'approved', false, { status: 'approved', actor: 'owner', note: '', at: iso(0, 9) }),
    request('approved-yesterday', iso(1), 'approved', false, { status: 'approved', actor: 'owner', note: '', at: iso(1) })],
  proposals: [proposal('idea', at(0).getTime() / 1000), proposal('declined-today', 1, 'declined', at(0).getTime() / 1000)],
  tasks: [task('done-today', iso(0), 'completed'), task('done-earlier', iso(3), 'completed'), task('active', iso(0), 'in_progress'),
    task('forgotten', iso(0), 'completed', { contentStatus: 'forgotten' }), task('archived', iso(0), 'completed', { archivedAt: iso(0) })],
  runs: [run('a', 0), run('b', 0), run('c', 1), run('ancient', 30)],
  jobs: [job('later', 2_000_000_000), job('soon', 1_900_000_000), job('paused', 1_800_000_000, false)],
  runsComplete: true,
}
const home = buildHome(input, now)
assert.deepEqual(home.needs.map(item => item.id), ['new', 'old', 'idea'], 'Decisions come first (newest first), then open ideas; non-reviewable requests never show')
assert.equal(home.needsTotal, 3)
assert.equal(home.needs[0].href, '/inbox?request=new')
assert.equal(home.decidedToday, 2, 'Only decisions and ideas decided today count')
assert.equal(home.runDays.length, HOME_CHART_DAYS)
assert.equal(home.runsToday, 2)
assert.equal(home.runDays.at(-2).count, 1)
assert.equal(home.runDays.reduce((sum, item) => sum + item.count, 0), 3, 'Runs outside the chart window are not counted')
assert.equal(home.runDaysPartial, false)
assert.deepEqual(home.coming.map(item => item.id), ['soon', 'later'], 'Paused jobs are not coming up; soonest first')
assert.equal(home.coming[0].at, 1_900_000_000_000, 'Job times are seconds')
assert.deepEqual(home.completed.map(item => [item.id, item.today]), [['done-today', true], ['done-earlier', false]], 'Forgotten and archived tasks stay hidden')
assert.equal(input.requests.length, 5, 'Derivation must not mutate source collections')

const partial = buildHome({ ...input, runs: [run('recent', 1)], runsComplete: false }, now)
assert.equal(partial.runDaysPartial, true, 'A truncated run list says the early days may be short')

const bounded = buildHome({ ...input, requests: Array.from({ length: 8 }, (_, index) => request(`r${index}`, iso(index))) }, now)
assert.equal(bounded.needs.length, 3, 'Home shows at most three items needing him')
assert.equal(bounded.needsTotal, 9, 'The count still includes everything waiting')

const reading = (provider, window, label, usedPercent, resetsAt, checkedAt = now / 1000 - 300) => ({ provider, window, label, usedPercent, resetsAt, checkedAt })
const plans = summarizePlans({ windows: [reading('chatgpt', 'primary', '5-hour', PLAN_NEAR_LIMIT, new Date(now + 3600_000).toISOString()), reading('claude', 'five_hour', '5-hour', 12, new Date(now - 60_000).toISOString()), reading('claude', 'seven_day', 'weekly', 40, null)] }, now)
assert.deepEqual(plans.rows.map(row => row.name), ['Claude 5-hour', 'Claude weekly', 'ChatGPT 5-hour'], 'Claude windows come first, each named by plan and window')
assert.deepEqual(plans.rows.map(row => row.near), [false, false, true], 'A window at the alert level is near its limit')
assert.deepEqual(plans.rows.map(row => row.resetsAt), [null, null, now + 3600_000], 'Only a reset still ahead is shown')
assert.equal(plans.stale, false)
const stale = summarizePlans({ windows: [reading('claude', 'five_hour', '5-hour', 12, null, now / 1000 - 2 * 3600)] }, now)
assert.equal(stale.stale, true, 'A reading older than an hour says it may be out of date')
assert.equal(stale.checkedAt, now - 2 * 3600_000, 'Check times are seconds')
assert.deepEqual(summarizePlans({ windows: [] }, now), { status: 'ready', rows: [], checkedAt: null, stale: false }, 'No readings is its own state')

console.log('Gateway Home passed: decisions before ideas, bounded needs with a true total, today-only counts, the run chart window, upcoming jobs, hidden records and plan allowance.')
