// Interactive answers: OpenUI blocks inside answers draw Conker's own parts, fail closed and never run
// anything but a reply or a checked link. Renders on the server with React; no browser or network.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { samples } from "./answer-ui-samples.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const viteRequire = createRequire(import.meta.resolve("vite"))
const { build } = viteRequire("esbuild")
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "conker-answer-ui-"))
const requireFromRoot = createRequire(path.join(root, "package.json"))
const source = file => JSON.stringify(path.join(root, "src", file))
const checks = []
const check = (name, run) => { run(); checks.push(name) }
const fence = body => "```openui\n" + body + "\n```"
try {
  // One bundle, so the block, the reply provider and RichAnswer share one copy of each context.
  await build({
    stdin: { resolveDir: root, loader: "ts", contents: [
      `export { default as AnswerUiBlock } from ${source("components/answer-ui/block.tsx")}`,
      `export * from ${source("components/answer-ui/validate.ts")}`,
      `export * from ${source("components/answer-ui/fence.ts")}`,
      `export * from ${source("components/answer-ui/format.ts")}`,
      `export * from ${source("components/answer-ui/context.ts")}`,
      `export * from ${source("components/answer-ui/links.ts")}`,
      `export { ChatAnswerReplies } from ${source("components/answer-ui/reply.tsx")}`,
      `export { answerUiPrompt } from ${source("components/answer-ui/library.tsx")}`,
      `export { RichAnswer } from ${source("components/rich-answer.tsx")}`,
      `export { readableAnswer } from ${source("lib/rich-answer.ts")}`,
    ].join("\n") },
    outfile: path.join(temporary, "answer-ui.cjs"), bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent", loader: { ".css": "empty" },
    tsconfig: path.join(root, "tsconfig.app.json"), define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "one-react-runtime", setup(builder) {
      builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: requireFromRoot.resolve(args.path), external: true }))
    } }],
  })
  const ui = await import(pathToFileURL(path.join(temporary, "answer-ui.cjs")))
  const quiet = run => { const warn = console.warn, error = console.error; console.warn = () => {}; console.error = () => {}; try { return run() } finally { console.warn = warn; console.error = error } }
  const block = (body, options = {}) => quiet(() => renderToStaticMarkup(React.createElement(ui.AnswerUiBlock, { source: body, complete: true, streaming: false, answerText: "", ...options })))
  const failed = html => html.includes("Couldn&#x27;t show this part") && html.includes("Show source")
  const parts = text => /```openui\n([\s\S]*?)\n```/.exec(text)?.[1] ?? ""
  const chat = overrides => ({ source: "fixture", sessionId: "s1", activeAgentName: "Conker", history: "ready", notice: null, error: null, draft: "", generation: null, submission: { kind: "idle" },
    setDraft: { availability: "enabled", run: () => {} }, send: { availability: "disabled", reason: "Type a message first." }, checkHistory: { availability: "enabled", run: () => {} },
    messages: [{ id: "m1", sessionId: "s1", sequence: 1, role: "assistant", createdAt: "2026-10-29T10:00:00Z", content: { kind: "text", text: "older" }, agentId: null, actions: {} },
      { id: "m2", sessionId: "s1", sequence: 2, role: "assistant", createdAt: "2026-10-29T10:01:00Z", content: { kind: "text", text: "latest" }, agentId: null, actions: {} }], ...overrides })
  const inChat = (contract, answerText, body) => quiet(() => renderToStaticMarkup(React.createElement(ui.ChatAnswerReplies, { chat: contract }, React.createElement(ui.AnswerUiBlock, { source: body, complete: true, streaming: false, answerText }))))
  const choices = 'root = Stack([c])\nc = Choices([Button("Yes, book it"), Button("Not now")])'

  check("OpenUI's development inspector, which loads an unpinned CDN script, is switched off before the library loads", () => {
    assert.equal(globalThis[Symbol.for("openui.devtools.autoMount")], true)
  })
  check("A valid block draws every catalog part with Conker's own components", () => {
    const html = samples.filter(sample => ["spending", "plan", "form"].includes(sample.id)).map(sample => block(parts(sample.text), { answerText: sample.text })).join("")
    assert.ok(!failed(html), "no failure state")
    for (const text of ["$1,240", "of $1,500", "Two categories by month", "Chart data", "Eating out", "Table export options", "Expand table", "Set a limit for eating out", "Show November&#x27;s plan",
      "Boxes packed", "18 of 30", "Pack the kitchen", "Now", "Hand over the keys", "Saturday", "Van at 9:00", "Watch the time", "role=\"note\"",
      "Trip details", "Where to", "Leaving on", "Travel by", "Budget", "1200 USD", "Plan it", "How budgets usually split"]) assert.ok(html.includes(text), text)
    assert.ok(html.includes('href="https://example.com/export"') && html.includes('rel="noopener noreferrer"') && html.includes('target="_blank"'), "a checked link is a plain link")
  })
  check("Malformed blocks fail closed with their source one tap away", () => {
    for (const body of ['root = Stack([Text("open"', 'note = Text("no root")', "root = Stack(", "not openui at all", "", 'root = Stack([Stat(1, 2, 3, 4, 5)])']) {
      assert.equal(ui.blockProblem(body, { complete: true, streaming: false }) !== null, true, body)
      assert.ok(failed(block(body)), body)
    }
  })
  check("Unknown components and tool calls are refused, never drawn or run", () => {
    assert.equal(ui.blockProblem('root = Stack([Map("Lisbon", 12)])', { complete: true, streaming: false }), "unknown-part")
    assert.equal(ui.blockProblem('root = Stack([HtmlView("<script>alert(1)</script>")])', { complete: true, streaming: false }), "unknown-part")
    assert.equal(ui.blockProblem('data = Query("list_files", {}, {rows: []})\nroot = Stack([Text("x")])', { complete: true, streaming: false }), "tools")
    assert.equal(ui.blockProblem('run = Mutation("delete_file", {path: "/"})\nroot = Stack([Button("Go", @Run(run))])', { complete: true, streaming: false }), "tools")
    const html = block('root = Stack([Map("Lisbon", 12)])')
    assert.ok(failed(html) && html.includes("a part Conker doesn"), "unknown part explained")
    assert.ok(!html.includes("<script"))
  })
  check("@OpenUrl goes through the Markdown link check: javascript:, data: and relative links are blocked", () => {
    for (const url of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "//outside.test", "/chat/1", "https://user:pw@example.com", "java\nscript:alert(1)"]) {
      assert.equal(ui.checkedLink(url), undefined, url)
      const html = block(`root = Stack([b])\nb = Button("Open", @OpenUrl(${JSON.stringify(url)}))`)
      assert.ok(html.includes("Link blocked") && !/href="(?:javascript|data|\/)/i.test(html), url)
    }
    for (const url of ["https://example.com/a?b=1", "http://example.com", "mailto:someone@example.com"]) assert.equal(ui.checkedLink(url), url)
    assert.equal(ui.linkTarget({ steps: [{ type: "open_url", url: "javascript:x" }, { type: "continue_conversation", message: "x" }] }), undefined, "a mixed action is a reply, its link still checked when it runs")
  })
  check("Oversized blocks are refused: characters, components, list lengths and depth are capped", () => {
    assert.equal(ui.blockProblem(`root = Stack([Text("${"x".repeat(ui.MAX_BLOCK_CHARACTERS)}")])`, { complete: true, streaming: false }), "too-large")
    assert.equal(ui.blockProblem(`root = Stack([${Array.from({ length: ui.MAX_BLOCK_NODES + 1 }, (_, index) => `Text("${index}")`).join(", ")}])`, { complete: true, streaming: false }), "too-large")
    assert.equal(ui.blockProblem(`root = Stack([Table(["A"], [${Array.from({ length: 201 }, (_, index) => `["${index}"]`).join(", ")}])])`, { complete: true, streaming: false }), "too-large")
    assert.equal(ui.blockProblem(`root = Stack([Table(["A"], [${Array.from({ length: 100 }, (_, index) => `["${index}"]`).join(", ")}])])`, { complete: true, streaming: false }), null)
    assert.equal(ui.blockProblem("x".repeat(ui.MAX_BLOCK_CHARACTERS + 1), { complete: false, streaming: true }), "too-large", "even while streaming")
    assert.ok(block(`root = Stack([Text("${"x".repeat(ui.MAX_BLOCK_CHARACTERS)}")])`).includes("too large"))
    // A block nested 40 deep is refused
    assert.equal(ui.blockProblem(`root = ${"Stack([".repeat(40)}Text("deep")${"])".repeat(40)}`, { complete: true, streaming: false }), "too-large")
    // A block nested 10 deep is still drawn
    assert.equal(ui.blockProblem(`root = ${"Stack([".repeat(10)}Text("deep")${"])".repeat(10)}`, { complete: true, streaming: false }), null)
    // A block of lists nested thousands deep is refused without throwing
    assert.notEqual(ui.blockProblem(`root = Stack([Table(["A"], ${"[".repeat(5000)}${"]".repeat(5000)})])`, { complete: true, streaming: false }), null)
  })
  check("A block still arriving draws what it has with nothing tappable; one that stopped there says it was cut off", () => {
    const partial = parts(samples.find(sample => sample.id === "streaming").text + "\n```")
    assert.equal(ui.blockProblem(partial, { complete: false, streaming: true }), null)
    const html = block(partial, { complete: false, streaming: true })
    assert.ok(!failed(html) && html.includes('data-answer-ui="streaming"') && html.includes("Alfama"), "partial table draws")
    const buttons = block('root = Stack([c])\nc = Choices([Button("Yes"), Button("No"', { complete: false, streaming: true })
    assert.ok(buttons.includes("Available when the reply finishes.") && buttons.includes(" disabled=\"\""), "buttons wait for the reply")
    assert.equal(ui.blockProblem(partial, { complete: false, streaming: false }), "cut-off")
    assert.ok(block(partial, { complete: false, streaming: false }).includes("cut off"))
  })
  check("Fences: only openui blocks are interactive; open fences are detected for streaming", () => {
    assert.ok(ui.isAnswerUiLanguage("openui") && ui.isAnswerUiLanguage("OpenUI-Lang") && !ui.isAnswerUiLanguage("js"))
    assert.equal(ui.fenceClosed("```openui\nroot = Stack([])\n```"), true)
    assert.equal(ui.fenceClosed("```openui\nroot = Stack([])\n```\n\n"), true)
    assert.equal(ui.fenceClosed("````openui\nroot = Stack([])\n```"), false, "a shorter fence does not close")
    assert.equal(ui.fenceClosed("```openui\nroot = Stack(["), false)
    assert.equal(ui.fenceClosed("```openui"), false)
  })
  check("Text around a block always shows, other code stays a code block, and speech skips the block", () => {
    const text = `Before the part.\n\n${fence('root = Stack([Map("x")])')}\n\nAfter the part.\n\n\`\`\`js\nconst n = 2\n\`\`\``
    const html = quiet(() => renderToStaticMarkup(React.createElement(ui.RichAnswer, { text })))
    assert.ok(html.includes("Before the part.") && html.includes("After the part.") && html.includes("Preparing this part") && html.includes("js code block"))
    const spoken = ui.readableAnswer(text)
    assert.ok(spoken.includes("Before the part.") && spoken.includes("const n = 2") && !spoken.includes("root ="))
  })
  check("Only the latest answer's buttons send, never over the owner's draft or during a reply", () => {
    const sendable = html => !html.includes(" disabled=\"\"") && !/class="[^"]*text-xs[^"]*">[^<]+<\/p>/.test(html)
    assert.ok(sendable(inChat(chat(), "latest", choices)), "latest answer, empty draft")
    assert.ok(inChat(chat(), "older", choices).includes("From an earlier answer."))
    assert.ok(inChat(chat({ draft: "half a thought" }), "latest", choices).includes("Your message box has text. Send or clear it first."))
    assert.ok(inChat(chat({ generation: { phase: "streaming" } }), "latest", choices).includes("Available when the reply finishes."))
    assert.ok(inChat(chat({ submission: { kind: "uncertain" } }), "latest", choices).includes("Available when the reply finishes."))
    assert.ok(block(choices).includes("Buttons work in the chat."), "outside a chat nothing can send")
  })
  check("A form sends one message: its title and each answered field", () => {
    const fields = [{ typeName: "TextField", props: { label: "Where to" } }, { typeName: "DateField", props: { label: "Leaving on" } }, { typeName: "SliderField", props: { label: "Budget", min: 200, value: 1200 } }]
    assert.equal(ui.startValue(fields[2]), "1200")
    assert.equal(ui.startValue(fields[0]), "")
    assert.equal(ui.formMessage("Trip details", fields, ["Lisbon", "", "1200"]), "Trip details\n- Where to: Lisbon\n- Budget: 1200")
    assert.equal(ui.formMessage("Trip details", fields, ["", " ", ""]), "", "an empty form sends nothing")
    assert.equal(ui.replyText("Yes", undefined), "Yes")
    assert.equal(ui.replyText("Yes", { steps: [{ type: "continue_conversation", message: "Book the 9:40 train" }] }), "Book the 9:40 train")
  })
  check("The catalog prompt teaches only Conker's parts and no tools", () => {
    const prompt = ui.answerUiPrompt()
    for (const name of ["Stack(", "Table(", "Chart(", "Choices(", "Form(", "Steps(", "Progress(", "Callout(", "```openui"]) assert.ok(prompt.includes(name), name)
    for (const name of ["Query(", "Mutation(", "@Run", "@Set", "HtmlView", "Image("]) assert.ok(!prompt.includes(name), name)
  })
  console.log(`Answer UI checks passed (${checks.length}):\n${checks.map(label => `- ${label}`).join("\n")}`)
} finally {
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}conker-answer-ui-`))
  await fs.rm(temporary, { recursive: true, force: true })
}
