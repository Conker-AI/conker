import { describe, expect, it } from 'vitest'
import { createToolDefinition, createToolNode, editorValidation, parseToolDefinition, parseToolDraft, validateToolDefinition, valueMatchesType, type JsonValue, type ToolDefinition, type ToolNode, type ToolRun } from '../tool-workspace'
import { toolValueSources } from '../tool-value-sources'

const clone = (definition: ToolDefinition): ToolDefinition => JSON.parse(JSON.stringify(definition))
const paths = (issues: { path: string; message: string }[]) => issues.map(issue => `${issue.path}: ${issue.message}`)

/** input -> set -> return, with a declared input called `name`. */
function workflow(): ToolDefinition {
  const definition = createToolDefinition('greeter', 'Greeter')
  definition.inputs = [{ name: 'name', type: 'string', required: true }]
  const set = createToolNode('set', 'greet', { x: 180, y: 120 })
  set.config = { value: 'Hello $input.name' }
  definition.nodes.splice(1, 0, set)
  definition.edges = [
    { id: 'e0', source: 'input', target: 'greet' },
    { id: 'e1', source: 'greet', target: 'result' },
  ]
  return definition
}

describe('tool workspace: value types', () => {
  it('matches values to field types, with finite numbers only', () => {
    expect(valueMatchesType('x', 'string')).toBe(true)
    expect(valueMatchesType(1, 'string')).toBe(false)
    expect(valueMatchesType(1, 'number')).toBe(true)
    expect(valueMatchesType(Number.POSITIVE_INFINITY, 'number')).toBe(false)
    expect(valueMatchesType(true, 'boolean')).toBe(true)
    expect(valueMatchesType([], 'array')).toBe(true)
    expect(valueMatchesType({}, 'array')).toBe(false)
    expect(valueMatchesType({}, 'object')).toBe(true)
    expect(valueMatchesType(null, 'object')).toBe(false)
    expect(valueMatchesType([], 'object')).toBe(false)
  })
})

describe('tool workspace: new definitions', () => {
  it('starts a workflow as input then return, and a connector with an action between', () => {
    const flow = createToolDefinition('a', 'A')
    expect(flow.nodes.map(node => node.type)).toEqual(['input', 'return'])
    expect(flow.edges).toEqual([{ id: 'edge-0', source: 'input', target: 'result' }])
    const connector = createToolDefinition('b', 'B', 'connector')
    expect(connector.nodes.map(node => node.id)).toEqual(['input', 'action', 'result'])
    expect(connector.edges.map(edge => [edge.source, edge.target])).toEqual([
      ['input', 'action'],
      ['action', 'result'],
    ])
    expect(validateToolDefinition(flow)).toEqual([])
    expect(validateToolDefinition(connector)).toEqual([])
  })

  it('makes every node kind with a label and a config the validator accepts', () => {
    const kinds: ToolNode['type'][] = ['input', 'tool_call', 'workflow_call', 'set', 'calculation', 'condition', 'loop', 'return']
    for (const kind of kinds) {
      const node = createToolNode(kind, `${kind}-x`)
      expect(node.type).toBe(kind)
      expect(node.label).toBeTruthy()
      expect(node.position).toEqual({ x: 280, y: 160 })
    }
    expect(createToolNode('loop').id).toMatch(/^loop-[0-9a-f]{8}$/)
  })
})

