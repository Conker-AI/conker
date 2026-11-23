// Prompt templates on Pi: the editor's rules, the strict client, the wand's fill summary, and the
// preview gateway answering like Pi (starters, 409 on a stale version, 100 at most, a fill from a draft).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const resolve = request => request.startsWith('@/') ? `src/${request.slice(2)}.ts` : `${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`
  new Function('require', 'module', 'exports', code)(request => request === 'zod' || request === 'openapi-fetch' ? require(request) : load(resolve(request)), module, module.exports)
  return module.exports
}
const { TEMPLATE_LIMITS, createPromptTemplatesClient, toPromptTemplate } = load('src/lib/gateway/prompt-templates.ts')
const { blankField, blankTemplate, editorFrom, fieldIdFor, isChanged, toDraft } = load('src/lib/chat/template-editor.ts')
const { templateFill } = load('src/lib/chat/template-fill.ts')
const { promptMessage, isStaleTemplate } = load('src/lib/gateway/prompt-errors.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')
const { createFakePrompts } = load('src/dev/fake-gateway-prompts.ts')
const route = suffix => `/api/control/pi/prompts/${suffix}`

async function main() {
  // The editor: plain sentences for what to fix, never a draft with a problem in it.
  const blank = blankTemplate()
  assert.equal(toDraft(blank).draft, null)
  assert.deepEqual(toDraft(blank).problems, ['Give the template a name.'])
  const named = { ...blank, name: '  Trip plan  ' }
  const made = toDraft(named)
  assert.deepEqual(made.problems, [])
  assert.equal(made.draft.name, 'Trip plan')
  assert.deepEqual(made.draft.fields.map(item => [item.id, item.label, item.type, item.required]), [['request', 'Request', 'longText', true]])
  assert.deepEqual(toDraft({ ...named, fields: [] }).problems, ['Add at least one field.'])
  assert.equal(toDraft({ ...named, fields: Array.from({ length: 13 }, () => ({ ...blankField(), label: 'x' })) }).problems.length, 1, 'at most 12 fields')
  const choice = { ...blankField(), label: 'Tone', type: 'choice', optionsText: '' }
  assert.match(toDraft({ ...named, fields: [choice] }).problems[0], /needs at least one option/)
  assert.match(toDraft({ ...named, fields: [{ ...choice, optionsText: 'Warm\nwarm' }] }).problems[0], /same option twice/)
  const picked = toDraft({ ...named, fields: [{ ...choice, optionsText: ' Warm \n\nFirm ', multiple: true }, { ...blankField(), label: 'Day', type: 'date', multiple: true, optionsText: 'ignored' }] }).draft
  assert.deepEqual(picked.fields[0].options, ['Warm', 'Firm'])
  assert.equal(picked.fields[0].multiple, true)
  assert.equal(picked.fields[1].multiple, false, 'only a choice can allow several')
  assert.equal('options' in picked.fields[1], false, 'only a choice has options')
  // Ids: Pi's own stay, new ones come from the label and never collide.
  assert.equal(fieldIdFor('What happened', new Set()), 'whatHappened')
  assert.equal(fieldIdFor('What happened', new Set(['whatHappened'])), 'whatHappened2')
  assert.match(fieldIdFor('2nd try', new Set()), /^[A-Za-z][A-Za-z0-9_]{0,31}$/)
  assert.match(fieldIdFor('???', new Set()), /^[A-Za-z][A-Za-z0-9_]{0,31}$/)
  assert.match(fieldIdFor('x'.repeat(80), new Set()), /^[A-Za-z][A-Za-z0-9_]{0,31}$/)
  const twins = toDraft({ ...named, fields: [{ ...blankField(), label: 'Topic' }, { ...blankField(), label: 'Topic' }] }).draft
  assert.equal(new Set(twins.fields.map(item => item.id)).size, 2)

  // The strict client and the wand's reply, against the preview gateway that answers like Pi.
  const fake = createFakePrompts()
  const request = async (path, options = {}) => {
    const reply = fake.handle(path, options.method ?? 'GET', options)
    if (!reply) throw new Error(`no fake route ${path}`)
    return reply
  }
  const client = createPromptTemplatesClient({ request })
  const page = await client.list()
  assert.deepEqual(page.items.map(item => item.id), ['starter-research', 'starter-bug-report', 'starter-plan', 'starter-email'])
  assert.ok(page.items.every(item => item.starter && item.revision === 1))
  const saved = await client.create(toDraft({ ...named, name: 'Trip plan', description: 'Where and when' }).draft)
  assert.match(saved.id, /^tpl_[0-9a-f]{32}$/)
  assert.equal((await client.list()).items.at(-1).id, saved.id, 'his own come after the starters')
  const edited = await client.update(saved.id, { name: 'Trip', description: '', fields: saved.fields }, saved.revision)
  assert.equal(edited.revision, 2)
  await assert.rejects(client.update(saved.id, { name: 'Late', description: '', fields: saved.fields }, saved.revision), error => isStaleTemplate(error) && error.status === 409)
  assert.equal((await client.get(saved.id)).name, 'Trip', 'a stale save changed nothing')
  assert.match(promptMessage(new GatewayError('http', 409, undefined, 'revision_conflict')), /changed somewhere else/)
  assert.match(promptMessage(new GatewayError('http', 503, undefined, 'spending_cap_reached')), /spending limit/)
  await assert.rejects(client.remove(saved.id, 1), error => isStaleTemplate(error))
  assert.deepEqual(await client.remove(saved.id, 2), { id: saved.id, deleted: true })
  await assert.rejects(client.get(saved.id), error => error.code === 'template_not_found')
  await assert.rejects(client.get('nope'), error => error.kind === 'validation', 'a malformed id never reaches Pi')
  // A deleted starter does not come back.
  await client.remove('starter-plan', 1)
  assert.equal((await client.list()).items.some(item => item.id === 'starter-plan'), false)
  // The strict schema refuses a reply with an extra key or a bad field type.
  const strict = createPromptTemplatesClient({ request: async () => ({ items: [], total: 0, extra: true }) })
  await assert.rejects(strict.list(), error => error.kind === 'invalid-response')
  const odd = createPromptTemplatesClient({ request: async () => ({ template: { ...page.items[0], fields: [{ ...page.items[0].fields[0], type: 'colour' }] } }) })
  await assert.rejects(odd.get('starter-research'), error => error.kind === 'invalid-response')
  // At most 100.
  const crowded = createFakePrompts()
  const fill = { name: 'T', description: '', fields: [{ id: 'topic', label: 'Topic', type: 'shortText', required: false, multiple: false }] }
  for (let count = 4; count < TEMPLATE_LIMITS.templates; count++) crowded.handle(route('templates'), 'POST', { body: fill })
  assert.throws(() => crowded.handle(route('templates'), 'POST', { body: fill }), error => error.code === 'too_many')

  // The editor opened from a template holds what Pi sent, and only a real change counts as one.
  const research = page.items[0]
  const state = editorFrom(research)
  assert.equal(isChanged(state, editorFrom(research)), false)
  assert.equal(isChanged({ ...state, name: 'Research more' }, editorFrom(research)), true)
  assert.ok(state.fields.every(item => item.id), 'Pi\'s field ids are kept')

  // The wand: a plain rewrite, then a template fill that says what it filled and what is still empty.
  const plain = fake.handle(route('enhance'), 'POST', { body: { text: 'plan my week' } })
  assert.equal(plain.templateId, null)
  const filled = fake.handle(route('enhance'), 'POST', { body: { text: 'Best laptop for travel, Table please', templateId: 'starter-research' } })
  assert.equal(filled.templateId, 'starter-research')
  assert.deepEqual(filled.missing, [])
  assert.match(filled.text, /^Research request\n\nSubject:\nBest laptop for travel/)
  assert.deepEqual(templateFill(toPromptTemplate(research), filled), { filled: ['Subject', 'Output'], blank: ['Do', "Don't", 'Context'], missing: [] })
  assert.deepEqual(templateFill(toPromptTemplate(research), { fields: {}, missing: ['Subject'] }), { filled: [], blank: ["Do", "Don't", 'Output', 'Context'], missing: ['Subject'] })
  assert.throws(() => fake.handle(route('enhance'), 'POST', { body: { text: 'x', templateId: 'starter-nothing' } }), error => error.code === 'template_not_found')
  assert.throws(() => fake.handle(route('enhance'), 'POST', { body: { text: 'hello', templateId: 'starter-plan' } }), () => true)

  // Source rules: the wand never sends, and the screen wires one picker for both composers.
  const wand = fs.readFileSync(path.join(root, 'src/components/gateway/prompt-enhance-control.tsx'), 'utf8')
  assert.doesNotMatch(wand, /submit|onSend|sendMessage/i, 'the wand never sends')
  assert.match(wand, /Show original/)
  assert.match(wand, />Undo</)
  assert.match(wand, /Just rewrite it/)
  const workspace = fs.readFileSync(path.join(root, 'src/components/gateway/prompt-templates-workspace.tsx'), 'utf8')
  assert.match(workspace, /isStaleTemplate/)
  console.log('Prompt templates on Pi: editor rules, strict client, stale version, limit, wand fill and preview answers passed.')
}
main().catch(error => { console.error(error); process.exit(1) })
