const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const slash = value => value.replaceAll('\\', '/')
function resolve(from, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2)) : path.resolve(path.dirname(from), specifier)
  if (/\.(css|svg|png|jpg|woff2?)$/.test(base)) return null
  for (const candidate of [base, ...['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'].map(ext => base + ext)]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  throw new Error(`Unresolved local dependency ${specifier} from ${slash(path.relative(root, from))}`)
}
function imports(file) {
  // Follow emitted value dependencies, not type-only imports or a text search over comments.
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const tree = ts.createSourceFile(file, output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const found = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) found.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found.map(specifier => resolve(file, specifier)).filter(Boolean)
}
function graph(entry) {
  const chains = new Map(), pending = [[path.resolve(root, entry)]]
  while (pending.length) {
    const chain = pending.pop(), file = chain.at(-1)
    if (chains.has(file)) continue
    chains.set(file, chain)
    for (const next of imports(file)) pending.push([...chain, next])
  }
  return chains
}
const forbidden = file => /^(src\/lib\/api\/(index|store|provider|fixture-adapter|rich-answer-fixture)\.(ts|tsx)|src\/components\/fixture-workspace\.tsx)$/.test(file) || /(^|\/)fixtures?(\/|\.)/.test(file)
for (const entry of ['src/components/auth/gateway-entry.tsx', 'src/components/auth/gateway-boundary.tsx', 'src/components/rich-answer.tsx', 'src/components/design-system/primitives.tsx']) {
  const reachable = graph(entry)
  for (const [file, chain] of reachable) {
    assert.ok(!forbidden(slash(path.relative(root, file))), `Gateway must not initialize preview data:\n${chain.map(item => slash(path.relative(root, item))).join(' → ')}`)
  }
  console.log(`PASS ${entry}: ${reachable.size} value-dependency modules, no fixture state`)
}
// Prove the traversal recognizes the known boundary and follows barrel reexports.
const fixtureGraph = graph('src/components/fixture-workspace.tsx')
assert.ok([...fixtureGraph.keys()].some(file => slash(path.relative(root, file)) === 'src/lib/api/fixture-adapter.ts'))
assert.ok(![...graph('src/lib/api/index.ts').keys()].some(file => slash(path.relative(root, file)) === 'src/lib/api/fixture-adapter.ts'))
assert.ok([...graph('src/components/design-system/index.tsx').keys()].some(file => slash(path.relative(root, file)) === 'src/lib/api/store.ts'))
console.log('Gateway import isolation checks passed.')