describe('tool workspace: validation', () => {
  it('accepts a connected workflow', () => {
    expect(validateToolDefinition(workflow())).toEqual([])
  })

  it('reports schema problems by path and stops there', () => {
    const issues = validateToolDefinition({ id: '1bad', name: ' ' })
    expect(issues.some(issue => issue.path === 'id')).toBe(true)
    expect(issues.some(issue => issue.path === 'name')).toBe(true)
    const extra = { ...workflow(), surprise: true }
    expect(validateToolDefinition(extra).length).toBeGreaterThan(0)
  })

  it('needs exactly one Input node and a Return node', () => {
    const noReturn = workflow()
    noReturn.nodes = noReturn.nodes.map(node => (node.type === 'return' ? { ...node, type: 'set' as const, config: { value: 1 } } : node))
    noReturn.edges = [
      { id: 'e0', source: 'input', target: 'greet' },
      { id: 'e1', source: 'greet', target: 'result' },
    ]
    expect(paths(validateToolDefinition(noReturn))).toContain('nodes: Add a Return node.')
    const twoInputs = workflow()
    twoInputs.nodes.push({ ...createToolNode('input', 'second') })
    expect(paths(validateToolDefinition(twoInputs))).toContain('nodes: Use exactly one Input node.')
  })

  it('refuses duplicate ids, duplicate fields and missing endpoints', () => {
    const definition = workflow()
    definition.nodes[1] = { ...definition.nodes[1], id: 'input' }
    definition.edges.push({ id: 'e0', source: 'input', target: 'ghost' })
    definition.inputs.push({ name: 'name', type: 'string', required: false })
    const found = paths(validateToolDefinition(definition))
    expect(found).toContain('nodes: Node IDs must be unique.')
    expect(found).toContain('edges: Edge IDs must be unique.')
    expect(found).toContain('inputs: Field names must be unique.')
    expect(found).toContain('edges: Connection e0 has a missing endpoint.')
  })

  it('checks defaults against their type, except for live drafts', () => {
    const definition = workflow()
    definition.inputs = [{ name: 'days', type: 'number', required: false, default: 'three' }]
    definition.nodes[1].config = { value: 'x' }
    expect(paths(validateToolDefinition(definition))).toContain('inputs: Default for days must be number.')
    expect(validateToolDefinition(definition, true)).toEqual([])
  })

  it('catches a cycle and a step that is not connected to Input', () => {
    const cycle = workflow()
    cycle.edges = [
      { id: 'e0', source: 'input', target: 'greet' },
      { id: 'e1', source: 'greet', target: 'input' },
      { id: 'e2', source: 'result', target: 'result' },
    ]
    const found = paths(validateToolDefinition(cycle))
    expect(found).toContain('edges: Input cannot have incoming connections.')
    expect(found).toContain('edges: Graph cycles are unsupported. Use the bounded Loop node.')
    expect(found).toContain('nodes: Node is disconnected from Input.')
  })

  it('wants every step to continue to exactly one next step', () => {
    const definition = workflow()
    definition.edges = [{ id: 'e0', source: 'input', target: 'greet' }]
    expect(paths(validateToolDefinition(definition))).toContain('edges: Connect exactly one next step without a branch label.')
    const labelled = workflow()
    labelled.edges[0].branch = 'true'
    expect(paths(validateToolDefinition(labelled))).toContain('edges: Connect exactly one next step without a branch label.')
    const returning = workflow()
    returning.edges.push({ id: 'e2', source: 'result', target: 'greet' })
    expect(paths(validateToolDefinition(returning))).toContain('edges: Return must have no outgoing connections.')
  })

  it('wants a condition to have both branches and a right value', () => {
    const definition = workflow()
    const condition = createToolNode('condition', 'check', { x: 100, y: 0 })
    condition.config = { operator: 'equals', left: 1 }
    definition.nodes.splice(1, 0, condition)
    definition.edges = [
      { id: 'e0', source: 'input', target: 'check' },
      { id: 'e1', source: 'check', target: 'greet', branch: 'true' },
      { id: 'e2', source: 'greet', target: 'result' },
    ]
    const found = paths(validateToolDefinition(definition))
    expect(found).toContain('edges: Connect both True and False branches exactly once.')
    expect(found).toContain('config: Comparison needs a right value.')
    condition.config = { operator: 'exists', left: 1 }
    expect(paths(validateToolDefinition(definition))).not.toContain('config: Comparison needs a right value.')
  })

  it('accepts a condition whose True and False branches each lead on once, and refuses two branches of the same kind', () => {
    const definition = workflow()
    const condition = createToolNode('condition', 'check', { x: 100, y: 0 })
    condition.config = { operator: 'equals', left: 1, right: 1 }
    const other = createToolNode('set', 'other', { x: 100, y: 60 })
    definition.nodes.splice(1, 0, condition, other)
    definition.edges = [
      { id: 'e0', source: 'input', target: 'check' },
      { id: 'e1', source: 'check', target: 'greet', branch: 'true' },
      { id: 'e2', source: 'check', target: 'other', branch: 'false' },
      { id: 'e3', source: 'greet', target: 'result' },
      { id: 'e4', source: 'other', target: 'result' },
    ]
    expect(validateToolDefinition(definition)).toEqual([])
    definition.edges[2].branch = 'true'
    expect(paths(validateToolDefinition(definition))).toContain('edges: Connect both True and False branches exactly once.')
  })

  it('keeps a loop within the tool’s item budget', () => {
    const definition = workflow()
    const loop = createToolNode('loop', 'each', { x: 100, y: 0 })
    loop.config = { items: ['a'], limit: 30, operation: 'trim' }
    definition.nodes.splice(1, 0, loop)
    definition.edges = [
      { id: 'e0', source: 'input', target: 'each' },
      { id: 'e1', source: 'each', target: 'greet' },
      { id: 'e2', source: 'greet', target: 'result' },
    ]
    expect(paths(validateToolDefinition(definition))).toContain("budgets: Loop limit exceeds the tool's item budget.")
  })

  it('checks references: roots, declared inputs, other steps, escapes and forbidden keys', () => {
    const definition = workflow()
    const bad = (value: JsonValue) => {
      const copy = clone(definition)
      copy.nodes[1].config = { value }
      return paths(validateToolDefinition(copy))
    }
    expect(bad('$input.name')).toEqual([])
    expect(bad('$$5 literal')).toEqual([])
    expect(bad('$last')).toEqual([])
    expect(bad('$steps.input')).toEqual([])
    expect(bad('$env.HOME')[0]).toContain('Invalid reference $env.HOME')
    expect(bad('$input.__proto__')[0]).toContain('Invalid reference')
    expect(bad('$input.a..b')[0]).toContain('Invalid reference')
    expect(bad('$input.missing')[0]).toContain('has no declared field')
    expect(bad('$steps.ghost')[0]).toContain('must name another existing node')
    expect(bad('$steps.greet')[0]).toContain('must name another existing node')
    expect(bad({ nested: ['$steps.ghost'] })[0]).toContain('$steps.ghost')
  })

  it('makes a connector declare an effect that covers what it calls', () => {
    const definition = createToolDefinition('mailer', 'Mailer', 'connector')
    definition.nodes[1].config = { tool: 'email.send', args: {} }
    expect(paths(validateToolDefinition(definition))).toContain('effect: Declared effect must cover email.send: write.')
    definition.effect = 'write'
    expect(validateToolDefinition(definition)).toEqual([])
    definition.nodes[1].config = { tool: 'email.draft', args: {} }
    definition.effect = 'read'
    expect(paths(validateToolDefinition(definition))).toContain('effect: Declared effect must cover email.draft: prepare.')
  })

  it('accepts registered tool names in a live draft and refuses a malformed one', () => {
    const definition = createToolDefinition('live', 'Live', 'connector')
    definition.nodes[1].config = { tool: 'calendar.upcoming-events', args: {} }
    expect(paths(validateToolDefinition(definition))[0]).toContain('nodes.action.config.tool')
    expect(validateToolDefinition(definition, true)).toEqual([])
    definition.nodes[1].config = { tool: 'Bad Name', args: {} }
    expect(validateToolDefinition(definition, true)).not.toEqual([])
    definition.nodes[1].type = 'workflow_call'
    definition.nodes[1].config = { toolId: 'morning-brief', version: 1, args: {} }
    expect(validateToolDefinition(definition, true)).toEqual([])
  })
})

