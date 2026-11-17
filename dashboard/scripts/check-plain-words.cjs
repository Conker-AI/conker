// Fails when a string in the source that an owner can read names an internal service.
// Comments and the generated Pi types are skipped; e2e/plain-words.spec.ts covers what the pages render.
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..", "src")
const banned = /\b(ToolGate|MemoryGate|SystemGate)\b|(?<=[A-Za-z,.] )[Gg]ateways?(?= [a-z]|[.,;!?])|gateway['’]s\b/
// App.tsx: a build setting an owner never sets. imported-chats.tsx: matches the text Pi sends in a problem field; the owner sees a plain sentence built from it. fake-gateway-team-runs.ts: Pi's own wire text for the run limits, never shown.
const allowed = [
  { file: "App.tsx", text: "Invalid dashboard mode" },
  { file: "components/gateway/imported-chats.tsx", text: "startsWith('MemoryGate refused the import listener')" },
  { file: "dev/fake-gateway-team-runs.ts", text: "separate ToolGate authorization" }
]

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { if (entry.name !== "generated") yield* walk(full) }
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full
  }
}

const found = []
for (const file of walk(root)) {
  const rel = path.relative(root, file).split(path.sep).join("/")
  let inBlock = false
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
    let code = line
    if (inBlock) { const end = code.indexOf("*/"); if (end < 0) return; code = code.slice(end + 2); inBlock = false }
    code = code.replace(/\/\*.*?\*\//g, "")
    const open = code.indexOf("/*")
    if (open >= 0) { code = code.slice(0, open); inBlock = true }
    code = code.replace(/(^|\s)\/\/.*$/, "$1")
    if (!banned.test(code)) return
    if (allowed.some(item => item.file === rel && code.includes(item.text))) return
    found.push(`${rel}:${index + 1}: ${code.trim().slice(0, 140)}`)
  })
}
if (found.length) {
  console.error("Internal service names in readable text (say what it does for the owner instead):\n" + found.join("\n"))
  process.exit(1)
}
console.log("plain words: no internal service names in source strings")
