// Runs every `check:*` npm script and fails if any of them fails.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFileSync } from "node:fs"

const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
const names = Object.keys(scripts).filter(name => name.startsWith("check:"))
const failed = []
const npmCli = process.env.npm_execpath
if (!npmCli || !existsSync(npmCli)) {
  throw new Error("npm_execpath is unavailable; run checks through npm")
}

for (const name of names) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [npmCli, "run", "--silent", name], { stdio: "inherit" })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`${result.status === 0 ? "pass" : "FAIL"}  ${name}  (${seconds}s)`)
  if (result.status !== 0) failed.push(name)
}

console.log(`\n${names.length - failed.length}/${names.length} check suites passed`)
if (failed.length) {
  console.log(`Failed: ${failed.join(", ")}`)
  process.exit(1)
}
