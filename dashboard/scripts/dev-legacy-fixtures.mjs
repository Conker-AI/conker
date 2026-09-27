import { spawn } from "node:child_process"

const executable = process.platform === "win32" ? "npm.cmd" : "npm"
const child = spawn(executable, ["exec", "vite", "--", "--configLoader", "runner"], {
  env: { ...process.env, VITE_CONKER_FIXTURE_SHELL: "legacy" },
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
