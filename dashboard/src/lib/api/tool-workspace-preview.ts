import { createToolDefinition, createToolNode, parseToolDraft, validateToolDefinition, valueMatchesType } from "../tool-workspace"
import type { JsonValue, ToolDefinition, ToolField, ToolNode, ToolRun, ToolWorkspaceClient, WorkspaceRecord } from "../tool-workspace"
import { tools as fixtureTools } from "./fixtures/tools"
import type { Tool } from "./models"

const clone = <T>(value: T): T => structuredClone(value)
const now = () => new Date().toISOString()
function assertBoundedJson(value: unknown, depth = 0, count = { value: 0 }): void {
  if (depth > 16 || ++count.value > 4000) throw new Error("Test input is too deeply nested or too large.")
  if (typeof value === "string" && value.length > 16000) throw new Error("Test strings must be under 16,000 characters.")
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Test numbers must be finite.")
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new Error("Test inputs must contain JSON values only.")
  if (Array.isArray(value)) { if (value.length > 200) throw new Error("Test arrays are limited to 200 items."); value.forEach(v => assertBoundedJson(v, depth + 1, count)) }
  else if (value !== null && typeof value === "object") {
    if (Object.keys(value).length > 100) throw new Error("Test objects are limited to 100 fields.")
    Object.values(value).forEach(v => assertBoundedJson(v, depth + 1, count))
  }
}
function record(definition: ToolDefinition): WorkspaceRecord { return { id: definition.id, draft: definition, published: [], runs: [] } }
function field(name: string, type: ToolField["type"], value: JsonValue): ToolField { return { name, type, required: true, default: value } }
export function createToolWorkspaceFixtures(tools: Tool[] = fixtureTools): WorkspaceRecord[] {
  const entries = tools.map(tool => {
    const d = createToolDefinition(tool.id, tool.name, "connector")
    d.description = tool.purpose
    d.nodes[1].config.tool = tool.name
    d.effect = tool.sensitivity === "Observe" ? "read" : tool.sensitivity === "Prepare" ? "prepare" : "write"
    d.credentialRefs = tool.name.startsWith("email") ? ["connection:mail"] : tool.name.startsWith("calendar") ? ["connection:calendar"] : []
    d.agentVisible = true
    return record(d)
  })
  const brief = createToolDefinition("morning-brief", "Prepare morning briefing")
  brief.description = "Read sample calendar events, choose a busy or quiet morning summary, and return a preview. No scheduler or model is called."
  brief.inputs = [field("busyAt", "number", 2)]
  brief.outputs = [field("summary", "string", "")]
  brief.nodes = [
    createToolNode("input", "input", { x: 30, y: 180 }),
    { ...createToolNode("tool_call", "calendar", { x: 280, y: 180 }), label: "Read calendar", config: { tool: "calendar.read", args: {} } },
    { ...createToolNode("condition", "busy", { x: 530, y: 180 }), label: "Busy morning?", config: { operator: "greater", left: "$steps.calendar.count", right: "$input.busyAt" } },
    { ...createToolNode("set", "busy-note", { x: 780, y: 70 }), label: "Protect focus time", config: { value: { summary: "Three sample events. Protect a focus block before lunch." } } },
    { ...createToolNode("set", "quiet-note", { x: 780, y: 310 }), label: "Keep space open", config: { value: { summary: "A quieter morning. Keep space for focused work." } } },
    createToolNode("return", "result", { x: 1030, y: 180 }),
  ]
  brief.edges = [
    { id: "start", source: "input", target: "calendar" }, { id: "check", source: "calendar", target: "busy" },
    { id: "yes", source: "busy", target: "busy-note", branch: "true" }, { id: "no", source: "busy", target: "quiet-note", branch: "false" },
    { id: "busy-result", source: "busy-note", target: "result" }, { id: "quiet-result", source: "quiet-note", target: "result" },
  ]
  const tidy = createToolDefinition("normalize-labels", "Normalize research labels")
  tidy.description = "Trim a bounded list of labels and estimate processing cost with a pure calculation. This is a local fixture test."
  tidy.inputs = [field("labels", "array", [" Research ", " AI ", " Design "]), field("unitCost", "number", 0.02)]
  tidy.nodes = [createToolNode("input", "input", { x: 20, y: 160 }), { ...createToolNode("loop", "trim", { x: 280, y: 160 }), label: "Trim each label", config: { items: "$input.labels", limit: 20, operation: "trim" } }, { ...createToolNode("calculation", "estimate", { x: 540, y: 160 }), label: "Calculate sample cost", config: { operator: "multiply", left: "$steps.trim.count", right: "$input.unitCost" } }, { ...createToolNode("return", "result", { x: 800, y: 160 }), config: { value: { labels: "$steps.trim.items", estimate: "$steps.estimate" } } }]
  tidy.edges = tidy.nodes.slice(1).map((n, i) => ({ id: `edge-${i}`, source: tidy.nodes[i].id, target: n.id }))
  return [...entries, record(brief), record(tidy)]
}
function normalizeInput(fields: ToolField[], input: Record<string, JsonValue>): Record<string, JsonValue> {
  if (input === null || Array.isArray(input) || typeof input !== "object") throw new Error("Test inputs must be a JSON object.")
  const result: Record<string, JsonValue> = {}
  for (const key of Object.keys(input)) if (!fields.some(f => f.name === key)) throw new Error(`Unknown input: ${key}.`)
  for (const f of fields) {
    const value = Object.hasOwn(input, f.name) ? input[f.name] : f.default
    if (value === undefined) { if (f.required) throw new Error(`Input ${f.name} is required.`); continue }
    if (!valueMatchesType(value, f.type)) throw new Error(`Input ${f.name} must be ${f.type}.`)
    Object.defineProperty(result, f.name, { value: clone(value), enumerable: true, configurable: true })
  }
  return result
}
function mockConnector(name: JsonValue, args: JsonValue): JsonValue {
  const results: Record<string, JsonValue> = {
    "calendar.read": { count: 3, events: ["Review project", "Lunch", "Training"], fixture: true },
    "email.read": { count: 2, subjects: ["Project notes", "Design review"], fixture: true },
    "files.read": { count: 2, files: ["notes/research.md", "notes/design.md"], fixture: true },
    "system.status": { cpu: 24, memory: 61, status: "healthy", fixture: true },
    "email.draft": { status: "simulated", action: "draft", fixture: true },
    "email.send": { status: "simulated", action: "send", fixture: true },
    "files.delete": { status: "simulated", action: "delete", fixture: true },
    "reminder.create": { status: "simulated", action: "create", fixture: true },
  }
  if (typeof name !== "string" || !Object.hasOwn(results, name)) throw new Error("Only the listed mock connectors can run in this preview.")
  return { ...(results[name] as Record<string, JsonValue>), received: args }
}
type WorkflowResolver = (toolId: string, version: number) => ToolDefinition | undefined
type ExecutionContext = { steps: number; loopItems: number; frames: { key: string; startedAt: number; startingStep: number; startingLoop: number; limits: ToolDefinition["budgets"] }[] }
function assertEffect(parent: ToolDefinition, child: ToolDefinition): void {
  const levels = { read: 0, prepare: 1, write: 2 }
  if (levels[parent.effect] < levels[child.effect]) throw new Error(`Declared effect must cover published tool ${child.name}: ${child.effect}.`)
}
export function executeToolPreview(d: ToolDefinition, suppliedInput: Record<string, JsonValue>, version: number | "draft" = "draft", resolveWorkflow?: WorkflowResolver, context?: ExecutionContext): ToolRun {
  const startedAt = now(), start = performance.now()
  const run: ToolRun = { id: crypto.randomUUID(), toolId: d.id, version, startedAt, finishedAt: startedAt, status: "failed", input: {}, steps: d.nodes.map(n => ({ nodeId: n.id, label: n.label, type: n.type, status: "skipped" })), mode: "preview" }
  let current: ToolNode | undefined, entered = false
  const execution = context ?? { steps: 0, loopItems: 0, frames: [] }
  try {
    const key = `${d.id}@${version}`
    if (execution.frames.some(frame => frame.key === key)) throw new Error("Recursive published tool call blocked.")
    if (execution.frames.length >= 8) throw new Error("Published tool nesting exceeds the depth limit of 8.")
    execution.frames.push({ key, startedAt: start, startingStep: execution.steps, startingLoop: execution.loopItems, limits: d.budgets }); entered = true
    assertBoundedJson(suppliedInput)
    run.input = clone(suppliedInput)
    const issues = validateToolDefinition(d)
    if (issues.length) throw new Error(issues.map(i => i.message).join(" "))
    const input = normalizeInput(d.inputs, suppliedInput)
    const outputs: Record<string, JsonValue> = Object.create(null)
    let last: JsonValue = input
    const checkBudget = () => {
      for (const frame of execution.frames) {
        if (execution.steps - frame.startingStep > frame.limits.maxSteps) throw new Error("Step budget exceeded across this tool and its nested calls.")
        if (execution.loopItems - frame.startingLoop > frame.limits.maxLoopItems) throw new Error("Loop item budget exceeded across this tool and its nested calls.")
        if (performance.now() - frame.startedAt > frame.limits.timeoutMs) throw new Error("Preview time budget exceeded.")
      }
    }
    const budget = () => { execution.steps++; checkBudget() }
    const resolve = (value: JsonValue): JsonValue => {
      if (Array.isArray(value)) return value.map(resolve)
      if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]))
      if (typeof value !== "string" || !value.startsWith("$")) return value
      if (value.startsWith("$$")) return value.slice(1)
      const [root, ...parts] = value.slice(1).split(".")
      let result: unknown = root === "input" ? input : root === "last" ? last : root === "steps" ? outputs : undefined
      for (const part of parts) {
        if (["__proto__", "constructor", "prototype"].includes(part) || result === null || typeof result !== "object" || !Object.hasOwn(result, part)) throw new Error(`Reference ${value} is unavailable on this branch.`)
        result = (result as Record<string, unknown>)[part]
      }
      if (result === undefined) throw new Error(`Reference ${value} is unavailable.`)
      return clone(result as JsonValue)
    }
    current = d.nodes.find(n => n.type === "input")
    while (current) {
      budget()
      const c = current.config
      let output: JsonValue
      let branch: "true" | "false" | undefined
      switch (current.type) {
        case "input": output = input; break
        case "tool_call": output = mockConnector(c.tool, resolve(c.args)); break
        case "workflow_call": {
          const childDefinition = resolveWorkflow?.(String(c.toolId), Number(c.version))
          if (!childDefinition) throw new Error(`Published tool ${c.toolId} v${c.version} does not exist.`)
          assertEffect(d, childDefinition)
          const child = executeToolPreview(childDefinition, resolve(c.args) as Record<string, JsonValue>, Number(c.version), resolveWorkflow, execution)
          run.steps.find(s => s.nodeId === current!.id)!.child = child
          if (child.status !== "completed") throw new Error(`Published tool ${c.toolId} v${c.version} failed: ${child.error}`)
          checkBudget()
          output = child.output ?? null
          break
        }
        case "set": case "return": output = resolve(c.value); break
        case "calculation": {
          const left = resolve(c.left), right = resolve(c.right)
          if (typeof left !== "number" || typeof right !== "number") throw new Error("Calculation requires numeric operands.")
          if (c.operator === "divide" && right === 0) throw new Error("Cannot divide by zero.")
          output = c.operator === "add" ? left + right : c.operator === "subtract" ? left - right : c.operator === "multiply" ? left * right : left / right
          if (!Number.isFinite(output)) throw new Error("Calculation result is not finite.")
          break
        }
        case "condition": {
          const left = resolve(c.left), right = c.right === undefined ? null : resolve(c.right)
          if ((c.operator === "greater" || c.operator === "less") && (typeof left !== "number" || typeof right !== "number")) throw new Error("Ordered comparisons require numbers.")
          output = c.operator === "equals" ? JSON.stringify(left) === JSON.stringify(right) : c.operator === "greater" ? (left as number) > (right as number) : c.operator === "less" ? (left as number) < (right as number) : c.operator === "exists" ? left !== null : typeof left === "string" && typeof right === "string" ? left.includes(right) : Array.isArray(left) ? left.some(v => JSON.stringify(v) === JSON.stringify(right)) : false
          branch = output ? "true" : "false"
          break
        }
        case "loop": {
          const items = resolve(c.items)
          if (!Array.isArray(items)) throw new Error("Loop input must be an array.")
          if (items.length > Number(c.limit) || items.length > d.budgets.maxLoopItems) throw new Error("Loop item limit exceeded. No partial list was processed.")
          execution.loopItems += items.length
          checkBudget()
          output = { items: items.map(item => { budget(); if (c.operation === "identity") return item; if (typeof item !== "string") throw new Error("Trim and uppercase require string items."); return c.operation === "trim" ? item.trim() : item.toUpperCase() }), count: items.length }
          break
        }
      }
      outputs[current.id] = output
      last = output
      const receipt = run.steps.find(s => s.nodeId === current!.id)!
      receipt.status = "completed"; receipt.output = clone(output)
      if (current.type === "return") {
        for (const f of d.outputs) {
          const v = output !== null && typeof output === "object" && !Array.isArray(output) ? output[f.name] : undefined
          if (v === undefined ? f.required : !valueMatchesType(v, f.type)) throw new Error(`Output ${f.name} must match its ${f.type} contract.`)
        }
        run.output = clone(output); run.status = "completed"; break
      }
      const edge = d.edges.find(e => e.source === current!.id && e.branch === branch)
      current = d.nodes.find(n => n.id === edge?.target)
    }
    if (run.status !== "completed") throw new Error("Execution did not reach Return.")
  } catch (error) {
    run.error = error instanceof Error ? error.message : "Preview failed."
    const step = current && run.steps.find(s => s.nodeId === current!.id)
    if (step) { step.status = "failed"; step.error = run.error; delete step.output }
  } finally {
    if (entered) execution.frames.pop()
  }
  run.finishedAt = now()
  return run
}
/** In-memory fixture transport. No credentials, browser persistence, live effects, or arbitrary code. */
export function createToolWorkspacePreview(initialTools?: Tool[]): ToolWorkspaceClient {
  const records = new Map(createToolWorkspaceFixtures(initialTools).map(r => [r.id, r]))
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach(listener => listener())
  const get = (id: string) => { const r = records.get(id); if (!r) throw new Error("Tool no longer exists."); return r }
  const resolvePublished: WorkflowResolver = (id, version) => records.get(id)?.published.find(p => p.version === version)?.definition
  const validateDependencies = (definition: ToolDefinition, ancestry: string[] = [], depth = 0, inspected = { count: 0 }) => {
    if (++inspected.count > 2000) throw new Error("Published dependency graph exceeds the preview validation budget.")
    if (depth >= 8) throw new Error("Published tool nesting exceeds the depth limit of 8.")
    for (const node of definition.nodes.filter(n => n.type === "workflow_call")) {
      const key = `${node.config.toolId}@${node.config.version}`
      if (ancestry.includes(key)) throw new Error("Recursive published tool call blocked.")
      const child = resolvePublished(String(node.config.toolId), Number(node.config.version))
      if (!child) throw new Error(`Published tool ${node.config.toolId} v${node.config.version} does not exist.`)
      assertEffect(definition, child)
      validateDependencies(child, [...ancestry, key], depth + 1, inspected)
    }
  }
  return {
    async list() { return clone([...records.values()]) },
    async get(id) { return clone(get(id)) },
    async create(name, kind = "workflow") { if (!name.trim()) throw new Error("Give the tool a name."); const d = parseToolDraft(JSON.stringify(createToolDefinition(`tool-${crypto.randomUUID().slice(0, 8)}`, name.trim(), kind))); const r = record(d); records.set(r.id, r); emit(); return clone(r) },
    async save(definition) { const d = parseToolDraft(JSON.stringify(definition)); const r = get(d.id); r.draft = clone(d); emit(); return clone(r) },
    async publish(id) { const r = get(id); const errors = validateToolDefinition(r.draft); if (errors.length) throw new Error(errors.map(e => e.message).join(" ")); validateDependencies(r.draft); const published = { version: r.published.length + 1, publishedAt: now(), definition: clone(r.draft) }; r.published.push(published); emit(); return clone(published) },
    async run(id, input, version) { const r = get(id); const d = version === undefined ? r.draft : resolvePublished(id, version); if (!d) throw new Error("Published version does not exist."); const run = executeToolPreview(clone(d), input, version ?? "draft", resolvePublished); r.runs.unshift(run); r.runs.splice(30); emit(); return clone(run) },
    async remove(id) { get(id); if ([...records.values()].some(r => r.id !== id && [...r.published.map(p => p.definition), r.draft].some(d => d.nodes.some(n => n.type === "workflow_call" && n.config.toolId === id)))) throw new Error("This tool is referenced by another draft or published version. Remove draft references first; published dependencies must be retained."); records.delete(id); emit() },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}
