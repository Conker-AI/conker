const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputText)(name => { if (name in deps) return deps[name]; throw new Error(`Unexpected runtime import ${name}`) }, loaded, loaded.exports)
  return loaded.exports
}

const templates = load('src/lib/chat/prompt-templates.ts')

// Check template structure and order
assert.deepEqual(templates.builtinTemplates.map(t => t.id), ['research', 'writing', 'code', 'analysis', 'summary'], 'Template ids in order')

for (const template of templates.builtinTemplates) {
  assert(template.fields.length <= 12, `Template ${template.id} has at most 12 fields`)
  
  const fieldIds = template.fields.map(f => f.id)
  assert(new Set(fieldIds).size === fieldIds.length, `Template ${template.id} has unique field ids`)
  
  const requiredFields = template.fields.filter(f => f.required)
  assert(requiredFields.length > 0, `Template ${template.id} has at least one required field`)
  
  for (const field of template.fields) {
    if (field.type === 'choice') {
      assert(field.options && field.options.length > 0, `Choice field ${field.id} in ${template.id} has options`)
    }
  }
}

// Check Research example compilation
const researchTemplate = templates.builtinTemplates.find(t => t.id === 'research')
const researchValues = {
  subject: 'Best laptop',
  do: ['Compare battery', '  '],
  dont: [],
  output: 'Table',
  context: ''
}
const expectedResearch = `Research request

Subject:
Best laptop

Do:
- Compare battery

Output: Table`
assert.equal(templates.compilePrompt(researchTemplate, researchValues), expectedResearch, 'Research example compiles correctly')

// Check list uses bullet points and switch behavior
const codeTemplate = templates.builtinTemplates.find(t => t.id === 'code')
const codeValues = { task: 'Write function', language: 'TypeScript', constraints: ['No loops', 'No recursion'], tests: true }
const codePrompt = templates.compilePrompt(codeTemplate, codeValues)
assert.match(codePrompt, /Constraints:\n- No loops\n- No recursion/, 'List uses bullet points')
assert.match(codePrompt, /Include tests: Yes/, 'Switch true shows Yes')

// Check multiple choice joins with comma by testing a custom template
const multipleChoiceTemplate = {
  id: 'test',
  name: 'Test',
  description: 'Test template',
  fields: [
    { id: 'multi', label: 'Multi Choice', type: 'choice', options: ['A', 'B', 'C'], multiple: true }
  ]
}
const multiValues = { multi: ['A', 'C'] }
const multiPrompt = templates.compilePrompt(multipleChoiceTemplate, multiValues)
assert.match(multiPrompt, /Multi Choice: A, C/, 'Multiple choice joins with comma')

// Check switch false omission
const codeValuesFalse = { task: 'Write function', language: 'TypeScript', constraints: [], tests: false }
const codePromptFalse = templates.compilePrompt(codeTemplate, codeValuesFalse)
assert(!codePromptFalse.includes('Include tests'), 'Switch false omits field')

// Check number and date formatting
const analysisTemplate = templates.builtinTemplates.find(t => t.id === 'analysis')
const analysisValues = { question: 'Which laptop?', options: ['MacBook', 'Dell'], criteria: ['Price'], deadline: '2024-12-01' }
const analysisPrompt = templates.compilePrompt(analysisTemplate, analysisValues)
assert.match(analysisPrompt, /Decide by: 2024-12-01/, 'Date formats as label: value')

const summaryTemplate = templates.builtinTemplates.find(t => t.id === 'summary')
const summaryValues = { source: 'Long text here', format: 'Bullet points', maxWords: '100' }
const summaryPrompt = templates.compilePrompt(summaryTemplate, summaryValues)
assert.match(summaryPrompt, /Maximum words: 100/, 'Number formats as label: value')

// Check missingRequired
const emptyResearchValues = templates.emptyValues(researchTemplate)
assert.deepEqual(templates.missingRequired(researchTemplate, emptyResearchValues), ['Subject'], 'Missing required returns Subject for empty Research')
assert.deepEqual(templates.missingRequired(researchTemplate, { ...emptyResearchValues, subject: 'Filled' }), [], 'Missing required returns [] when subject filled')

// Check emptyValues by type
const codeEmptyValues = templates.emptyValues(codeTemplate)
assert.equal(codeEmptyValues.task, '', 'longText gets empty string')
assert.equal(codeEmptyValues.language, '', 'shortText gets empty string')
assert.deepEqual(codeEmptyValues.constraints, [], 'list gets empty array')
assert.equal(codeEmptyValues.tests, false, 'switch gets false')

// Check template-fields.tsx source requirements
const templateFieldsSource = fs.readFileSync(path.join(root, 'src/components/chat/template-fields.tsx'), 'utf8')
assert(templateFieldsSource.includes('aria-pressed'), 'Contains aria-pressed')
assert(templateFieldsSource.includes('ctrlKey') || templateFieldsSource.includes('metaKey'), 'Handles ctrlKey or metaKey')
assert(!templateFieldsSource.includes('setInterval'), 'Contains no setInterval')
assert(!templateFieldsSource.includes('Math.random'), 'Contains no Math.random')
assert(!templateFieldsSource.includes('style='), 'Contains no style attributes')

console.log('Prompt templates: structure, Research example, field formatting, validation and React component passed.')