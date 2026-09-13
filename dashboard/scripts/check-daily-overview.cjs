const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { webcrypto } = require('node:crypto')

const dashboard = path.resolve(__dirname, '..')
const ts = require(path.join(dashboard, 'node_modules/typescript'))
const cache = new Map()
globalThis.crypto ??= webcrypto

// Exercise the source selector and fixture client without a browser.
// Vite's public environment is empty in this check.
function load(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  if (cache.has(normalized)) return cache.get(normalized).exports
  const filename = path.join(dashboard, normalized)
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  assert.equal((compiled.diagnostics || []).length, 0, `Syntax diagnostics in ${normalized}`)
  const module = { exports: {} }
  cache.set(normalized, module)
  const resolve = request => {
    assert.ok(request.startsWith('.'), `Unexpected runtime dependency ${request}`)
    const imported = path.posix.normalize(path.posix.join(path.posix.dirname(normalized), request))
    return load(`${imported}.ts`)
  }
  new Function('require', 'module', 'exports', compiled.outputText)(resolve, module, module.exports)
  return module.exports
}

async function main() {
  const { getDailyOverview } = load('src/lib/daily-overview.ts')
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const client = createFixtureClient()
  const snapshot = await client.load()
  const checks = []
  const check = (label, callback) => { callback(); checks.push(label) }

  check('The main companion session exists exactly once and has no fabricated assistant reply', () => {
    assert.equal(snapshot.companionSessionId, 'companion')
    assert.equal(snapshot.sessions.filter(item => item.id === snapshot.companionSessionId).length, 1)
    assert.equal(snapshot.threads.companion, undefined)
    assert.equal(getDailyOverview(snapshot).companionSession.mode, 'companion')
  })
  check('Session reordering cannot change the selected main companion', () => {
    const reordered = { ...snapshot, sessions: [...snapshot.sessions].reverse() }
    assert.equal(getDailyOverview(reordered).companionSession.id, 'companion')
  })
  check('Plan provenance points to the weekly conversation independently of session order', () => {
    const reordered = { ...snapshot, sessions: [...snapshot.sessions].reverse() }
    assert.equal(getDailyOverview(reordered).planSource, '/chat/week')
    const withoutPlan = { ...snapshot, sessions: snapshot.sessions.filter(item => item.mode !== 'plan') }
    assert.equal(getDailyOverview(withoutPlan).planSource, '/companion')
  })
  check('Recent chats exclude the main companion, sort by recency, and preserve input order', () => {
    const reordered = { ...snapshot, sessions: [...snapshot.sessions].reverse() }
    const before = JSON.stringify(reordered.sessions)
    const recent = getDailyOverview(reordered).recentSessions
    assert.deepEqual(recent.map(item => item.id), ['week', 'reading', 'server'])
    assert.equal(JSON.stringify(reordered.sessions), before)
  })
  check('Activity is capped while the full agenda and job collections stay available', () => {
    const overview = getDailyOverview(snapshot)
    assert.equal(overview.recentActivity.length, 4)
    assert.equal(overview.agenda, snapshot.plan)
    assert.equal(overview.jobs, snapshot.jobs)
    assert.equal(overview.briefing, snapshot.dailyBriefing)
  })

  const beforeCount = getDailyOverview(snapshot).pendingTickets.length
  await client.decideTicket('coach', 'Approved once')
  const decided = await client.load()
  check('Pending decisions update from real fixture client mutations', () => {
    assert.equal(beforeCount, 3)
    assert.equal(getDailyOverview(decided).pendingTickets.length, 2)
    assert.equal(getDailyOverview(decided).pendingTickets.some(item => item.id === 'coach'), false)
  })

  await client.sendMessage('companion', 'Help me plan today.')
  const sent = await client.load()
  check('The main companion accepts messages without modifying the weekly session or inventing replies', () => {
    assert.equal(sent.messages.companion.length, 1)
    assert.equal(sent.messages.companion[0].text, 'Help me plan today.')
    assert.equal(sent.messages.week, undefined)
    assert.equal(sent.threads.companion, undefined)
    assert.equal(sent.threads.week.reply, snapshot.threads.week.reply)
  })

  check('Missing collections and missing companion session produce safe empty results', () => {
    const empty = { ...snapshot, sessions: [], tickets: [], entries: [], jobs: [], plan: [] }
    const overview = getDailyOverview(empty)
    assert.equal(overview.companionSession, undefined)
    for (const field of ['pendingTickets', 'agenda', 'recentActivity', 'jobs', 'recentSessions']) {
      assert.deepEqual(overview[field], [])
    }
  })
  check('News remains unavailable without fabricated headlines or a fake freshness timestamp', () => {
    const briefing = getDailyOverview(snapshot).briefing
    assert.equal(briefing.mode, 'sample')
    assert.equal(briefing.date, '2026-09-12')
    assert.equal(briefing.timezone, 'Asia/Jerusalem')
    assert.deepEqual(briefing.news, { status: 'unavailable', updatedAt: null, items: [] })
  })
  check('A future ready feed retains publisher and publication provenance unchanged', () => {
    const news = {
      status: 'ready', updatedAt: '2026-09-12T13:43:00Z',
      items: [{ id: 'test', title: 'Example test record', summary: 'Test data only.', publisher: 'Test publisher', url: 'https://example.test/research', publishedAt: '2026-09-11T08:00:00Z', topic: 'Research' }],
    }
    const future = { ...snapshot, dailyBriefing: { ...snapshot.dailyBriefing, mode: 'live', news } }
    assert.equal(getDailyOverview(future).briefing.news, news)
  })
  const fresh = await createFixtureClient().load()
  check('Separate fixture instances begin clean with one stable main session', () => {
    assert.equal(fresh.messages.companion, undefined)
    assert.equal(fresh.sessions.filter(item => item.id === 'companion').length, 1)
    assert.equal(getDailyOverview(fresh).pendingTickets.length, 3)
  })

  const result = { status: 'passed', checks }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
