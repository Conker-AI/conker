import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const root = fileURLToPath(new URL("../", import.meta.url))
// Use the same bundler the installed Vite toolchain owns; no browser or network is involved.
const viteRequire = createRequire(import.meta.resolve("vite"))
const { build } = viteRequire("esbuild")
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "conker-rich-answer-"))
const requireFromRoot = createRequire(path.join(root, "package.json"))
const checks = []
const check = (name, run) => { run(); checks.push(name) }
try {
  await build({
    entryPoints: [path.join(root, "src/lib/rich-answer.ts"), path.join(root, "src/components/rich-answer.tsx"), path.join(root, "src/lib/api/rich-answer-fixture.ts")],
    outdir: temporary, outbase: path.join(root, "src"), bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent", loader: { ".css": "empty" },
    tsconfig: path.join(root, "tsconfig.app.json"), define: { "import.meta.env": "{}" },
    plugins: [{ name: "one-react-runtime", setup(builder) {
      builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: requireFromRoot.resolve(args.path), external: true }))
    } }],
  })
  const helpers = await import(pathToFileURL(path.join(temporary, "lib/rich-answer.js")))
  const { RichAnswer } = await import(pathToFileURL(path.join(temporary, "components/rich-answer.js")))
  const { richAnswerFixture } = await import(pathToFileURL(path.join(temporary, "lib/api/rich-answer-fixture.js")))
  const render = text => renderToStaticMarkup(React.createElement(RichAnswer, { text }))

  check("Unsafe protocols, control characters, credentials and protocol-relative URLs are rejected", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "//outside.test", "/\\outside.test", "https://user:password@example.com", "java\nscript:alert(1)", "https://example.com\u0000"]) assert.equal(helpers.safeAnswerUrl(value), undefined, value)
    for (const value of ["https://example.com/a?q=1", "mailto:person@example.com", "/chat/week", "#source"]) assert.equal(helpers.safeAnswerUrl(value), value)
  })
  check("CSV preserves quotes/newlines and neutralizes formula cells even with leading whitespace", () => {
    assert.equal(helpers.csvFromRows([["A,B", 'say "hello"', "line\nnext", "=SUM(A1)", "  @cmd", "-10", "\tvalue"]]), '"A,B","say ""hello""","line\nnext","\'=SUM(A1)","\'  @cmd","\'-10","\'\tvalue"')
  })
  check("Actual Markdown table exports preserve math, image alt and inline content once", () => {
    const markdown = '| Formula | Picture | Details |\n| --- | --- | --- |\n| $x^2$ | ![diagram](https://example.com/a.png) | **Bold** [label](https://example.com) `code` |'
    const rows = helpers.tableRowsFromMarkdown(markdown)
    assert.deepEqual(rows, [['Formula', 'Picture', 'Details'], ['x^2', 'diagram', 'Bold label code']])
    assert.equal(helpers.csvFromRows(rows), '"Formula","Picture","Details"\r\n"x^2","diagram","Bold label code"')
    assert.ok(render(markdown).includes('katex'))
    assert.ok(!helpers.csvFromRows(rows).includes('x2x^2x2'))
    const multiple = `${markdown}\n\n> | Nested | Value |\n> | --- | --- |\n> | $y_1$ | ![chart](https://example.com/b.png) |`
    const offset = multiple.indexOf('| Nested')
    assert.deepEqual(helpers.tableRowsFromMarkdown(multiple, offset), [['Nested', 'Value'], ['y_1', 'chart']])
    const unsafeCell = '| Data |\n| --- |\n| $=1+1$ |'
    assert.equal(helpers.csvFromRows(helpers.tableRowsFromMarkdown(unsafeCell)), '"Data"\r\n"\'=1+1"')
  })
  check("Readable speech contains answer text without Markdown or citation control syntax", () => {
    const value = helpers.readableAnswer("## Heading\n\n**Bold** and [a link](https://example.com). [1](citation:source)\n\n- First\n- Second\n\n```js\nconst n = 2\n```\n\n<script>bad()</script>")
    assert.ok(value.includes("Heading")); assert.ok(value.includes("Bold and a link.")); assert.ok(value.includes("const n = 2")); assert.ok(value.includes("First")); assert.ok(!value.includes("citation:")); assert.ok(!value.includes("bad()")); assert.ok(!value.includes("**")); assert.ok(!value.includes("```"))
  })
  check("Raw HTML, SVG and script are never mounted; remote Markdown images never fetch", () => {
    const html = render('<script>alert(1)</script>\n\n<svg onload="alert(1)"></svg>\n\n<img src="https://tracking.test/pixel">\n\n![Photo](https://example.com/photo.png)\n\n[bad](javascript:alert(1))')
    assert.ok(!html.includes("<script")); assert.ok(!html.includes("<img")); assert.ok(!html.includes("tracking.test")); assert.ok(!html.includes("javascript:")); assert.ok(html.includes("Open image")); assert.ok(html.includes('href="https://example.com/photo.png"'))
  })
  check("Partial fences, malformed math, empty text and unknown languages remain renderable", () => {
    for (const value of ["", "```ts\nconst x =", "$unfinished", "$$\n\\frac{", "$$\n\\unknowncommand{x}\n$$", "```unknown-language\n<example>\n```", "| A | B |\n| --- | --- |\n| one |", "[source](citation:missing)"]) assert.doesNotThrow(() => render(value))
    assert.ok(render("$$\n\\unknowncommand{x}\n$$").includes("unknowncommand"))
  })
  check("Complete fixture exposes code/table controls, math and citation identity", () => {
    const html = renderToStaticMarkup(React.createElement(RichAnswer, richAnswerFixture))
    for (const content of ["Collapse code", "Download code", "Expand table", "Table export options", "katex", "Source: react-markdown documentation", "Source unavailable"]) assert.ok(html.includes(content), content)
    assert.ok(!html.includes("<h1"))
    assert.ok(helpers.readableAnswer(richAnswerFixture.text).includes("A useful answer"))
  })
  console.log(`Rich answer checks passed (${checks.length}):\n${checks.map(label => `- ${label}`).join("\n")}`)
} finally {
  // Verify the resolved target before deleting the directory this check created.
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}conker-rich-answer-`))
  await fs.rm(temporary, { recursive: true, force: true })
}
