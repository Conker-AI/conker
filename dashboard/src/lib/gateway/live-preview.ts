/**
 * Live answer previews from the gateway's server-sent event stream.
 *
 * A preview is display-only: the saved turn remains the answer. Failures are
 * silent by design (the send itself reports its own outcome), bounded, and never
 * retried past a few reconnects that resume from the last event seen.
 */
export const LIVE_PREVIEW_BYTE_LIMIT = 1024 * 1024
const MAX_RECONNECTS = 3

export type LivePreviewEnd = 'done' | 'unavailable' | 'stopped'
type SseEvent = { event: string; id: number | null; data: string }

/** Split complete events off a buffer; returns the parsed events and the unfinished remainder. */
export function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = []
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = blocks.pop() ?? ''
  for (const block of blocks) {
    let event = 'message', id: number | null = null
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
      else if (field === 'id' && /^\d+$/.test(value)) id = Number(value)
    }
    if (data.length || event !== 'message') events.push({ event, id, data: data.join('\n') })
  }
  return { events, rest }
}

/** Apply one event to the preview text; returns the new text, or null when the stream ended. */
export function applyPreviewEvent(text: string, event: SseEvent): { text: string; end?: LivePreviewEnd } {
  if (event.event === 'reset') return { text: '' }
  if (event.event === 'done') return { text, end: 'done' }
  if (event.event === 'unavailable') return { text, end: 'unavailable' }
  if (event.event !== 'delta') return { text }
  try {
    const value: unknown = JSON.parse(event.data)
    const piece = value && typeof value === 'object' ? (value as { text?: unknown }).text : undefined
    return { text: typeof piece === 'string' ? text + piece : text }
  } catch { return { text } }
}

export async function followLivePreview(
  requestId: string,
  onText: (text: string) => void,
  options: { signal: AbortSignal; fetch?: typeof fetch; origin?: string; retryDelayMs?: number; onReset?: () => void },
): Promise<LivePreviewEnd> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) return 'unavailable'
  const origin = options.origin ?? window.location.origin
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  let text = '', after = 0, received = 0
  for (let attempt = 0; attempt <= MAX_RECONNECTS; attempt++) {
    if (options.signal.aborted) return 'stopped'
    try {
      const url = new URL(`/api/pi/turn-submissions/${requestId}/stream`, origin)
      if (after) url.searchParams.set('after', String(after))
      const response = await fetcher(url, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: options.signal, headers: { Accept: 'text/event-stream' } })
      if (!response.ok || !/^text\/event-stream/i.test(response.headers.get('content-type') ?? '') || !response.body) {
        await response.body?.cancel().catch(() => undefined)
        return 'unavailable'
      }
      const reader = response.body.getReader(), decoder = new TextDecoder()
      let buffer = ''
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          received += value.byteLength
          if (received > LIVE_PREVIEW_BYTE_LIMIT) { await reader.cancel().catch(() => undefined); return 'unavailable' }
          const parsed = parseSseEvents(buffer + decoder.decode(value, { stream: true }))
          buffer = parsed.rest
          for (const event of parsed.events) {
            if (event.id !== null) after = event.id
            if (event.event === 'reset') options.onReset?.()
            const next = applyPreviewEvent(text, event)
            if (next.text !== text) { text = next.text; onText(text) }
            if (next.end) return next.end
          }
        }
      } finally { reader.releaseLock() }
    } catch {
      if (options.signal.aborted) return 'stopped'
    }
    await new Promise(resolve => setTimeout(resolve, options.retryDelayMs ?? 500))
  }
  return 'unavailable'
}
