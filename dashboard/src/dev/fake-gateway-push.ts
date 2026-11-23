/**
 * Development-only preview of "Notifications on this device" (web push): the gateway's public key
 * and the devices that have notifications on. The dev server never registers the service worker,
 * so turning it on here reaches the browser step only when a test supplies one. Never imported by
 * the production entry.
 */
import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

// A valid P-256 public point (the RFC 8291 example's receiver key), base64url: preview data only.
const PUBLIC_KEY = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const devices: string[] = []

async function deviceId(endpoint: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** `/api/push` and its two writes; undefined for any other path. */
export async function fakePush(path: string, options: Request): Promise<Json | undefined> {
  const method = options.method ?? 'GET'
  if (path === '/api/push' && method === 'GET') {
    if (globalThis.sessionStorage?.getItem('conker-fake-fail') === 'push') throw new GatewayError('dependency', 503)
    return { publicKey: PUBLIC_KEY, devices: [...devices], limit: 10 }
  }
  if (path === '/api/push/subscriptions' && method === 'POST') {
    const endpoint = String(options.body?.endpoint ?? '')
    if (!endpoint.startsWith('https://')) throw new GatewayError('validation', 422)
    const id = await deviceId(endpoint)
    if (!devices.includes(id)) devices.push(id)
    return { device: id, devices: [...devices], limit: 10 }
  }
  const match = path.match(/^\/api\/push\/subscriptions\/([0-9a-f]{32})\/delete$/)
  if (match && method === 'POST') {
    const index = devices.indexOf(match[1])
    if (index >= 0) devices.splice(index, 1)
    return { removed: index >= 0, devices: [...devices], limit: 10 }
  }
  return undefined
}
