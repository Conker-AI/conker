const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const ts = require(path.join(root, 'node_modules/typescript'))
const cache = new Map()
globalThis.crypto ??= webcrypto
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }; cache.set(relative, module)
  const resolve = request => {
    if (request === 'zod') return require(path.join(root, 'node_modules/zod'))
    assert.ok(request.startsWith('.'), `Unexpected dependency: ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }
  new Function('require', 'module', 'exports', compiled.outputText)(resolve, module, module.exports)
  return module.exports
}
async function main() {
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const { characterDraft, exportCharacter, importCharacter, removeCharacterAsset, validateCharacter } = load('src/lib/api/character.ts')
  const client = createFixtureClient()
  const original = await client.load()
  const draft = characterDraft(original.profile)
  draft.name = '  Rowan  '
  draft.studio.soul = 'Think carefully and speak plainly.'
  draft.studio.backstory = 'A fictional field researcher.'
  draft.studio.voice.reference = { name: 'reference.wav', src: 'data:audio/wav;base64,YQ==' }
  draft.studio.appearance.assets.push({ id: 'portrait-1', name: 'Listening', kind: 'image', src: 'data:image/png;base64,YQ==' })
  draft.studio.appearance.activities.listening = 'portrait-1'
  draft.studio.appearance.expressions.push({ id: 'amused', name: 'Quietly amused', instruction: 'Light humor', assetId: 'portrait-1' })
  const saved = await client.saveCharacter(draft)
  assert.equal(saved.name, 'Rowan')
  draft.studio.soul = 'Unsaved'
  assert.equal((await client.load()).profile.studio.soul, 'Think carefully and speak plainly.')
  const roundtrip = importCharacter(exportCharacter(saved), original.profile)
  assert.deepEqual(roundtrip.profile, saved)
  const removed = removeCharacterAsset(saved.studio, 'portrait-1')
  assert.equal(removed.appearance.assets.length, 0)
  assert.equal(removed.appearance.activities.listening, null)
  assert.equal(removed.appearance.expressions[0].assetId, null)
  assert.throws(() => validateCharacter({ ...saved, name: ' ' }), /name/)
  assert.throws(() => validateCharacter({ ...saved, portrait: 'https://example.com/private.png' }), /image/)
  const invalid = structuredClone(saved); invalid.studio.appearance.activities.thinking = 'missing'
  assert.throws(() => validateCharacter(invalid), /missing asset/)
  for (const id of ['', 'main', 'neutral']) {
    const badId = structuredClone(saved); badId.studio.appearance.assets[0].id = id
    assert.throws(() => validateCharacter(badId))
  }
  const duplicates = structuredClone(saved)
  duplicates.studio.details = [{ id: 'detail', label: 'A', value: '1' }, { id: 'detail', label: 'B', value: '2' }]
  assert.throws(() => validateCharacter(duplicates), /detail IDs/)
  assert.throws(() => importCharacter('not json', saved), /valid JSON/)
  assert.throws(() => importCharacter('{"version":55}', saved), /package/)
  const card = importCharacter(JSON.stringify({ spec: 'chara_card_v3', data: { name: 'Mira', description: 'Lore', personality: 'Observant', scenario: 'Creative partner', first_mes: 'Hello.', system_prompt: 'Do not import this.' } }), saved)
  assert.equal(card.profile.name, 'Mira')
  assert.equal(card.profile.studio.backstory, 'Lore')
  assert.equal(card.profile.studio.voice.reference.name, 'reference.wav')
  assert.ok(!JSON.stringify(card.profile).includes('Do not import this.'))
  const focus = await client.previewCharacter(saved, 'focus')
  const character = await client.previewCharacter(saved, 'character')
  assert.equal(focus.kind, 'authored-example'); assert.equal(focus.text, saved.studio.examples.focus)
  assert.equal(character.text, saved.studio.examples.character)
  const before = (await client.load()).conversations.companion
  await client.updateConversation('companion', { presentationMode: 'focus' })
  const after = (await client.load()).conversations.companion
  assert.equal(after.presentationMode, 'focus')
  assert.deepEqual(after.privacy, before.privacy); assert.deepEqual(after.grants, before.grants); assert.deepEqual(after.memory, before.memory)
  await assert.rejects(client.updateConversation('companion', { presentationMode: 'invalid' }), /Focus or Character/)
  const user = await client.sendMessage('companion', 'Test fork')
  const fork = await client.forkConversation('companion', user.id)
  assert.equal((await client.load()).conversations[fork.id].presentationMode, 'focus')
  await client.updateConversation(fork.id, { presentationMode: 'character' })
  assert.equal((await client.load()).conversations.companion.presentationMode, 'focus')
  saved.studio.modes.default = 'focus'
  await client.saveCharacter(saved)
  await client.deleteConversation('companion')
  assert.equal((await client.load()).conversations.companion.presentationMode, 'focus')
  assert.deepEqual((await createFixtureClient().load()).profile, original.profile)
  console.log('Character checks passed: validation, deep-copy save, package round-trip, safe text import, asset removal, authored previews, mode/privacy independence, fork isolation, fixture reset.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
