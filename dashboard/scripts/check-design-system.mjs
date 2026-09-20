import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const argument = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const root = path.resolve(argument("--root") || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."))
const overlay = argument("--overlay") ? path.resolve(argument("--overlay")) : undefined
const require = createRequire(path.join(root, "package.json"))
const ts = require("typescript")
const slash = value => value.replaceAll("\\", "/")
const template = JSON.parse(fs.readFileSync(path.join(root, "scripts/template-foundation.json"), "utf8"))
const applicationRecipes = {
  "src/components/status-badge.tsx": ["border-success/30", "bg-success/10", "border-warning/30", "bg-warning/10"],
  "src/components/ui/alert.tsx": ["border-warning/30", "bg-warning/10"],
  "src/app/tools/columns.tsx": ["border-warning/30", "bg-warning/10"],
}
const ownedRecipe = (file, token) => template.colorClasses[file]?.includes(token) || applicationRecipes[file]?.includes(token)

// Exceptions describe different UI roles, never a route-wide escape from theming.
const headingExceptions = new Map([
  ["src/app/chat/conversation.tsx", "The transcript has a compact persistent conversation title."],
  ["src/app/login/page.tsx", "Authentication uses the standalone AuthLayout."],
  ["src/app/setup/page.tsx", "Onboarding steps use the standalone AuthLayout."],
  ["src/app/errors/not-found/components/not-found-error.tsx", "The error code is a standalone error heading."],
])
const paletteExceptions = new Map([
  ["src/lib/character-options.ts", "Character swatches represent selectable artwork colors."],
  ["src/config/theme-data.ts", "Theme definitions are the source of palette values."],
  ["src/config/theme-customizer-constants.ts", "The theme editor's swatches must represent their actual colors."],
  ["src/utils/tweakcn-theme-presets.ts", "Theme preset source data."],
  ["src/utils/shadcn-ui-theme-presets.ts", "Theme preset source data."],
])
const isFoundation = file => file.startsWith("src/components/ui/")
const isDesignSystem = file => file === "src/components/design-system/primitives.tsx"
const paletteNames = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const colorUtility = "(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|decoration|shadow|from|via|to|divide|accent|caret|placeholder)"
const paletteClass = new RegExp(`(?:^|:)!?${colorUtility}-(?:(?:${paletteNames})-(?:50|[1-9]00|950)|white|black)(?:/[^\\s]+)?$`)
const literalColorClass = new RegExp(`(?:^|:)!?${colorUtility}-\\[(?:#|rgba?\\(|hsla?\\(|oklch\\(|oklab\\()[^\\]]+\\](?:/[^\\s]+)?$`)
// Neutral roles have one tone. Opacity belongs to named state tokens, not consumers.
const neutralAlphaClass = /(?:^|:)!?(?:bg-(?:background|card|popover|muted|secondary|accent|surface-[\w-]+)|text-(?:foreground|muted-foreground)|(?:border|divide)-border)\/[^\s]+$/
const tintAlphaClass = /(?:^|:)!?(?:bg-(?:primary|success|warning)|border-(?:success|warning))\/[^\s]+$/
const obsoleteToneClass = /(?:^|:)(?:conversation-contrast|bg-surface-[\w-]+|bg-selection|bg-sidebar-selection)$/

function sourceFile(file, source) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

function moduleSpecifiers(tree) {
  const modules = []
  const visit = node => {
    if ((ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly || ts.isExportDeclaration(node) && !node.isTypeOnly)
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) modules.push(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) modules.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return modules
}

function reachableFiles(read, exists, entry = "src/config/routes.tsx") {
  const files = new Map()
  const pending = [entry]
  while (pending.length) {
    const file = pending.pop()
    if (files.has(file)) continue
    if (!exists(file)) throw new Error(`Design check entry or dependency does not exist: ${file}`)
    const source = read(file)
    const tree = sourceFile(file, source)
    files.set(file, tree)
    for (const specifier of moduleSpecifiers(tree)) {
      const base = specifier.startsWith("@/") ? `src/${specifier.slice(2)}`
        : specifier.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)) : null
      if (!base || !base.startsWith("src/")) continue
      const candidate = [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}/index.tsx`, `${base}/index.ts`, `${base}/index.jsx`, `${base}/index.js`]
        .find(value => /\.[jt]sx?$/.test(value) && exists(value))
      if (candidate) pending.push(candidate)
    }
  }
  return files
}

function inspect(file, tree) {
  const findings = []
  const inputs = new Set(["input", "Input"])
  const report = (node, rule, message) => {
    const position = tree.getLineAndCharacterOfPosition(node.getStart(tree))
    findings.push({ file, line: position.line + 1, column: position.character + 1, rule, message })
  }
  for (const node of tree.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue
    const module = node.moduleSpecifier.text
    if (/(?:^|\/)ui\/input$/.test(module)) {
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        bindings.elements.forEach(item => { if ((item.propertyName?.text || item.name.text) === "Input") inputs.add(item.name.text) })
      }
      if (bindings && ts.isNamespaceImport(bindings)) inputs.add(`${bindings.name.text}.Input`)
    }
    if (file.startsWith("src/app/") && /(?:^|\/)ui\/tabs$/.test(module)) {
      report(node, "page-tabs", "Import PageTabs, PageTabsList, PageTabsTrigger and PageTabsContent from @/components/design-system.")
    }
  }
  const visit = node => {
    if (!isFoundation(file) && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      const tag = node.tagName.getText(tree)
      if (tag === "h1" && !headingExceptions.has(file) && !isDesignSystem(file)) {
        report(node, "page-heading", "Use BaseLayout title/description or PageHeader for a standard page heading.")
      }
      if (inputs.has(tag) && !isDesignSystem(file)) {
        const searching = node.attributes.properties.some(attribute => {
          if (!ts.isJsxAttribute(attribute) || !attribute.initializer) return false
          const name = attribute.name.getText(tree)
          const initializer = attribute.initializer
          const value = ts.isStringLiteral(initializer) ? initializer.text
            : ts.isJsxExpression(initializer) && initializer.expression ? initializer.expression.getText(tree) : ""
          return name === "type" && /^(?:["']?search["']?)$/.test(value)
            || ["placeholder", "aria-label"].includes(name) && /search/i.test(value)
        })
        if (searching) report(node, "collection-search", "Use CollectionSearch so search height, inset, colors and accessibility stay consistent.")
      }
    }
    if (!paletteExceptions.has(file) && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
      const tokens = node.text.split(/\s+/)
      const tones = tokens.filter(token => obsoleteToneClass.test(token) || !ownedRecipe(file, token) && (neutralAlphaClass.test(token)
        || file !== "src/components/companion-portrait.tsx" && tintAlphaClass.test(token)))
      if (tones.length) report(node, "semantic-tone", `Replace ${[...new Set(tones)].join(", ")} with a named surface, interaction or text role. See DESIGN.md.`)
      const colors = tokens.filter(token => !ownedRecipe(file, token) && (paletteClass.test(token) || literalColorClass.test(token)))
      if (colors.length) report(node, "semantic-color", `Replace ${[...new Set(colors)].join(", ")} with semantic theme colors (primary, muted, warning, destructive, etc.).`)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return findings
}

function inspectTheme(source) {
  const mappings = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "border", "input", "ring", "sidebar", "sidebar-foreground"]
  return mappings.filter(role => !source.includes(`--color-${role}: var(--${role});`))
    .map(role => ({file:"src/index.css", line:1, column:1, rule:"template-token", message:`Map --color-${role} directly to --${role}, as in the pinned template. Do not remix the owner's theme.`}))
}

function selfTest() {
  let passed = 0
  const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`) }
  const check = (source, file = "src/app/inbox/page.tsx") => inspect(file, sourceFile(file, source))
  test("standard page heading bypass is rejected", () => assert.equal(check('const Page = () => <h1>Inbox</h1>')[0]?.rule, "page-heading"))
  test("heading and search ownership follows the extracted primitives only", () => {
    const source = 'import { Input } from "@/components/ui/input"; const Primitive = () => <><h1>Title</h1><Input type="search" /></>'
    assert.deepEqual(check(source, "src/components/design-system/primitives.tsx"), [])
    assert.deepEqual(check(source, "src/components/design-system/index.tsx").map(issue => issue.rule), ["page-heading", "collection-search"])
  })
  test("raw Radix wrapper tabs in a route are rejected", () => assert.equal(check('import { Tabs } from "@/components/ui/tabs"')[0]?.rule, "page-tabs"))
  test("aliased raw search Input is rejected", () => assert.equal(check('import { Input as Field } from "@/components/ui/input"; const Page = () => <Field type="search" />')[0]?.rule, "collection-search"))
  test("DataTable searchPlaceholder bypass is rejected", () => assert.equal(check('const Toolbar = () => <Input placeholder={searchPlaceholder} />', "src/components/data-table.tsx")[0]?.rule, "collection-search"))
  test("native search and conditional labels are rejected", () => assert.equal(check('const Page = () => <input aria-label={active ? "Search requests" : "Search history"} />')[0]?.rule, "collection-search"))
  test("palette and literal-color classes are rejected", () => assert.equal(check('const Page = () => <div className="dark:text-red-400 hover:bg-[#123456]" />')[0]?.rule, "semantic-color"))
  test("shared patterns and semantic colors pass", () => assert.deepEqual(check('import { PageHeader, CollectionSearch } from "@/components/design-system"; const Page = () => <div className="bg-muted text-foreground"><PageHeader title="Inbox" /><CollectionSearch value={query} /></div>'), []))
  test("ad hoc neutral tones are rejected in routes and foundations", () => {
    for (const file of ["src/app/chat/page.tsx", "src/components/ui/card.tsx"]) {
      for (const token of ["bg-muted/40", "dark:hover:bg-accent/50", "text-foreground/70", "divide-border/50", "border-border/60", "bg-primary/5", "bg-warning/10", "conversation-contrast", "hover:bg-surface-raised"]) {
        assert.equal(check(`const tone = "${token}"`, file)[0]?.rule, "semantic-tone")
      }
    }
  })
  test("named states pass; portrait artwork exception stays narrow", () => {
    assert.deepEqual(check('const tone = "bg-accent text-accent-foreground text-success bg-popover"'), [])
    assert.deepEqual(check('const tone = "bg-primary/15"', "src/components/companion-portrait.tsx"), [])
    assert.equal(check('const tone = "bg-muted/40"', "src/components/companion-portrait.tsx")[0]?.rule, "semantic-tone")
  })
  test("template recipes are allowed only in their owning primitive", () => {
    assert.deepEqual(check('const tone = "dark:hover:bg-accent/50"', "src/components/ui/button.tsx"), [])
    assert.equal(check('const tone = "dark:hover:bg-accent/50"', "src/components/ui/card.tsx")[0]?.rule, "semantic-tone")
    assert.equal(check('const tone = "bg-purple-500"', "src/components/ui/button.tsx")[0]?.rule, "semantic-color")
  })
  test("template token aliases cannot be redirected to mixed surfaces", () => {
    const valid = fs.readFileSync(path.join(root, "src/index.css"), "utf8")
    assert.deepEqual(inspectTheme(valid), [])
    assert.equal(inspectTheme(valid.replace("--color-card: var(--card);", "--color-card: var(--surface-panel);"))[0]?.rule, "template-token")
  })
  test("ordinary fields and arbitrary dimensions remain allowed", () => assert.deepEqual(check('const Page = () => <Input placeholder="Agent name" className="text-[15px] w-[12rem]" />'), []))
  test("conversation/auth/error headings are intentional", () => {
    for (const file of headingExceptions.keys()) assert.deepEqual(check('const Page = () => <h1>Title</h1>', file), [])
  })
  test("exceptions do not disable unrelated checks", () => assert.equal(check('const Page = () => <h1 className="text-red-500">Title</h1>', "src/app/login/page.tsx")[0]?.rule, "semantic-color"))
  test("foundation and swatch owners remain permitted", () => {
    assert.deepEqual(check('const Field = () => <Input type="search" className="dark:bg-input/30" />', "src/components/ui/input.tsx"), [])
    assert.deepEqual(check('const tone = "bg-green-500"', "src/lib/character-options.ts"), [])
  })
  test("route graph includes live descendants and excludes dormant template demos", () => {
    const fixture = new Map([
      ["src/config/routes.tsx", 'const Page = lazy(() => import("@/app/inbox/page"))'],
      ["src/app/inbox/page.tsx", 'import { Row } from "./row"; const Page = () => <Row />'],
      ["src/app/inbox/row.tsx", 'export const Row = () => <input type="search" />'],
      ["src/app/mail/page.tsx", 'const Page = () => <h1 className="text-red-500">Dormant demo</h1>'],
    ])
    const reachable = reachableFiles(file => fixture.get(file), file => fixture.has(file))
    assert.equal(reachable.size, 3)
    assert.equal(reachable.has("src/app/mail/page.tsx"), false)
    assert.equal([...reachable].flatMap(([file, tree]) => inspect(file, tree)).length, 1)
  })
  console.log(`Design-system guard self-test: ${passed} cases passed.`)
}

if (args.includes("--self-test")) {
  selfTest()
} else {
  const actualPath = file => overlay && fs.existsSync(path.join(overlay, file)) ? path.join(overlay, file) : path.join(root, file)
  // Include global surfaces (such as the persistent call host), not just routes.
  const reachable = reachableFiles(file => fs.readFileSync(actualPath(file), "utf8"), file => fs.existsSync(actualPath(file)) && fs.statSync(actualPath(file)).isFile(), "src/App.tsx")
  const findings = [...reachable].flatMap(([file, tree]) => inspect(slash(file), tree))
  findings.push(...inspectTheme(fs.readFileSync(actualPath("src/index.css"), "utf8")))
  for (const finding of findings) console.error(`${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.message}`)
  if (findings.length) {
    console.error(`Design-system check failed: ${findings.length} issue(s) across ${reachable.size} reachable source files. See DESIGN.md.`)
    process.exitCode = 1
  } else console.log(`Design-system check passed: ${reachable.size} reachable source files.`)
}
