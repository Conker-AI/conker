const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

const root = path.resolve(__dirname, "..")

// composer.tsx checks
const composerSource = fs.readFileSync(path.join(root, "src/components/chat/composer.tsx"), "utf8")
assert.match(composerSource, /input\?: ReactNode/, "composer.tsx has input?: ReactNode")
assert.match(composerSource, /{input}/, "composer.tsx renders {input} when given")

// runtime-workspace.tsx checks
const workspaceSource = fs.readFileSync(path.join(root, "src/components/gateway/runtime-workspace.tsx"), "utf8")
assert.match(workspaceSource, /from '.\/composer-parts'/, "runtime-workspace.tsx imports from ./composer-parts")
assert.match(workspaceSource, /useTemplateActive\(selected \?\? 'new'\)/, "runtime-workspace.tsx has useTemplateActive(selected ?? 'new')")
assert.equal((workspaceSource.match(/<TemplatePicker /g) || []).length, 2, "Exactly two <TemplatePicker> elements")
assert.equal((workspaceSource.match(/<TemplateInput /g) || []).length, 2, "Exactly two <TemplateInput> elements")
assert.doesNotMatch(workspaceSource, /from '.\/new-chat-extras'/, "No direct import from ./new-chat-extras")
assert.doesNotMatch(workspaceSource, /from '.\/mode-control'/, "No direct import from ./mode-control")
assert.match(workspaceSource, /void refreshList\(\); chooseTemplate\('new', null\)/, "runtime-workspace.tsx clears template on new chat")
assert.match(workspaceSource, /await acceptSubmission\(id, text, receipt, taskBinding, requestOptions\); chooseTemplate\(id, null\)/, "runtime-workspace.tsx clears template after submission")

// composer-parts.ts checks
const partsSource = fs.readFileSync(path.join(root, "src/components/gateway/composer-parts.ts"), "utf8")
assert.match(partsSource, /export { chooseTemplate/, "composer-parts.ts exports chooseTemplate")

// template-store.ts checks
const storeSource = fs.readFileSync(path.join(root, "src/components/gateway/template-store.ts"), "utf8")
assert.match(storeSource, /missingRequired\(template, values\)\.length \? '' : compilePrompt/, "templateText returns empty while required fields are missing")

// template-composer.tsx checks
const composerTsx = fs.readFileSync(path.join(root, "src/components/gateway/template-composer.tsx"), "utf8")
assert.match(composerTsx, new RegExp('aria-label="Leave template"'), 'template-composer.tsx has aria-label="Leave template"')
assert.match(composerTsx, /Fill in:/, "template-composer.tsx has Fill in:")

// template-fields.tsx checks
const fieldsSource = fs.readFileSync(path.join(root, "src/components/chat/template-fields.tsx"), "utf8")
const buttonCount = (fieldsSource.match(/<Button/g) || []).length
const typeButtonCount = (fieldsSource.match(/type="button"/g) || []).length
assert.equal(buttonCount, typeButtonCount, 'Every <Button> has type="button"')
assert.doesNotMatch(fieldsSource, /border-t"/, "No border-t with double quote")
assert.match(fieldsSource, /'border-t'/, "border-t only via wrapper cn")
const fieldLines = fieldsSource.split("\n").length
assert.ok(fieldLines <= 200, "template-fields.tsx at most 200 lines")

console.log("Template composer: composer input prop, workspace wiring, store guard, picker/input elements and field fixes passed.")