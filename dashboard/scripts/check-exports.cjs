// Owner downloads (contract 1): fixed routes, the asked-for document type only, a 16 MB cap,
// readable file names that cannot name a path, and Pi's refusals shown in plain words only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') : load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}
const { createGatewayFileTransfer, downloadFilename, GatewayRefusal, GATEWAY_DOWNLOAD_LIMIT } = load('src/lib/gateway/file-transfer.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')
const { answerFormats, artifactFormats, createGatewayExportsClient, exportRefusalMessage } = load('src/lib/gateway/exports.ts')

const origin = 'https://conker.example', artifact = `artifact_${'a'.repeat(32)}`, session = `ses_${'1'.repeat(16)}`, message = `msg_${'2'.repeat(16)}`
const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const file = (body, type, headers = {}) => new Response(body, { status: 200, headers: { 'Content-Type': type, ...headers } })
const refusal = (code, status = 422, message = 'Upstream words are never shown.') => new Response(JSON.stringify({ detail: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } })
const rejects = (promise, test) => assert.rejects(promise, test)

async function main() {
  const calls = []
  let reply = () => file('PK\u0003\u0004 document', docx, { 'Content-Disposition': "attachment; filename=\"Plan.docx\"; filename*=UTF-8''Plan%20f%C3%BCr%20Montag.docx" })
  const transfer = createGatewayFileTransfer(origin, async (url, init) => { calls.push({ url, init }); return reply(url, init) })

  const saved = await transfer.download(`/api/control/pi/artifacts/${artifact}/download`, { format: 'docx' })
  assert.equal(saved.filename, 'Plan für Montag.docx')
  assert.equal(saved.blob.type, docx)
  assert.equal(await saved.blob.text(), 'PK\u0003\u0004 document')
  const sent = calls.pop()
  assert.equal(sent.url, `${origin}/api/control/pi/artifacts/${artifact}/download?format=docx`)
  assert.deepEqual([sent.init.method, sent.init.credentials, sent.init.mode, sent.init.cache, sent.init.redirect], ['GET', 'same-origin', 'same-origin', 'no-store', 'error'])
  console.log('PASS a download keeps its readable name and asks for exactly one format')

  for (const [route, query] of [
    [`/api/control/pi/sessions/${session}/messages/${message}/download`, { format: 'csv' }],
    [`/api/control/pi/sessions/${session}/messages/${message}/download`, { format: 'pdf', version: 1 }],
    [`/api/control/pi/artifacts/${artifact}/download`, { format: 'html' }],
    [`/api/control/pi/artifacts/${artifact}/download`, { format: 'pdf', version: 2 }],
    ['/api/control/pi/artifacts/artifact_x/download', { format: 'pdf' }],
    [`/api/control/pi/artifacts/${artifact}/export`, { format: 'json' }],
  ]) await rejects(transfer.download(route, query), error => error instanceof GatewayError && error.kind === 'validation')
  assert.equal(calls.length, 0)
  console.log('PASS only the two download routes and their formats leave the browser')

  reply = () => file('<html>', 'text/html')
  await rejects(transfer.download(`/api/control/pi/artifacts/${artifact}/download`, { format: 'pdf' }), error => error.kind === 'invalid-response')
  reply = () => file('x', 'application/pdf', { 'Content-Length': String(GATEWAY_DOWNLOAD_LIMIT + 1) })
  await rejects(transfer.download(`/api/control/pi/artifacts/${artifact}/download`, { format: 'pdf' }), error => error instanceof GatewayRefusal && error.refusal === 'export_too_big')
  console.log('PASS a different type or a file over 16 MB is never saved')

  reply = () => refusal('export_page_cells')
  let failure = await transfer.download(`/api/control/pi/sessions/${session}/messages/${message}/download`, { format: 'pdf' }).catch(error => error)
  assert.ok(failure instanceof GatewayRefusal && failure.refusal === 'export_page_cells' && failure.status === 422)
  assert.equal(exportRefusalMessage(failure), 'Tables over 10,000 cells export only as Excel (.xlsx).')
  reply = () => refusal('export_busy', 503)
  assert.equal(exportRefusalMessage(await transfer.download(`/api/control/pi/artifacts/${artifact}/download`, { format: 'pptx' }).catch(error => error)), 'Two exports are already running. Try again in a moment.')
  reply = () => refusal('something_new', 422, '<img src=x onerror=alert(1)>')
  failure = await transfer.download(`/api/control/pi/artifacts/${artifact}/download`, { format: 'pdf' }).catch(error => error)
  assert.ok(!(failure instanceof GatewayRefusal) && failure.kind === 'http')
  assert.ok(!exportRefusalMessage(failure).includes('<img'))
  reply = () => new Response('Request Entity Too Large', { status: 413, headers: { 'Content-Type': 'text/plain' } })
  assert.match(exportRefusalMessage(await transfer.download(`/api/control/pi/artifacts/${artifact}/download`, { format: 'xlsx' }).catch(error => error)), /16 MB/)
  console.log('PASS Pi refusals read in plain words; unknown codes and their text are never shown')

  assert.equal(downloadFilename('attachment; filename="../../evil.exe"', 'pdf'), 'conker-export.pdf')
  assert.equal(downloadFilename('attachment; filename="a/b\\\\c:d.pdf"', 'pdf'), 'abcd.pdf')
  assert.equal(downloadFilename('attachment; filename=".pdf"', 'pdf'), 'conker-export.pdf')
  assert.equal(downloadFilename("attachment; filename=\"x.pdf\"; filename*=UTF-8''%E0%A4", 'pdf'), 'x.pdf')
  assert.equal(downloadFilename(null, 'csv'), 'conker-export.csv')
  assert.equal(downloadFilename("attachment; filename*=UTF-8''report%E2%80%AEfdp.pdf", 'pdf'), 'reportfdp.pdf')
  console.log('PASS file names cannot climb folders, change extension or carry control characters')

  const asked = []
  const client = createGatewayExportsClient({ download: async (...args) => { asked.push(args); return { blob: new Blob(['x']), filename: 'x.pdf' } } })
  await client.artifact(artifact, 'xlsx')
  await client.answer(session, message, 'pdf')
  assert.deepEqual(asked.map(item => item.slice(0, 2)), [[`/api/control/pi/artifacts/${artifact}/download`, { format: 'xlsx' }], [`/api/control/pi/sessions/${session}/messages/${message}/download`, { format: 'pdf' }]])
  assert.throws(() => client.answer('ses_1', message, 'pdf'), error => error.kind === 'validation')
  assert.throws(() => client.artifact('../x', 'pdf'), error => error.kind === 'validation')
  console.log('PASS the exports client names the exact answer or artifact')

  assert.deepEqual(answerFormats(false), ['docx', 'pdf', 'pptx'])
  assert.deepEqual(answerFormats(true), ['docx', 'pdf', 'pptx', 'xlsx'])
  assert.deepEqual(artifactFormats({ kind: 'table', columns: ['a'], rows: [] }, false), ['docx', 'pdf', 'pptx', 'xlsx', 'csv'])
  assert.deepEqual(artifactFormats({ kind: 'markdown', text: '# x' }, false), ['docx', 'pdf', 'pptx'])
  assert.deepEqual(artifactFormats({ kind: 'markdown', text: '| a |\n| - |' }, true), ['docx', 'pdf', 'pptx', 'xlsx'])
  assert.deepEqual(artifactFormats({ kind: 'code', text: 'x', language: 'py' }, false), ['docx', 'pdf', 'pptx'])
  assert.deepEqual(artifactFormats({ kind: 'chart', chartType: 'bar', xLabel: '', series: [{ label: 'a' }], rows: [] }, false), ['json'])
  assert.deepEqual(artifactFormats({ kind: 'html', text: '<p>' }, false), [])
  console.log('PASS Excel appears only with a table; CSV and JSON stay where they were')

  const transcript = fs.readFileSync(path.join(root, 'src/components/chat/transcript.tsx'), 'utf8'), adapter = fs.readFileSync(path.join(root, 'src/lib/chat/gateway-adapter.ts'), 'utf8')
  assert.match(transcript, /<AnswerExportMenu text=\{message\.content\.text\} run=\{message\.export\.run\}/)
  assert.match(adapter, /message\.role !== 'assistant' \|\| message\.content\.kind !== 'text' \|\| isForgotten\(state\)\) return \{\}/)
  assert.match(fs.readFileSync(path.join(root, 'src/components/gateway/artifacts-workspace.tsx'), 'utf8'), /<ExportMenu choices=\{exportChoices\}/)
  console.log('Export checks passed.')
}
main().catch(error => { console.error(error); process.exit(1) })
