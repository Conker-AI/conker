const fs = require("node:fs")
const path = require("node:path")

const sourceRoot = path.resolve(__dirname, "../src")
const extensions = [".tsx", ".ts", ".jsx", ".js"]
const files = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(path.resolve(file))
    }
  }
}

walk(sourceRoot)

const fileSet = new Set(files)

function resolveImport(importer, specifier) {
  let base
  if (specifier.startsWith("@/")) {
    base = path.join(sourceRoot, specifier.slice(2))
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(importer), specifier)
  } else {
    return null
  }

  const candidates = [
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => path.join(base, `index${extension}`)),
    base,
  ]
  return candidates.map(path.normalize).find((candidate) => fileSet.has(candidate)) ?? null
}

function importsFor(file) {
  const source = fs.readFileSync(file, "utf8")
  const imports = new Set()
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveImport(file, match[1])
      if (resolved) imports.add(resolved)
    }
  }
  return [...imports]
}

const graph = new Map(files.map((file) => [file, importsFor(file)]))
const entry = path.resolve(sourceRoot, "main.tsx")
const reachable = new Set()
const pending = [entry]

while (pending.length) {
  const file = pending.pop()
  if (reachable.has(file)) continue
  reachable.add(file)
  pending.push(...(graph.get(file) ?? []))
}

const unreachable = files
  .filter((file) => !file.endsWith(".d.ts"))
  .filter((file) => !reachable.has(file))
  .map((file) => path.relative(sourceRoot, file).replaceAll("\\", "/"))
  .sort()

if (unreachable.length) {
  console.error("Source modules unreachable from src/main.tsx:")
  for (const file of unreachable) console.error(`- ${file}`)
  process.exit(1)
}

console.log(`source reachability: ${reachable.size}/${files.length - 1} modules connected`)
