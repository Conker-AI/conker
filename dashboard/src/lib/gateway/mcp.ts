import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const identity = z.string().regex(/^mcp\.[a-z0-9][a-z0-9.-]{1,74}$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const endpoint = z.string().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !/[\\\s]/.test(value) && !url.username && !url.password && !url.port && !url.search && !url.hash } catch { return false }
})
const secretRef = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/).nullable()
const remote = z.object({ name: z.string().min(1).max(128), description: z.string().max(4000), inputSchema: z.record(z.string(), z.unknown()), schemaHash: digest })
const tool = z.object({ id: identity, name: z.string().min(1).max(120), description: z.string().max(4000), status: z.enum(['active', 'disabled']), authorization: z.literal('owner_confirmation'), url: endpoint, tool_name: z.string().min(1).max(128), schema_hash: digest, secret_ref: secretRef, version: z.number().int().positive(), digest })
const discovery = z.object({ schemaVersion: z.literal(1), server: z.object({ url: endpoint, name: z.string().max(200), version: z.string().max(200) }), tools: z.array(remote).max(64), unsupportedTools: z.array(z.object({ name: z.string().max(128), reason: z.string().max(500) })).max(64).optional() })
const access = z.object({ schemaVersion: z.literal(1), toolId: identity, actorId: z.string().max(200), actorName: z.string().max(200), enabled: z.boolean(), requiredScope: z.string().max(100), digest })
export type McpTool = z.infer<typeof tool>
export type McpDiscovery = z.infer<typeof discovery>
export type McpAccess = z.infer<typeof access>
function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}
export function createGatewayMcpClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async list(signal?: AbortSignal) { return parse(z.object({ schemaVersion: z.literal(1), tools: z.array(tool).max(1000) }), await auth.request('/api/owner/mcp/tools', { signal })).tools },
    async discover(url: string, secret: string | null) {
      const body = { url: parse(endpoint, url, true), secret_ref: parse(secretRef, secret, true) }
      const result = parse(discovery, await auth.request('/api/owner/mcp/discover', { method: 'POST', body }))
      if (result.server.url !== body.url) throw new GatewayError('invalid-response')
      return result
    },
    async import(found: McpDiscovery, selectedName: string, id: string, secret: string | null) {
      const saved = parse(discovery, found, true), selected = saved.tools.filter(item => item.name === selectedName)
      if (selected.length !== 1) throw new GatewayError('validation')
      const body = { id: parse(identity, id, true), name: selected[0].name.slice(0, 120), description: selected[0].description.trim() || `MCP tool ${selectedName}`, url: saved.server.url, tool_name: selectedName, input_schema: selected[0].inputSchema, schema_hash: selected[0].schemaHash, secret_ref: parse(secretRef, secret, true) }
      const result = parse(z.object({ schemaVersion: z.literal(1), tool }), await auth.request('/api/owner/mcp/import', { method: 'POST', body })).tool
      if (result.id !== body.id || result.schema_hash !== body.schema_hash || result.url !== body.url || result.tool_name !== body.tool_name) throw new GatewayError('invalid-response')
      return result
    },
    async setEnabled(value: McpTool, enabled: boolean) {
      const saved = parse(tool, value, true)
      const body = { expected_digest: saved.digest, enabled: parse(z.boolean(), enabled, true) }
      const result = parse(z.object({ schemaVersion: z.literal(1), tool }), await auth.request(`/api/owner/mcp/tools/${saved.id}/state`, { method: 'POST', body })).tool
      if (result.id !== saved.id || result.status !== (enabled ? 'active' : 'disabled')) throw new GatewayError('invalid-response')
      return result
    },
    async access(value: McpTool, signal?: AbortSignal) {
      const saved = parse(tool, value, true)
      const result = parse(access, await auth.request(`/api/owner/mcp/tools/${saved.id}/access`, { signal }))
      if (result.toolId !== saved.id || result.digest !== saved.digest || result.requiredScope !== `tool:${saved.id}`) throw new GatewayError('invalid-response')
      return result
    },
    async setAccess(value: McpTool, enabled: boolean) {
      const saved = parse(tool, value, true)
      const result = parse(access, await auth.request(`/api/owner/mcp/tools/${saved.id}/access`, { method: 'POST', body: { enabled: parse(z.boolean(), enabled, true), expected_digest: saved.digest } }))
      if (result.toolId !== saved.id || result.digest !== saved.digest || result.enabled !== enabled || result.requiredScope !== `tool:${saved.id}`) throw new GatewayError('invalid-response')
      return result
    },
  }
}
export type GatewayMcpClient = ReturnType<typeof createGatewayMcpClient>