describe('tool workspace: what the editor shows', () => {
  const valid = workflow()
  const broken = { ...workflow(), edges: [] } as ToolDefinition

  it('uses the local check for a draft that is not live', () => {
    expect(editorValidation(valid, false, false)).toEqual({ issues: [], label: 'Definition valid' })
    expect(editorValidation(broken, false, true).label).toBe('Needs attention')
  })

  it('lets the server’s own check win for a saved live draft', () => {
    expect(editorValidation(valid, true, false, [])).toEqual({ issues: [], label: 'Checked: valid' })
    const issue = { path: 'nodes', message: 'No' }
    expect(editorValidation(valid, true, false, [issue])).toEqual({ issues: [issue], label: 'Checked: needs attention' })
  })

  it('says why the quick check stands in', () => {
    expect(editorValidation(valid, true, true, []).label).toBe('Definition valid · save to check it')
    expect(editorValidation(valid, true, false, 'checking').label).toBe('Checking…')
    expect(editorValidation(valid, true, false, 'failed').label).toBe('Definition valid · check didn’t answer')
    expect(editorValidation(valid, true, false).label).toBe('Definition valid')
  })
})

describe('tool workspace: parsing', () => {
  it('parses a valid definition and explains an invalid one', () => {
    expect(parseToolDefinition(JSON.stringify(workflow())).id).toBe('greeter')
    expect(() => parseToolDefinition('{not json')).toThrow()
    expect(() => parseToolDefinition(JSON.stringify({ ...workflow(), edges: [] }))).toThrow(/Connect exactly one next step/)
  })

  it('refuses a document over the preview size limit', () => {
    const big = ' '.repeat(150001)
    expect(() => parseToolDefinition(big)).toThrow('Definition exceeds the preview size limit.')
    expect(() => parseToolDraft(big)).toThrow('Definition exceeds the preview size limit.')
  })

  it('lets a draft keep disconnected steps but not a broken shape', () => {
    const draft = { ...workflow(), edges: [] }
    expect(parseToolDraft(JSON.stringify(draft)).edges).toEqual([])
    expect(() => parseToolDraft(JSON.stringify({ ...workflow(), nodes: [] }))).toThrow()
  })
})

