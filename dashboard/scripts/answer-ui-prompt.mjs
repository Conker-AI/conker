// The system prompt that teaches a model Conker's answer catalog, generated from the catalog itself
// (src/components/answer-ui/library.tsx) and pinned in Pi, which sends it with "Interactive answers".
//
//   node scripts/answer-ui-prompt.mjs [--check] [--print]
//
// The Pi checkout comes from PI_SOURCE (default ../../gates/pi); CI points it at the Pi commit in
// ../scripts/workspace-sources.json. --check fails when Pi's copy differs from what the catalog
// generates, so the UI never draws a catalog the model was not taught, or the reverse.
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const target = path.resolve(root, process.env.PI_SOURCE ?? "../../gates/pi", "pi/conversation/interactive_answers.txt")
const viteRequire = createRequire(import.meta.resolve("vite"))
const { build } = viteRequire("esbuild")
const requireFromRoot = createRequire(path.join(root, "package.json"))
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "conker-answer-ui-prompt-"))
let text
try {
  await build({
    entryPoints: [path.join(root, "src/components/answer-ui/library.tsx")], outfile: path.join(temporary, "library.cjs"),
    bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent", loader: { ".css": "empty" },
    tsconfig: path.join(root, "tsconfig.app.json"), define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "one-react-runtime", setup(builder) {
      builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: requireFromRoot.resolve(args.path), external: true }))
    } }],
  })
  const { answerUiPrompt } = await import(pathToFileURL(path.join(temporary, "library.cjs")))
  text = `${answerUiPrompt().trim()}\n`
} finally {
  assert(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}conker-answer-ui-prompt-`))
  await fs.rm(temporary, { recursive: true, force: true })
}

function assert(value) { if (!value) throw new Error("Refusing to remove an unexpected temporary directory.") }

if (process.argv.includes("--print")) process.stdout.write(text)
else if (process.argv.includes("--check")) {
  const pinned = await fs.readFile(target, "utf8").catch(() => null)
  if (pinned === null) {
    console.error(`Pi has no catalog prompt at ${target}. Run npm run answer-ui:prompt against that Pi checkout.`)
    process.exit(1)
  }
  if (pinned.replace(/\r\n/g, "\n") !== text) {
    console.error(`Pi's catalog prompt (${target}) differs from the dashboard's catalog. Run npm run answer-ui:prompt, then commit it in Pi.`)
    process.exit(1)
  }
  console.log(`Answer catalog prompt matches Pi (${text.length} characters).`)
} else {
  await fs.writeFile(target, text)
  console.log(`wrote ${target} (${text.length} characters)`)
}
