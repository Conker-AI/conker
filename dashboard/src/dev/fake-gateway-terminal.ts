/**
 * Development-only owner terminal for the preview: one lease at a time, a local echo shell that
 * answers `pwd`, and base64 output read by cursor like the real terminal sidecar. Nothing runs.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean> }

export function createFakeTerminal(fail: (status: number) => never) {
  let terminalLease: string | null = null
  let terminalOutput = new TextEncoder().encode('\u001b[1mPreview owner shell\u001b[0m\r\nowner@conker:/workspace/conker$ ')
  let terminalLine = ''
  const appendTerminal = (text: string) => {
    const next = new TextEncoder().encode(text), combined = new Uint8Array(terminalOutput.length + next.length)
    combined.set(terminalOutput); combined.set(next, terminalOutput.length); terminalOutput = combined
  }
  const terminalBase64 = (value: Uint8Array) => {
    let binary = ''
    for (const byte of value) binary += String.fromCharCode(byte)
    return btoa(binary)
  }
  const terminalInput = (value: string) => {
    const binary = atob(value), bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    for (const character of text) {
      if (character === '\r' || character === '\n') {
        appendTerminal(`\r\n${terminalLine.trim() === 'pwd' ? '/workspace/conker\r\n' : terminalLine.trim() ? `Preview received: ${terminalLine.trim()}\r\n` : ''}owner@conker:/workspace/conker$ `)
        terminalLine = ''
      } else if (character === '\u007f') {
        if (terminalLine) { terminalLine = terminalLine.slice(0, -1); appendTerminal('\b \b') }
      } else { terminalLine += character; appendTerminal(character) }
    }
    return bytes.length
  }
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/terminal/current' && method === 'GET') return { lease: terminalLease, workspace: '/workspace/conker', maximumLifetimeSeconds: 600, commandsPersisted: false, outputPersisted: false }
    if (path === '/api/terminal' && method === 'POST') {
      const requestId = String(options.body?.requestId ?? '')
      if (terminalLease && terminalLease !== requestId) fail(409)
      const replayed = terminalLease === requestId
      terminalLease = requestId
      return { id: requestId, closed: false, replayed }
    }
    if ((match = path.match(/^\/api\/terminal\/([A-Za-z0-9_-]{16,100})$/)) && method === 'GET') {
      if (terminalLease !== match[1]) return fail(404)
      const cursor = Number(options.query?.cursor ?? 0)
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > terminalOutput.length) return fail(422)
      return { data: terminalBase64(terminalOutput.slice(cursor)), encoding: 'base64', cursor: terminalOutput.length, droppedBytes: 0, exitCode: null }
    }
    if ((match = path.match(/^\/api\/terminal\/([A-Za-z0-9_-]{16,100})\/(input|resize|close)$/)) && method === 'POST') {
      if (terminalLease !== match[1]) return fail(404)
      if (match[2] === 'input') { const acceptedBytes = terminalInput(String(options.body?.data ?? '')); return { acceptedBytes, automaticReplay: false } }
      if (match[2] === 'resize') return { resized: true }
      terminalLease = null
      return { closed: true }
    }
    return undefined
  }
}