describe('tool value sources', () => {
  const definition = (): ToolDefinition => {
    const flow = workflow()
    flow.inputs.push({ name: 'days', type: 'number', required: false }, { name: '__proto__', type: 'string', required: false })
    return flow
  }
  const run = (output: JsonValue): ToolRun => ({
    id: 'r',
    toolId: 'greeter',
    version: 'draft',
    startedAt: '',
    finishedAt: '',
    status: 'completed',
    input: {},
    mode: 'preview',
    steps: [{ nodeId: 'greet', label: 'Greet', type: 'set', status: 'completed', output }],
  })

  it('offers nothing for the Input node or a tool without one', () => {
    expect(toolValueSources(definition(), 'input')).toEqual([])
    const noInput = definition()
    noInput.nodes = noInput.nodes.filter(node => node.type !== 'input')
    expect(toolValueSources(noInput, 'result')).toEqual([])
  })

  it('offers the caller’s inputs, skipping unsafe names, and says which are optional', () => {
    const sources = toolValueSources(definition(), 'greet')
    expect(sources.slice(0, 2)).toEqual([
      { path: '$input.name', label: 'name', detail: 'Caller input · string' },
      { path: '$input.days', label: 'days', detail: 'Caller input · number · optional' },
    ])
    expect(sources.some(source => source.path.includes('__proto__'))).toBe(false)
    expect(sources.map(source => source.path)).toContain('$last')
  })

  it('offers only steps that come before the step on every path', () => {
    const sources = toolValueSources(definition(), 'result').map(source => source.path)
    expect(sources).toContain('$steps.greet')
    expect(toolValueSources(definition(), 'greet').map(source => source.path)).not.toContain('$steps.greet')
    const branching = definition()
    const condition = createToolNode('condition', 'check')
    const other = createToolNode('set', 'other')
    branching.nodes.push(condition, other)
    branching.edges = [
      { id: 'e0', source: 'input', target: 'check' },
      { id: 'e1', source: 'check', target: 'greet', branch: 'true' },
      { id: 'e2', source: 'check', target: 'other', branch: 'false' },
      { id: 'e3', source: 'greet', target: 'result' },
      { id: 'e4', source: 'other', target: 'result' },
    ]
    const afterBranch = toolValueSources(branching, 'result').map(source => source.path)
    expect(afterBranch).toContain('$steps.check')
    expect(afterBranch).not.toContain('$steps.greet')
    expect(afterBranch).not.toContain('$steps.other')
  })

  it('gives only the inputs to a step that no path reaches', () => {
    const detached = definition()
    detached.nodes.push(createToolNode('set', 'lonely'))
    expect(toolValueSources(detached, 'lonely').map(source => source.path)).toEqual(['$input.name', '$input.days'])
  })

  it('offers fields seen in the last test run, to a limited depth and only safe keys', () => {
    const output = { greeting: 'hi', 'bad key': 1, nested: { deep: { deeper: 1 } }, list: [1] }
    const found = toolValueSources(definition(), 'result', run(output)).map(source => source.path)
    expect(found).toContain('$steps.greet.greeting')
    expect(found).toContain('$steps.greet.nested.deep')
    expect(found).not.toContain('$steps.greet.nested.deep.deeper')
    expect(found).not.toContain('$steps.greet.bad key')
    expect(found).toContain('$steps.greet.list')
    const failed = run(output)
    failed.steps[0].status = 'failed'
    expect(toolValueSources(definition(), 'result', failed).map(source => source.path)).not.toContain('$steps.greet.greeting')
    expect(toolValueSources(definition(), 'result', run('text')).map(source => source.path)).toEqual(['$input.name', '$input.days', '$last', '$steps.greet'])
  })
})
