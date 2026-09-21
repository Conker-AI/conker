const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const fromRoot = createRequire(path.join(root, 'package.json'))
const { build } = createRequire(fromRoot.resolve('vite'))('esbuild')
async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'conker-preferences-'))
  try {
    const output = path.join(temporary, 'preferences.cjs')
    await build({ stdin: { contents: 'export {useOwnerPreferences} from "./src/lib/owner-preferences-workspace"; export {conkerClient} from "./src/lib/api"; export {createFixtureClient} from "./src/lib/api/fixture-adapter";', resolveDir: root }, outfile: output, bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' }, tsconfig: path.join(root, 'tsconfig.app.json'), logLevel: 'silent' })
    const { useOwnerPreferences: workspace, conkerClient: client, createFixtureClient } = require(output)
    const original = await client.ownerPreferences.load(), snapshot = await client.load()
    const valid = { ...original, quietHours: { ...original.quietHours, start: '23:00', end: '06:30', timeZone: '  UTC  ' }, dailyBudget: { suggestions: 0, researchMinutes: 0, costCents: 0 }, idleTimeoutMinutes: 5 }
    const saved = await client.ownerPreferences.save(valid)
    assert.equal(saved.quietHours.timeZone, 'UTC')
    valid.quietHours.start = '00:00'; saved.dailyBudget.suggestions = 99
    assert.equal((await client.ownerPreferences.load()).quietHours.start, '23:00')
    assert.equal((await client.ownerPreferences.load()).dailyBudget.suggestions, 0)
    const current = await client.ownerPreferences.load()
    for (const invalid of [
      { urgency: 'always' }, { idleTimeoutMinutes: 1 },
      { quietHours: { ...current.quietHours, start: '24:01' } },
      { quietHours: { ...current.quietHours, end: current.quietHours.start } },
      { quietHours: { ...current.quietHours, timeZone: 'not/a-zone' } },
      { dailyBudget: { ...current.dailyBudget, suggestions: -1 } },
      { dailyBudget: { ...current.dailyBudget, researchMinutes: 1441 } },
      { dailyBudget: { ...current.dailyBudget, costCents: 1.5 } },
      { dailyBudget: { ...current.dailyBudget, costCents: NaN } },
    ]) { await assert.rejects(client.ownerPreferences.save({ ...current, ...invalid })); assert.deepEqual(await client.ownerPreferences.load(), current, 'Invalid preferences must not partially save') }
    await workspace.getState().load()
    const draft = { ...workspace.getState().draft, urgency: 'urgent_only', idleTimeoutMinutes: 60 }
    workspace.getState().update(draft)
    await workspace.getState().load()
    assert.equal(workspace.getState().draft.urgency, 'urgent_only', 'Route remount must not replace unsaved draft')
    assert.equal(workspace.getState().draft.idleTimeoutMinutes, 60)
    const originalSave = client.ownerPreferences.save
    client.ownerPreferences.save = async () => { throw new Error('Controlled preference save failure') }
    await workspace.getState().save()
    assert.match(workspace.getState().error, /Controlled/)
    assert.equal(workspace.getState().draft.urgency, 'urgent_only')
    assert.equal(workspace.getState().pending, false)
    client.ownerPreferences.save = originalSave
    await workspace.getState().save()
    assert.equal(workspace.getState().saved.idleTimeoutMinutes, 60)
    workspace.getState().update({ ...workspace.getState().draft, urgency: 'off' })
    workspace.getState().discard()
    assert.equal(workspace.getState().draft.urgency, 'urgent_only')
    assert.deepEqual(await client.load(), snapshot, 'Preferences must not alter auth, grants, jobs, or other snapshot data')
    assert.deepEqual(await createFixtureClient().ownerPreferences.load(), original, 'Reload resets fixture preferences')
    console.log('Owner preferences passed: overnight/timezone validation, zero/bounded budgets, idle timeout validation, atomic failure, independent clones, retained drafts, save/discard/retry, no authority/auth effects, and fixture reset.')
  } finally {
    assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}conker-preferences-`))
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
