const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const { pathToFileURL } = require("node:url")

async function main() {
  const module = await import(pathToFileURL(__dirname + "/run-checks.mjs").href)
  
  // Test parseArgs defaults
  assert.deepStrictEqual(module.parseArgs([]), { only: null, jobs: 1, list: false })
  
  // Test parseArgs with all options
  const result = module.parseArgs(["--only=tool,chat", "--jobs=4", "--list"])
  assert.deepStrictEqual(result.only, ["tool", "chat"])
  assert.strictEqual(result.jobs, 4)
  assert.strictEqual(result.list, true)
  
  // Test parseArgs errors
  assert.throws(() => module.parseArgs(["--jobs=0"]), /Usage:/)
  assert.throws(() => module.parseArgs(["--jobs=17"]), /Usage:/)
  assert.throws(() => module.parseArgs(["--jobs=x"]), /Usage:/)
  assert.throws(() => module.parseArgs(["--only="]), /Usage:/)
  assert.throws(() => module.parseArgs(["--bogus"]), /Usage:/)
  
  // Test selectChecks
  const names = ["check:a-tool", "check:chat", "check:memory"]
  assert.deepStrictEqual(
    module.selectChecks(names, ["tool", "chat"]),
    ["check:a-tool", "check:chat"]
  )
  assert.deepStrictEqual(
    module.selectChecks(names, null),
    names
  )
  
  // Test --list works without npm
  const listResult = spawnSync(
    process.execPath, 
    ["scripts/run-checks.mjs", "--list", "--only=tool"],
    { 
      cwd: process.cwd(),
      env: { ...process.env, npm_execpath: "" },
      encoding: "utf8"
    }
  )
  assert.strictEqual(listResult.status, 0)
  const lines = listResult.stdout.trim().split("\n")
  assert(lines.length > 0)
  assert(lines.every(line => line.startsWith("check:") && line.includes("tool")))
  
  console.log("run-checks: --only, --jobs and --list parse and select as documented.")
}

main().catch(console.error)