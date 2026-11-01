// Runs every `check:*` npm script and fails if any of them fails.
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export function parseArgs(argv) {
  const result = { only: null, jobs: 1, list: false }
  for (const arg of argv) {
    if (arg.startsWith("--only=")) {
      const value = arg.slice(7)
      if (!value) throw new Error("Usage: node scripts/run-checks.mjs --only=a,b")
      result.only = value.split(",")
    } else if (arg.startsWith("--jobs=")) {
      const value = parseInt(arg.slice(7), 10)
      if (isNaN(value) || value < 1 || value > 16) throw new Error("Usage: node scripts/run-checks.mjs --jobs=N (1-16)")
      result.jobs = value
    } else if (arg === "--list") {
      result.list = true
    } else {
      throw new Error("Usage: node scripts/run-checks.mjs [--only=a,b] [--jobs=N] [--list]")
    }
  }
  return result
}

export function selectChecks(names, only) {
  if (!only) return names
  const filters = only.map(f => f.toLowerCase())
  return names.filter(name => filters.some(filter => name.toLowerCase().includes(filter)))
}

async function runChecks(names, jobs) {
  const failed = []
  const npmCli = process.env.npm_execpath
  if (!npmCli || !existsSync(npmCli)) throw new Error("npm_execpath is unavailable; run checks through npm")

  if (jobs === 1) {
    // Sequential execution (original behavior)
    for (const name of names) {
      const started = Date.now()
      const result = spawnSync(process.execPath, [npmCli, "run", "--silent", name], { stdio: "inherit" })
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      console.log(`${result.status === 0 ? "pass" : "FAIL"}  ${name}  (${seconds}s)`)
      if (result.status !== 0) failed.push(name)
    }
  } else {
    // Parallel execution
    const runCheck = async (name) => {
      const started = Date.now()
      return new Promise((resolve) => {
        const child = spawn(process.execPath, [npmCli, "run", "--silent", name], { stdio: "pipe" })
        let stdout = "", stderr = ""
        child.stdout?.on("data", data => { stdout += data.toString() })
        child.stderr?.on("data", data => { stderr += data.toString() })
        child.on("close", code => {
          const seconds = ((Date.now() - started) / 1000).toFixed(1)
          if (code !== 0) {
            if (stdout) console.log(stdout)
            if (stderr) console.log(stderr)
            failed.push(name)
          }
          console.log(`${code === 0 ? "pass" : "FAIL"}  ${name}  (${seconds}s)`)
          resolve()
        })
      })
    }

    // Process in batches
    for (let i = 0; i < names.length; i += jobs) {
      await Promise.all(names.slice(i, i + jobs).map(runCheck))
    }
  }
  return failed
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    const allNames = Object.keys(scripts).filter(name => name.startsWith("check:"))
    const selectedNames = selectChecks(allNames, args.only)
    if (selectedNames.length === 0) {
      console.error(`No check suite matches: ${args.only?.join(",")}`)
      process.exit(2)
    }
    if (args.list) {
      selectedNames.forEach(name => console.log(name))
      process.exit(0)
    }
    const failed = await runChecks(selectedNames, args.jobs)
    console.log(`\n${selectedNames.length - failed.length}/${selectedNames.length} check suites passed`)
    if (failed.length) {
      console.log(`Failed: ${failed.join(", ")}`)
      process.exit(1)
    }
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
