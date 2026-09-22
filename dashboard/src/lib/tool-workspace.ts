import { z } from "zod"

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type FieldType = "string" | "number" | "boolean" | "array" | "object"
export type ToolField = { name: string; type: FieldType; required: boolean; description?: string; default?: JsonValue }
export type NodeKind = "input" | "tool_call" | "workflow_call" | "set" | "calculation" | "condition" | "loop" | "return"
export type ToolNode = { id: string; type: NodeKind; label: string; position: { x: number; y: number }; config: Record<string, JsonValue> }
export type ToolEdge = { id: string; source: string; target: string; branch?: "true" | "false" }
export type ToolDefinition = {
  id: string; name: string; description: string; kind: "connector" | "workflow"
  nodes: ToolNode[]; edges: ToolEdge[]; inputs: ToolField[]; outputs: ToolField[]
  credentialRefs: string[]; effect: "read" | "prepare" | "write"; agentVisible: boolean
  budgets: { maxSteps: number; maxLoopItems: number; timeoutMs: number }
}
export type ValidationIssue = { path: string; message: string; nodeId?: string }
export type PublishedTool = { version: number; publishedAt: string; definition: ToolDefinition }
export type ToolStepReceipt = { nodeId: string; label: string; type: NodeKind; status: "completed" | "failed" | "skipped"; output?: JsonValue; error?: string; child?: ToolRun }
export type ToolRun = { id: string; toolId: string; version: number | "draft"; startedAt: string; finishedAt: string; status: "completed" | "failed"; input: Record<string, JsonValue>; output?: JsonValue; steps: ToolStepReceipt[]; error?: string; mode: "preview" }
export type WorkspaceRecord = { id: string; draft: ToolDefinition; published: PublishedTool[]; runs: ToolRun[] }
export interface ToolWorkspaceClient {
  list(): Promise<WorkspaceRecord[]>
  get(id: string): Promise<WorkspaceRecord>
  create(name: string, kind?: ToolDefinition["kind"]): Promise<WorkspaceRecord>
  save(definition: ToolDefinition): Promise<WorkspaceRecord>
  publish(id: string): Promise<PublishedTool>
  run(id: string, input: Record<string, JsonValue>, version?: number): Promise<ToolRun>
  remove(id: string): Promise<void>
  subscribe(listener: () => void): () => void
}
export const MOCK_CONNECTORS = ["calendar.read", "email.read", "email.draft", "email.send", "files.read", "files.delete", "reminder.create", "system.status"] as const
export const NODE_LABELS: Record<NodeKind, string> = { input: "Input", tool_call: "Call connector", workflow_call: "Call published tool", set: "Set value", calculation: "Calculate", condition: "Condition", loop: "Bounded loop", return: "Return" }

