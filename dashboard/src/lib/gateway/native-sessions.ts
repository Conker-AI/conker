import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

export const nativeSessionId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$(?![\s\S])/)
const identity = z.string().length(64).regex(/^[a-f0-9]{64}$/)
const safeText = (maximum: number) => z.string().refine(value => [...value].length <= maximum).refine(value => !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value))
const row = z.object({ id: nativeSessionId, identity, sessionId: nativeSessionId.nullable(), name: safeText(300).nullable(), cwd: safeText(4096).min(1), startedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), state: z.enum(['working', 'blocked', 'done', 'failed', 'stopped', 'unknown']), processStatus: z.enum(['busy', 'waiting', 'idle']).nullable(), waitingFor: z.enum(['permission_prompt', 'input_needed', 'sandbox_request', 'worker_request', 'dialog_open']).nullable(), canStop: z.boolean() }).strict().refine(value => !value.canStop || value.state === 'working' || value.state === 'blocked')
const envelope = { schemaVersion: z.literal(1), provider: z.literal('claude') }
const collection = z.object({ ...envelope, scope: z.literal('background_sessions'), results: z.array(row).max(100), truncated: z.boolean(), omittedCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict().refine(value => new Set(value.results.map(item => item.id)).size === value.results.length)
const detail = z.object({ ...envelope, result: row }).strict()
const output = z.object({ ...envelope, id: nativeSessionId, identity, text: z.string().max(65536).refine(value => new TextEncoder().encode(value).byteLength <= 65536 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value.replace(/[\t\r\n]/g, ''))), truncated: z.boolean(), outputPersisted: z.literal(false) }).strict()
const stop = z.object({ ...envelope, id: nativeSessionId, identity, status: z.literal('stop_requested'), automaticReplay: z.literal(false) }).strict()
export type NativeSession = z.infer<typeof row>
export type NativeSessions = z.infer<typeof collection>
export type NativeSessionOutput = z.infer<typeof output>
function parse<T>(schema: z.ZodType<T>, value: unknown, input = false) { const result = schema.safeParse(value); if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response'); return result.data }
export function nativeAttachCommand(id: string) { return `python scripts/conker.py native claude attach ${parse(nativeSessionId, id, true)}` }
export function createNativeSessionsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const path = (id: string) => `/api/host/claude/sessions/${parse(nativeSessionId, id, true)}`
  return {
    async list(signal?: AbortSignal) { return parse(collection, await auth.request('/api/host/claude/sessions', { signal })) },
    async get(id: string, signal?: AbortSignal) { const value = parse(detail, await auth.request(path(id), { signal })).result; if (value.id !== id) throw new GatewayError('invalid-response'); return value },
    async output(selected: Pick<NativeSession, 'id' | 'identity'>, signal?: AbortSignal) { const id = parse(nativeSessionId, selected.id, true), expected = parse(identity, selected.identity, true), value = parse(output, await auth.request(`${path(id)}/output`, { signal })); if (value.id !== id || value.identity !== expected) throw new GatewayError('invalid-response'); return value },
    async stop(selected: Pick<NativeSession, 'id' | 'identity'>, signal?: AbortSignal, onDispatch?: () => void) { const id = parse(nativeSessionId, selected.id, true), expected = parse(identity, selected.identity, true), value = parse(stop, await auth.request(`${path(id)}/stop`, { method: 'POST', body: { expectedIdentity: expected }, signal, onDispatch })); if (value.id !== id || value.identity !== expected) throw new GatewayError('invalid-response'); return value },
  }
}
export type NativeSessionsClient = ReturnType<typeof createNativeSessionsClient>
