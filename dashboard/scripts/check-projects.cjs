const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/api/project-preview.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} }
new Function('require', 'module', 'exports', code)(request => { if (request === 'zod') return require('zod'); throw new Error(`Unexpected dependency: ${request}`) }, loaded, loaded.exports)
const { createProjectPreviewClient, projectLinkCandidates, resolveProjectView } = loaded.exports
const at = '2026-09-20T10:00:00Z'
const privacy = { memoryDisabled: false, harnessDisabled: false }
const input = { name: ' Research ', description: ' Group existing work ', instructions: 'Cite original sources.' }
const chat = { kind: 'conversation', sessionId: 'one' }
const task = { kind: 'task', taskId: 'task' }
const file = { kind: 'file', sessionId: 'one', fileId: 'file' }
function fixture() {
  let state = { projects: [], sessions: [
    { id: 'one', title: 'Research chat', privacy: { ...privacy } },
    { id: 'two', title: 'Outside chat', privacy: { ...privacy } },
  ], tasks: [{ id: 'task', outcome: 'Research task', sessionId: 'one', archivedAt: null }], files: [
    { id: 'file', name: 'Research reference', sessionId: 'one' },
    { id: 'file', name: 'Outside reference', sessionId: 'two' },
  ] }
  let count = 0, commits = 0
  const client = createProjectPreviewClient({ getSnapshot: () => state, setProjects: projects => { state = { ...state, projects }; commits++ }, now: () => at, newId: () => String(++count) })
  return { client, state: () => state, commits: () => commits }
}
async function main() {
  const { client, state, commits } = fixture()
  assert.equal(projectLinkCandidates(state()).length, 5)
  state().sessions[0].archived = true
  assert.equal(projectLinkCandidates(state()).length, 2, 'Selector excludes every source of an archived origin')
  delete state().sessions[0].archived
  for (const patch of [{ name: '' }, { name: ' '.repeat(3) }, { instructions: 'x'.repeat(16001) }, { description: null }, { grants: ['admin'] }]) await assert.rejects(client.create({ ...input, ...patch }))
  assert.equal(commits(), 0)
  let project = await client.create(input)
  assert.equal(project.name, 'Research')
  assert.equal(project.provenance, 'preview')
  const sources = JSON.stringify({ sessions: state().sessions, tasks: state().tasks, files: state().files })
  const invalid = [ { kind: 'task', taskId: 'missing' }, { kind: 'conversation', sessionId: 'missing' }, { kind: 'file', fileId: 'missing', sessionId: 'one' }, { ...file, path: 'C:/private' } ]
  for (const value of invalid) await assert.rejects(client.link(project.id, value, project.revision))
  const before = commits()
  await assert.rejects(client.update(project.id, input, undefined), /revision/)
  await assert.rejects(client.archive(project.id, true, 0), /revision/)
  assert.equal(commits(), before)
  project = await client.link(project.id, chat, project.revision)
  await assert.rejects(client.link(project.id, task, 1), /changed/)
  const priorRevision = project.revision
  project = await client.link(project.id, chat, project.revision)
  assert.equal(project.revision, priorRevision, 'Duplicate identity does not duplicate a reference')
  project = await client.link(project.id, task, project.revision)
  project = await client.link(project.id, file, project.revision)
  assert.equal(project.links.length, 3)
  const projected = resolveProjectView(state(), state().projects[0])
  projected.links[0].snapshot.originSessionId = 'caller mutation'
  assert.equal(state().projects[0].links[0].snapshot.originSessionId, 'one', 'UI projection does not expose mutable canonical state')
  assert.ok(project.links.every(link => link.mode === 'live-reference' && link.labelSource === 'live-source'))
  assert.ok(state().projects[0].links.every(link => !JSON.stringify(link).includes('Research')), 'Identity snapshots never retain source text')
  const second = await client.create({ ...input, name: 'Other project' })
  await client.link(second.id, { kind: 'conversation', sessionId: 'two' }, second.revision)
  assert.equal((await client.search(project.id, 'outside')).links.length, 0, 'Search cannot widen to unlinked sources or other projects')
  assert.equal((await client.search(project.id, 'RESEARCH')).links.length, 3)
  assert.equal((await client.search(project.id, 'Cite original')).links.length, 0, 'Search scope is explicit linked labels only')
  let context = await client.previewContext(project.id, privacy)
  assert.equal(context.references.length, 3)
  assert.deepEqual(context.instruction, { scope: 'project', sourceId: project.id, text: input.instructions })
  assert.equal(context.contentIncluded, false)
  assert.equal(context.grantsInherited, false)
  assert.equal(context.memoryWritesAllowed, false)
  assert.equal(context.execution, 'not-wired')
  project.links[0].snapshot.originSessionId = 'caller mutation'
  context.instruction.text = 'caller mutation'
  assert.equal((await client.get(project.id)).links[0].snapshot.originSessionId, 'one')
  assert.equal((await client.get(project.id)).instructions, input.instructions)
  for (const flag of ['memoryDisabled', 'harnessDisabled']) {
    state().sessions[0].privacy[flag] = true
    assert.equal(projectLinkCandidates(state()).filter(item => item.privateOrigin).length, 3, 'Owner selector labels private references without granting context eligibility')
    context = await client.previewContext(project.id, privacy)
    assert.equal(context.references.length, 0, 'Origin privacy covers its chat, tasks and file references')
    assert.ok(context.excluded.every(item => item.reason === 'origin-private'))
    assert.equal((await client.search(project.id, 'research')).links.length, 3, 'Owner inspection is distinct from helper retrieval')
    state().sessions[0].privacy[flag] = false
    context = await client.previewContext(project.id, { ...privacy, [flag]: true })
    assert.equal(context.references.length, 0)
    assert.ok(context.excluded.every(item => item.reason === 'target-private'))
    assert.ok(context.instruction, 'Owner project instructions remain separate from memory/history')
  }
  state().sessions[0].incognito = true
  assert.equal((await client.previewContext(project.id, privacy)).references.length, 0)
  delete state().sessions[0].incognito
  await assert.rejects(client.previewContext(project.id, {}), /privacy/)
  const savedPrivacy = state().sessions[0].privacy
  delete state().sessions[0].privacy
  assert.equal(projectLinkCandidates(state()).length, 2, 'Selector fails closed on unknown origin privacy')
  assert.equal((await client.get(project.id)).links[0].labelSource, 'unavailable')
  assert.equal((await client.search(project.id, '')).links.length, 0)
  state().sessions[0].privacy = savedPrivacy
  state().sessions[0].title = 'Revised title'
  assert.equal((await client.get(project.id)).links[0].label, 'Revised title')
  assert.equal((await client.search(project.id, 'Research chat')).links.length, 0)
  state().tasks[0].sessionId = 'two'
  assert.equal((await client.get(project.id)).links[1].availability, 'origin-changed')
  assert.equal((await client.previewContext(project.id, privacy)).references.length, 2)
  await assert.rejects(client.link(project.id, task, project.revision), /origin changed/)
  state().tasks[0].sessionId = 'one'
  state().files.splice(0, 1)
  assert.equal((await client.get(project.id)).links[2].availability, 'unavailable', 'Same file ID in another chat cannot resolve a deleted reference')
  assert.equal((await client.search(project.id, 'reference')).links.length, 0)
  state().files.unshift({ id: 'file', name: 'Research reference', sessionId: 'one' })
  state().tasks[0].archivedAt = at
  assert.equal((await client.get(project.id)).links[1].availability, 'archived')
  assert.ok((await client.previewContext(project.id, privacy)).excluded.some(item => item.reason === 'source-archived'))
  await assert.rejects(client.link(second.id, task, 2), /unarchived/)
  state().tasks[0].archivedAt = null
  state().sessions[0].title = 'Research chat'
  project = await client.archive(project.id, true, project.revision)
  assert.equal(project.links.length, 3, 'Archiving preserves links and source work')
  context = await client.previewContext(project.id, privacy)
  assert.equal(context.instruction, null)
  assert.equal(context.references.length, 0)
  assert.ok(context.excluded.every(item => item.reason === 'project-archived'))
  await assert.rejects(client.update(project.id, input, project.revision), /Restore/)
  await assert.rejects(client.unlink(project.id, file, project.revision), /Restore/)
  await assert.rejects(client.remove(project.id, project.revision), /empty archived/)
  project = await client.archive(project.id, false, project.revision)
  const race = await Promise.allSettled([client.update(project.id, { ...input, name: 'Revised project' }, project.revision), client.update(project.id, { ...input, name: 'Stale project' }, project.revision)])
  assert.deepEqual(race.map(result => result.status), ['fulfilled', 'rejected'], 'Synchronous revision commit rejects competing stale writes')
  project = await client.get(project.id)
  for (const value of [chat, task, file]) project = await client.unlink(project.id, value, project.revision)
  await assert.rejects(client.remove(project.id, project.revision), /empty archived/)
  project = await client.archive(project.id, true, project.revision)
  await assert.rejects(client.remove(project.id, project.revision - 1), /changed/)
  await client.remove(project.id, project.revision)
  await assert.rejects(client.get(project.id), /not found/)
  assert.equal(JSON.stringify({ sessions: state().sessions, tasks: state().tasks, files: state().files }), sources, 'Project lifecycle never mutates or duplicates canonical records')
  assert.equal((await client.list()).length, 1, 'Other project remains untouched')
  assert.equal((await fixture().client.list()).length, 0, 'Client isolation, no implicit persistence')
  console.log('Project CRUD, revisions, scoped live references/search, origin privacy, archive/restore and source preservation checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