const json: z.ZodType<JsonValue> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string().max(16000), z.array(json).max(200), z.record(z.string(), json)]))
const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, "Use a letter followed by letters, digits, underscores or hyphens.")
const field = z.object({ name: identifier, type: z.enum(["string", "number", "boolean", "array", "object"]), required: z.boolean(), description: z.string().max(500).optional(), default: json.optional() }).strict()
const definitionSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(100), description: z.string().max(2000), kind: z.enum(["connector", "workflow"]),
  nodes: z.array(z.object({ id: identifier, type: z.enum(["input", "tool_call", "workflow_call", "set", "calculation", "condition", "loop", "return"]), label: z.string().min(1).max(100), position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(), config: z.record(z.string(), json) }).strict()).min(2).max(60),
  edges: z.array(z.object({ id: identifier, source: identifier, target: identifier, branch: z.enum(["true", "false"]).optional() }).strict()).max(120),
  inputs: z.array(field).max(30), outputs: z.array(field).max(30), credentialRefs: z.array(z.string().regex(/^connection:[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, "Use a connection:name reference, never a credential value.")).max(20),
  effect: z.enum(["read", "prepare", "write"]), agentVisible: z.boolean(), budgets: z.object({ maxSteps: z.number().int().min(2).max(200), maxLoopItems: z.number().int().min(1).max(50), timeoutMs: z.number().int().min(100).max(30000) }).strict(),
}).strict()
const configs: Record<NodeKind, z.ZodType> = {
  input: z.object({}).strict(),
  tool_call: z.object({ tool: z.enum(MOCK_CONNECTORS), args: z.record(z.string(), json) }).strict(),
  workflow_call: z.object({ toolId: identifier, version: z.number().int().min(1), args: z.record(z.string(), json) }).strict(),
  set: z.object({ value: json }).strict(),
  calculation: z.object({ operator: z.enum(["add", "subtract", "multiply", "divide"]), left: json, right: json }).strict(),
  condition: z.object({ operator: z.enum(["equals", "greater", "less", "contains", "exists"]), left: json, right: json.optional() }).strict(),
  loop: z.object({ items: json, limit: z.number().int().min(1).max(50), operation: z.enum(["identity", "uppercase", "trim"]) }).strict(),
  return: z.object({ value: json }).strict(),
}
export function valueMatchesType(value: unknown, type: FieldType): boolean {
  if (type === "array") return Array.isArray(value)
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value)
  return typeof value === type && (type !== "number" || Number.isFinite(value))
}
export function validateToolDefinition(value: unknown, live = false): ValidationIssue[] {
  const parsed = definitionSchema.safeParse(value)
  if (!parsed.success) return parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message }))
  const d = parsed.data as ToolDefinition
  const issues: ValidationIssue[] = []
  const add = (path: string, message: string, nodeId?: string) => issues.push({ path, message, nodeId })
  const ids = new Set(d.nodes.map(n => n.id))
  if (ids.size !== d.nodes.length) add("nodes", "Node IDs must be unique.")
  if (new Set(d.edges.map(e => e.id)).size !== d.edges.length) add("edges", "Edge IDs must be unique.")
  for (const key of ["inputs", "outputs"] as const) {
    if (new Set(d[key].map(f => f.name)).size !== d[key].length) add(key, "Field names must be unique.")
    d[key].forEach(f => { if (f.default !== undefined && !valueMatchesType(f.default, f.type)) add(key, `Default for ${f.name} must be ${f.type}.`) })
  }
  for (const edge of d.edges) if (!ids.has(edge.source) || !ids.has(edge.target)) add("edges", `Connection ${edge.id} has a missing endpoint.`)
  const roots = d.nodes.filter(n => n.type === "input")
  if (roots.length !== 1) add("nodes", "Use exactly one Input node.")
  if (!d.nodes.some(n => n.type === "return")) add("nodes", "Add a Return node.")
  for (const node of d.nodes) {
    const schema = live && node.type === 'tool_call' ? z.object({ tool: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,79}$/), args: z.record(z.string(), json) }).strict() : configs[node.type]
    const result = schema.safeParse(node.config)
    if (!result.success) result.error.issues.forEach(issue => add(`nodes.${node.id}.config.${issue.path.join(".")}`, issue.message, node.id))
    const out = d.edges.filter(e => e.source === node.id)
    if (node.type === "input" && d.edges.some(e => e.target === node.id)) add("edges", "Input cannot have incoming connections.", node.id)
    if (node.type === "return" ? out.length !== 0 : node.type === "condition" ? out.length !== 2 || !out.some(e => e.branch === "true") || !out.some(e => e.branch === "false") : out.length !== 1 || out.some(e => e.branch)) add("edges", node.type === "return" ? "Return must have no outgoing connections." : node.type === "condition" ? "Connect both True and False branches exactly once." : "Connect exactly one next step without a branch label.", node.id)
    if (node.type === "loop" && Number(node.config.limit) > d.budgets.maxLoopItems) add("budgets", "Loop limit exceeds the tool's item budget.", node.id)
    if (node.type === "condition" && node.config.operator !== "exists" && node.config.right === undefined) add("config", "Comparison needs a right value.", node.id)
    const inspectReferences = (value: JsonValue): void => {
      if (Array.isArray(value)) { value.forEach(inspectReferences); return }
      if (value !== null && typeof value === "object") { Object.values(value).forEach(inspectReferences); return }
      if (typeof value !== "string" || !value.startsWith("$") || value.startsWith("$$")) return
      const [root, key, ...path] = value.slice(1).split(".")
      if (!["input", "steps", "last"].includes(root) || [key, ...path].some(part => part === "" || ["__proto__", "constructor", "prototype"].includes(part))) add("config", `Invalid reference ${value}. Use $input, $steps or $last; escape literal dollars with $$.`, node.id)
      else if (root === "input" && key && !d.inputs.some(f => f.name === key)) add("config", `Input reference ${value} has no declared field.`, node.id)
      else if (root === "steps" && (!key || !ids.has(key) || key === node.id)) add("config", `Step reference ${value} must name another existing node.`, node.id)
    }
    Object.values(node.config).forEach(inspectReferences)
    if (node.type === "tool_call" && !live) {
      const effect = ["email.send", "files.delete", "reminder.create"].includes(String(node.config.tool)) ? "write" : node.config.tool === "email.draft" ? "prepare" : "read"
      if (effect === "write" && d.effect !== "write" || effect === "prepare" && d.effect === "read") add("effect", `Declared effect must cover ${node.config.tool}: ${effect}.`, node.id)
    }
  }
  const visited = new Set<string>(), active = new Set<string>()
  const visit = (id: string) => {
    if (active.has(id)) { add("edges", "Graph cycles are unsupported. Use the bounded Loop node.", id); return }
    if (visited.has(id)) return
    visited.add(id); active.add(id)
    d.edges.filter(e => e.source === id).forEach(e => visit(e.target))
    active.delete(id)
  }
  if (roots[0]) visit(roots[0].id)
  d.nodes.filter(n => !visited.has(n.id)).forEach(n => add("nodes", "Node is disconnected from Input.", n.id))
  return issues
}
export function parseToolDefinition(source: string): ToolDefinition {
  if (source.length > 150000) throw new Error("Definition exceeds the preview size limit.")
  const value: unknown = JSON.parse(source)
  const issues = validateToolDefinition(value)
  if (issues.length) throw new Error(issues.map(i => `${i.path}: ${i.message}`).join("\n"))
  return value as ToolDefinition
}
export function createToolNode(type: NodeKind, id = `${type}-${crypto.randomUUID().slice(0, 8)}`, position = { x: 280, y: 160 }): ToolNode {
  const config: Record<NodeKind, Record<string, JsonValue>> = {
    input: {}, tool_call: { tool: "system.status", args: {} }, workflow_call: { toolId: "morning-brief", version: 1, args: {} }, set: { value: "Hello" }, calculation: { operator: "multiply", left: 10, right: 2 }, condition: { operator: "greater", left: "$input.value", right: 10 }, loop: { items: ["one", "two"], limit: 10, operation: "uppercase" }, return: { value: "$last" },
  }
  return { id, type, label: NODE_LABELS[type], position, config: config[type] }
}
export function createToolDefinition(id: string, name: string, kind: ToolDefinition["kind"] = "workflow"): ToolDefinition {
  const nodes = [createToolNode("input", "input", { x: 40, y: 120 }), ...(kind === "connector" ? [createToolNode("tool_call", "action", { x: 320, y: 120 })] : []), createToolNode("return", "result", { x: kind === "connector" ? 600 : 320, y: 120 })]
  return { id, name, description: "", kind, nodes, edges: nodes.slice(1).map((node, i) => ({ id: `edge-${i}`, source: nodes[i].id, target: node.id })), inputs: [], outputs: [], credentialRefs: [], effect: "read", agentVisible: false, budgets: { maxSteps: 80, maxLoopItems: 20, timeoutMs: 5000 } }
}
/** Drafts may have disconnected steps; publishing and running require a valid graph. */
export function parseToolDraft(source: string): ToolDefinition {
  if (source.length > 150000) throw new Error("Definition exceeds the preview size limit.")
  return definitionSchema.parse(JSON.parse(source)) as ToolDefinition
}
