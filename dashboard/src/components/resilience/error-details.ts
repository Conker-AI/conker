import { GatewayError, type GatewayErrorKind } from '@/lib/gateway/transport'

/** A lazily loaded part of the app is gone from the server: a newer Conker build was installed. */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed/i.test(text)
}

function redact(text: string) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return (origin ? text.split(origin).join('') : text)
    .replace(/\?[^\s)]*/g, '?…')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 500)
}

/** Plain text for "Copy details": no server address, query strings, tokens or record contents. */
export function errorReport(error: unknown): string {
  const lines = ['Conker dashboard error', `Time: ${new Date().toISOString()}`]
  if (typeof window !== 'undefined') lines.push(`Page: ${window.location.pathname}`)
  if (error instanceof GatewayError) lines.push(`Kind: ${error.kind}${error.status ? ` (HTTP ${error.status})` : ''}`)
  if (error instanceof Error) {
    lines.push(`Error: ${error.name}: ${redact(error.message)}`)
    if (error.stack) lines.push(...error.stack.split('\n').slice(1, 9).map(line => `  ${redact(line.trim())}`))
  } else lines.push(`Error: ${redact(String(error))}`)
  if (typeof navigator !== 'undefined') lines.push(`Browser: ${navigator.userAgent}`)
  return lines.join('\n')
}

const titles: Partial<Record<GatewayErrorKind, string>> = {
  network: 'Can’t reach your Conker server',
  dependency: 'Part of Conker isn’t running',
  http: 'Your server turned this down',
  'invalid-response': 'Unexpected answer from your server',
  'response-too-large': 'Too large to show here',
  'browser-expired': 'You were signed out',
  aborted: 'This was interrupted',
  'rate-limited': 'Too many attempts',
}

/** Kinds where trying the same read again can help (the others need a different action). */
export const retryableKinds = new Set<GatewayErrorKind>(['network', 'dependency', 'aborted', 'invalid-response', 'http'])

export function failureTitle(error: unknown, fallback = 'Couldn’t load this') {
  return error instanceof GatewayError ? titles[error.kind] ?? fallback : fallback
}

/** What to do next when a read failed; the transport's own messages are written for actions. */
const loadNextSteps: Partial<Record<GatewayErrorKind, string>> = {
  network: 'Check your connection. This refreshes by itself when your server answers again.',
  dependency: 'Your server answered, but a service it needs isn’t running. Check System, then try again.',
  http: 'Your server refused this request. Try again; if it repeats, check System.',
  'invalid-response': 'Your server sent something this page can’t read. Try again; if it repeats, update Conker.',
  aborted: 'The request stopped before an answer came back. Try again.',
}

export function loadFailureDescription(error: unknown) {
  if (!(error instanceof GatewayError)) return 'Something went wrong while loading this. Try again; if it keeps happening, copy the details.'
  return loadNextSteps[error.kind] ?? error.message
}
