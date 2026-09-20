const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/api/artifact-preview.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} }
new Function('require', 'module', 'exports', code)(name => { assert.equal(name, 'zod'); return require('zod') }, loaded, loaded.exports)
const { createArtifactPreviewClient } = loaded.exports
const at = '2026-09-20T12:00:00Z'
const privacy = { memoryDisabled: false, harnessDisabled: false }
function fixture() {
  let state = { artifacts: [], sessions: [{ id: 'chat', privacy: { ...privacy } }, { id: 'other', privacy: { ...privacy } }],
    messages: [{ sessionId: 'chat', id: 'reply', role: 'assistant', text: '# Original response\n\nA precise answer.', status: 'complete' }],
    tasks: [{ id: 'task', sessionId: 'chat', archivedAt: null }, { id: 'elsewhere', sessionId: 'other', archivedAt: null }] }
  let identity = 0, writes = 0
  const client = createArtifactPreviewClient({ getSnapshot: () => state, setArtifacts: artifacts => { state = { ...state, artifacts }; writes++ }, now: () => at, newId: () => String(++identity) })
  return { client, state: () => state, writes: () => writes }
}
const owner = { title: 'Owner note', content: { kind: 'markdown', text: 'My own content.' } }
const fromMessage = { title: 'Original response title with private detail', sessionId: 'chat', messageId: 'reply', taskId: 'task' }
async function main() {
  const { client, state, writes } = fixture()
  const sourceState = JSON.stringify({ sessions: state().sessions, messages: state().messages, tasks: state().tasks })
  for (const invalid of [
    { ...owner, title: ' ' }, { ...owner, title: 'a'.repeat(161) }, { ...owner, source: { sessionId: 'chat', messageId: 'reply' } },
    { ...owner, content: { kind: 'markdown', text: 'a'.repeat(200001) } },
    { ...owner, content: { kind: 'code', text: 'alert(1)', language: '../../html' } },
    { ...owner, content: { kind: 'html', text: '<script>alert(1)</script>' } },
    { ...owner, content: { kind: 'table', columns: ['A'], rows: [['1', '2']] } },
    { ...owner, content: { kind: 'table', columns: ['A'], rows: Array(1001).fill(['a']) } },
    { ...owner, content: { kind: 'table', columns: ['A'], rows: Array(26).fill(['a'.repeat(10000)]) } },
    { ...owner, content: { kind: 'chart', chartType: 'bar', xLabel: 'Month', series: [{ label: 'Count' }], rows: [{ label: 'Jan', values: [Infinity] }] } },
    { ...owner, content: { kind: 'chart', chartType: 'bar', xLabel: 'Month', series: [{ label: 'Count' }], rows: [{ label: 'Jan', values: [1, 2] }] } },
    { ...owner, content: { kind: 'chart', chartType: 'bar', xLabel: 'Month', series: [{ label: 'Count' }], rows: [], execute: 'alert(1)' } },
    { ...owner, taskId: 'missing' },
  ]) await assert.rejects(client.create(invalid))
  await assert.rejects(client.createFromMessage({ ...fromMessage, taskId: 'elsewhere' }), /source conversation/)
  assert.equal(writes(), 0, 'Invalid writes never partially commit')

  let own = await client.create(owner)
  let copied = await client.createFromMessage(fromMessage)
  assert.equal(copied.origin, 'conversation-copy')
  assert.equal(copied.versions[0].author, 'source-copy')
  assert.equal(copied.versions[0].content.text, state().messages[0].text)
  assert.equal(copied.execution, 'not-wired')
  assert.equal(copied.provenance, 'preview')
  assert.ok(!Object.hasOwn(copied, 'sourceTextAtCreation'))
  owner.content.text = 'Caller mutated original input'
  own.versions[0].content.text = 'Caller mutated returned view'
  copied.source.messageId = 'Caller mutation'
  assert.equal((await client.get(own.id)).versions[0].content.text, 'My own content.')
  assert.equal((await client.get(copied.id)).source.messageId, 'reply')

  await assert.rejects(client.appendVersion(own.id, { content: { kind: 'markdown', text: 'bad' } }, undefined), /revision/)
  await assert.rejects(client.archive(own.id, true, 0), /revision/)
  const edited = await client.appendVersion(own.id, { title: 'Edited note', content: { kind: 'markdown', text: 'A revision.' }, note: 'Owner correction' }, own.revision)
  assert.equal(edited.versions[0].content.text, 'My own content.')
  assert.equal(edited.versions[1].author, 'owner')
  await assert.rejects(client.restore(own.id, 1, own.revision), /changed/)
  own = await client.restore(own.id, 1, edited.revision)
  assert.equal(own.versions.length, 3)
  assert.equal(own.versions[2].restoredFromVersion, 1)
  assert.equal(own.title, 'Owner note')
  assert.equal(own.versions[1].content.text, 'A revision.')
  const race = await Promise.allSettled([
    client.appendVersion(own.id, { content: { kind: 'markdown', text: 'First writer' } }, own.revision),
    client.appendVersion(own.id, { content: { kind: 'markdown', text: 'Stale writer' } }, own.revision),
  ])
  assert.deepEqual(race.map(item => item.status), ['fulfilled', 'rejected'])

  copied = await client.get(copied.id)
  copied = await client.appendVersion(copied.id, { content: { kind: 'code', text: '<script>example</script>', language: 'html' } }, copied.revision)
  assert.equal(copied.origin, 'conversation-copy', 'Owner edits never detach derived content from original privacy')
  assert.equal(copied.versions[1].author, 'owner')
  for (const flag of ['memoryDisabled', 'harnessDisabled']) {
    state().sessions[0].privacy[flag] = true
    const privateView = await client.get(copied.id)
    assert.equal(privateView.privateOrigin, true)
    assert.equal(privateView.versions.length, 2, 'Explicit owner inspection remains available')
    assert.equal((await client.export(copied.id)).privateOrigin, true)
    state().sessions[0].privacy[flag] = false
  }
  state().sessions[0].incognito = true
  assert.equal((await client.get(copied.id)).privateOrigin, true)
  delete state().sessions[0].incognito

  const sourceMessage = structuredClone(state().messages[0])
  for (const [change, availability] of [
    [() => { state().messages[0].redacted = true }, 'source-redacted'],
    [() => { state().messages[0].text = 'Source changed' }, 'source-changed'],
    [() => { state().messages[0].status = 'failed' }, 'source-changed'],
    [() => { state().messages = [] }, 'source-unavailable'],
    [() => { state().messages[0].sessionId = 'other' }, 'source-unavailable'],
    [() => { delete state().sessions[0].privacy }, 'privacy-unknown'],
  ]) {
    change()
    const hidden = await client.get(copied.id)
    assert.equal(hidden.availability, availability)
    assert.equal(hidden.title, 'Unavailable artifact', 'Source-derived titles must not survive source redaction or unavailability')
    assert.deepEqual(hidden.versions, [])
    assert.equal(hidden.versionCount, 2)
    assert.ok(!JSON.stringify(hidden).includes('Original response'))
    assert.ok(!JSON.stringify(await client.list()).includes('<script>example'))
    await assert.rejects(client.export(copied.id, 1), /blocked/)
    await assert.rejects(client.restore(copied.id, 1, copied.revision), /source/)
    assert.equal((await client.get(own.id)).availability, 'available', 'Unsourced owner artifact is independent')
    state().messages = [structuredClone(sourceMessage)]; state().sessions[0].privacy = { ...privacy }
  }
  state().sessions[0].archived = true
  assert.equal((await client.get(copied.id)).availability, 'source-archived')
  assert.equal((await client.export(copied.id)).text, '<script>example</script>')
  await assert.rejects(client.appendVersion(copied.id, { content: owner.content }, copied.revision), /source/)
  await assert.rejects(client.createFromMessage(fromMessage), /active conversation/)
  delete state().sessions[0].archived
  state().tasks[0].sessionId = 'other'
  assert.equal((await client.get(copied.id)).taskAvailability, 'origin-changed')
  state().tasks[0].sessionId = 'chat'; state().tasks[0].archivedAt = at
  assert.equal((await client.get(copied.id)).taskAvailability, 'archived')
  await assert.rejects(client.createFromMessage(fromMessage), /existing task/)
  state().tasks[0].archivedAt = null
  const savedTasks = state().tasks; state().tasks = []
  assert.equal((await client.get(copied.id)).taskAvailability, 'unavailable')
  state().tasks = savedTasks

  own = await client.get(own.id)
  own = await client.archive(own.id, true, own.revision)
  await assert.rejects(client.appendVersion(own.id, { content: owner.content }, own.revision), /Restore/)
  await assert.rejects(client.restore(own.id, 1, own.revision), /Restore/)
  assert.equal((await client.export(own.id, 1)).text, 'My own content.')
  const archivedRevision = own.revision
  assert.equal((await client.archive(own.id, true, own.revision)).revision, archivedRevision)
  own = await client.archive(own.id, false, own.revision)
  assert.equal(own.versions.length, 4)

  const table = await client.create({ title: '../../NUL\r\nUnsafe:name', content: { kind: 'table', columns: ['Label', '=SUM(A1)'], rows: [['a,"b"\nc', '\t=2+2'], ['safe', ' @COMMAND']] } })
  const exported = await client.export(table.id)
  assert.ok(!/[\\/:\r\n]/.test(exported.filename))
  assert.ok(exported.filename.endsWith('.csv'))
  assert.equal(exported.text, '"Label","\'=SUM(A1)"\r\n"a,""b""\nc","\'\t=2+2"\r\n"safe","\' @COMMAND"')
  assert.equal(exported.mime, 'text/csv;charset=utf-8')
  const html = await client.export(copied.id)
  assert.ok(html.filename.endsWith('.html.txt'))
  assert.equal(html.mime, 'text/plain;charset=utf-8')
  const unrecognizedLanguage = await client.create({ title: 'Prototype labels stay inert', content: { kind: 'code', text: 'inert', language: '__proto__' } })
  assert.ok((await client.export(unrecognizedLanguage.id)).filename.endsWith('.txt'), 'Unknown language labels never resolve inherited object properties')
  const chartContent = { kind: 'chart', chartType: 'line', xLabel: 'Day', series: [{ label: 'Count' }], rows: [{ label: 'Monday', values: [2] }] }
  const chart = await client.create({ title: 'Chart', content: chartContent })
  assert.deepEqual(JSON.parse((await client.export(chart.id)).text), chartContent)
  assert.equal((await fixture().client.list()).length, 0)
  assert.equal(JSON.stringify({ sessions: state().sessions, messages: state().messages, tasks: state().tasks }), sourceState, 'Artifact lifecycle never mutates canonical source work')

  const isolated = fixture(), limited = await isolated.client.create({ title: 'Bounded history', content: { kind: 'markdown', text: 'a' } })
  let versioned = limited
  for (let index = 1; index < 100; index++) versioned = await isolated.client.appendVersion(limited.id, { content: { kind: 'markdown', text: String(index) } }, versioned.revision)
  await assert.rejects(isolated.client.restore(limited.id, 1, versioned.revision), /limit/)
  assert.equal((await isolated.client.get(limited.id)).versionCount, 100)
  const cited = fixture()
  const citation = { id: 'evidence', label: 'Supplied reference', href: 'https://example.com/source', excerpt: 'PRIVATE_CITATION_EXCERPT' }
  cited.state().messages[0].citations = [citation]
  let citedArtifact = await cited.client.createFromMessage(fromMessage)
  assert.deepEqual(citedArtifact.versions[0].citations, [citation])
  const exportedCitation = await cited.client.export(citedArtifact.id)
  assert.ok(exportedCitation.text.startsWith(cited.state().messages[0].text))
  assert.deepEqual(JSON.parse(exportedCitation.text.match(/```json\n([\s\S]*)\n```/)[1]), [citation], 'Offline export retains inert source metadata')
  citedArtifact.versions[0].citations[0].excerpt = 'Caller mutation'
  assert.equal((await cited.client.get(citedArtifact.id)).versions[0].citations[0].excerpt, 'PRIVATE_CITATION_EXCERPT')
  citedArtifact = await cited.client.appendVersion(citedArtifact.id, { content: { kind: 'markdown', text: 'Edited document [source](citation:evidence)' } }, citedArtifact.revision)
  assert.deepEqual(citedArtifact.versions.at(-1).citations, [citation], 'Markdown edits retain supplied references by default')
  citedArtifact = await cited.client.appendVersion(citedArtifact.id, { content: { kind: 'markdown', text: 'Without supplied references' }, preserveCitations: false }, citedArtifact.revision)
  assert.equal(citedArtifact.versions.at(-1).citations, undefined, 'Explicit removal does not rewrite historical references')
  assert.deepEqual(citedArtifact.versions[0].citations, [citation])
  citedArtifact = await cited.client.restore(citedArtifact.id, 1, citedArtifact.revision)
  assert.deepEqual(citedArtifact.versions.at(-1).citations, [citation], 'Restoration copies exact historical citation metadata')
  citedArtifact = await cited.client.appendVersion(citedArtifact.id, { content: { kind: 'code', language: 'text', text: 'Inert code' } }, citedArtifact.revision)
  assert.equal(citedArtifact.versions.at(-1).citations, undefined)
  await assert.rejects(cited.client.appendVersion(citedArtifact.id, { content: owner.content, citations: [citation] }, citedArtifact.revision), /artifact/)
  for (const replacement of [[], [{ ...citation, excerpt: 'Changed source excerpt' }]]) {
    cited.state().messages[0].citations = replacement
    const hidden = await cited.client.get(citedArtifact.id)
    assert.equal(hidden.availability, 'source-changed')
    assert.equal(hidden.title, 'Unavailable artifact')
    assert.deepEqual(hidden.versions, [])
    assert.ok(!JSON.stringify(await cited.client.list()).includes('PRIVATE_CITATION'))
    await assert.rejects(cited.client.export(citedArtifact.id, 1), /blocked/)
  }
  cited.state().messages[0].citations = [citation]
  cited.state().messages[0].redacted = true
  assert.ok(!JSON.stringify(await cited.client.get(citedArtifact.id)).includes('PRIVATE_CITATION'))
  cited.state().messages[0].redacted = false
  for (const invalid of [[citation, citation], [{ ...citation, excerpt: 'x'.repeat(8001) }], Array.from({ length: 101 }, (_, index) => ({ ...citation, id: String(index) }))]) {
    cited.state().messages[0].citations = invalid
    await assert.rejects(cited.client.createFromMessage(fromMessage), /citation|artifact/i)
  }
  const maliciousCitation = { ...citation, label: '```\n<script>bad</script>', href: 'javascript:alert(1)' }
  cited.state().messages[0].citations = [maliciousCitation]
  const inertReferences = await cited.client.createFromMessage(fromMessage)
  const inertExport = (await cited.client.export(inertReferences.id)).text
  assert.equal((inertExport.match(/```/g) || []).length, 2, 'Supplied metadata cannot close its export code fence')
  assert.deepEqual(JSON.parse(inertExport.match(/```json\n([\s\S]*)\n```/)[1]), [maliciousCitation])
  console.log('Artifact lifecycle checks passed: source fidelity/privacy/redaction, task origin, immutable history, stale writes/restores, bounded native formats and inert safe exports.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
