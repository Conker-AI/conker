// Runs every `check:*` npm script and fails if any of them fails.
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
const names = Object.keys(scripts).filter(name => name.startsWith("check:"))
const failed = []

for (const name of names) {
  const started = Date.now()
  const result = spawnSync("npm", ["run", "--silent", name], { stdio: "inherit", shell: true })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`${result.status === 0 ? "pass" : "FAIL"}  ${name}  (${seconds}s)`)
  if (result.status !== 0) failed.push(name)
}

console.log(`\n${names.length - failed.length}/${names.length} check suites passed`)
if (failed.length) {
  console.log(`Failed: ${failed.join(", ")}`)
  process.exit(1)
}
