const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative)
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') : load(request.startsWith('@/') ? 'src/' + request.slice(2) + '.ts' : path.posix.normalize(path.posix.join(path.posix.dirname(relative), request)) + '.ts'), module, module.exports)
  cache.set(relative, module.exports)
  return module.exports
}
const { artifactSource, parseArtifactSource, artifactChartModel, fencedArtifactCode, emptyArtifactContent } = load('src/components/artifacts/content.ts')
for (const kind of ['markdown', 'code', 'table', 'chart', 'diagram', 'media']) {
  const value = emptyArtifactContent(kind)
  assert.deepEqual(parseArtifactSource(kind, artifactSource(value), value.language), value)
  if (kind === 'chart' || kind === 'table') assert.equal(value.rows.length, 0, 'Creation supplies no invented sample data')
  if (kind === 'diagram') assert.deepEqual([value.nodes, value.edges], [[], []])
}
const diagram = { kind: 'diagram', nodes: [{ id: 'a', label: '<script>inert label</script>', x: 0, y: 0 }, { id: 'b', label: 'Review', x: 200, y: 120 }], edges: [{ id: 'ab', source: 'a', target: 'b', label: 'Then' }] }
assert.deepEqual(parseArtifactSource('diagram', artifactSource(diagram)), diagram)
for (const invalid of [
  { ...diagram, nodes: [diagram.nodes[0], diagram.nodes[0]] },
  { ...diagram, edges: [diagram.edges[0], diagram.edges[0]] },
  { ...diagram, edges: [{ ...diagram.edges[0], target: 'missing' }] },
  { ...diagram, edges: [{ ...diagram.edges[0], target: 'a' }] },
  { ...diagram, nodes: [{ ...diagram.nodes[0], x: 10001 }] },
  { ...diagram, nodes: [{ ...diagram.nodes[0], label: '' }] },
  { ...diagram, nodes: [{ ...diagram.nodes[0], style: { color: 'red' } }] },
  { ...diagram, nodes: Array.from({ length: 101 }, (_, i) => ({ id: `n${i}`, label: 'Node', x: 0, y: 0 })) },
  { ...diagram, edges: Array.from({ length: 201 }, (_, i) => ({ ...diagram.edges[0], id: `e${i}` })) },
  { ...diagram, execute: 'alert(1)' },
]) assert.throws(() => parseArtifactSource('diagram', JSON.stringify(invalid)))
const table = { kind: 'table', columns: ['Name', 'Value'], rows: [['<script>alert(1)</script>', '=HYPERLINK("https://example.com")']] }
assert.deepEqual(parseArtifactSource('table', JSON.stringify(table)), table, 'Cell data remains text for the native table')
assert.throws(() => parseArtifactSource('table', '{"kind":"table","columns":["A"],"rows":[["one","two"]]}'), /column/)
assert.throws(() => parseArtifactSource('table', '{not json'), /valid JSON/)
assert.throws(() => parseArtifactSource('chart', JSON.stringify(table)), /chart format/)
assert.throws(() => parseArtifactSource('markdown', 'a'.repeat(250001)), /250,000/)
assert.throws(() => parseArtifactSource('code', 'text', '</code><script>'), /language/)
const hostileLabel = 'x;} </style><script>alert(1)</script>'
const chart = { kind: 'chart', chartType: 'line', xLabel: 'Week', series: [{ label: hostileLabel }, { label: '__proto__' }], rows: [{ label: 'constructor', values: [1, -2] }] }
const model = artifactChartModel(chart)
assert.deepEqual(Object.keys(model.config), ['series0', 'series1'], 'Untrusted labels never become CSS variable keys')
assert.deepEqual(Object.keys(model.rows[0]), ['category', 'series0', 'series1'], 'Untrusted labels never become data property paths')
assert.equal(model.rows[0].category, 'constructor')
assert.equal(model.config.series0.label, hostileLabel)
assert.ok(Object.values(model.config).every(config => /^var\(--chart-[1-5]\)$/.test(config.color)), 'Only fixed semantic theme colors reach chart CSS')
assert.throws(() => artifactChartModel({ ...chart, rows: [{ label: 'invalid', values: [Infinity, 0] }] }))
assert.throws(() => artifactChartModel({ ...chart, rows: Array.from({ length: 501 }, () => ({ label: 'too many', values: [1, 2] })) }))
assert.throws(() => parseArtifactSource('chart', JSON.stringify({ ...chart, formatter: 'alert(1)' })), /Unrecognized/)
const tick = String.fromCharCode(96)
const code = tick.repeat(3) + '\n<script>alert(1)</script>\n' + tick.repeat(6) + '\n<img src=x>'
const fenced = fencedArtifactCode(code, 'html')
assert.ok(fenced.startsWith(tick.repeat(7) + 'html\n'))
assert.ok(fenced.endsWith('\n' + tick.repeat(7)))
assert.equal(fenced.slice(fenced.indexOf('\n') + 1, fenced.lastIndexOf('\n')), code, 'Code content is exact and cannot close its wrapper fence')
console.log('Artifact source round-trip, native chart key/CSS isolation, bounds, no-sample creation and inert code-fence checks passed.')
