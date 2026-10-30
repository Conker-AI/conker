/**
 * Files over the browser gateway: owner downloads (Word, PDF, slides, spreadsheets, CSV, JSON)
 * and the one raw upload, a chat export's conversations.json. Same rules as the JSON transport:
 * fixed routes, same origin, no redirects, no cache, bounded sizes, and refusals kept to Pi's
 * fixed codes so upstream text is never shown.
 */
import { GatewayError, responseObject, reportReachability } from './transport'

export const GATEWAY_DOWNLOAD_LIMIT = 16 * 1024 * 1024
export const GATEWAY_IMPORT_LIMIT = 128 * 1024 * 1024
export type GatewayFileFormat = 'docx' | 'pdf' | 'pptx' | 'xlsx' | 'csv' | 'json'
export type GatewayDownload = { blob: Blob; filename: string }
export const gatewayFileTypes: Record<GatewayFileFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  json: 'application/json',
}
const artifactDownload = /^\/api\/control\/pi\/artifacts\/artifact_[0-9a-f]{32}\/download$/
const answerDownload = /^\/api\/control\/pi\/sessions\/ses_[0-9a-f]{16}\/messages\/msg_[0-9a-f]{16}\/download$/
const importUpload = /^\/api\/control\/pi\/imports\/(?:chatgpt|claude)\/(?:preview|[0-9a-f]{64})$/
/** Importing (not previewing) a file asks for the password. */
export const isImportSave = (path: string) => importUpload.test(path) && !path.endsWith('/preview')

/** Pi's refusal codes for exports and imports; anything else reads as a plain gateway error. */
export const gatewayRefusalCodes = [
  'export_too_long', 'export_too_deep', 'export_too_many_blocks', 'export_table_too_big', 'export_page_cells', 'export_no_table',
  'export_pages', 'export_slides', 'export_too_big', 'export_layout', 'export_control', 'export_invalid', 'export_busy', 'export_unavailable',
  'unsupported_format', 'source_unavailable', 'not_found', 'not_an_answer', 'privacy_unknown', 'source_changed', 'invalid_version',
  'too_large', 'not_json', 'not_a_list', 'too_many_chats', 'too_many_messages', 'wrong_format', 'unknown_source', 'file_changed',
] as const
export type GatewayRefusalCode = typeof gatewayRefusalCodes[number]
export class GatewayRefusal extends GatewayError {
  readonly refusal: GatewayRefusalCode
  /** For `wrong_format`: the other export the file looks like, when Pi says so. */
  readonly looksLike?: 'chatgpt' | 'claude'
  constructor(refusal: GatewayRefusalCode, status: number, looksLike?: 'chatgpt' | 'claude') {
    super(status >= 500 ? 'dependency' : 'http', status)
    this.name = 'GatewayRefusal'; this.refusal = refusal; this.looksLike = looksLike
  }
}

async function failure(response: Response): Promise<GatewayError> {
  let refusal: GatewayRefusalCode | undefined, looksLike: 'chatgpt' | 'claude' | undefined
  try {
    const detail = (await responseObject(response, 16 * 1024)).detail as Record<string, unknown> | undefined
    if (detail && typeof detail === 'object' && gatewayRefusalCodes.includes(detail.code as GatewayRefusalCode)) refusal = detail.code as GatewayRefusalCode
    // Only Pi's fixed hint is read, never shown as text.
    const hint = refusal === 'wrong_format' && typeof detail?.message === 'string' ? detail.message.match(/It looks like a (ChatGPT|Claude) export\.$/) : null
    if (hint) looksLike = hint[1] === 'Claude' ? 'claude' : 'chatgpt'
  } catch { await response.body?.cancel().catch(() => undefined) }
  if (!refusal && response.status === 413) refusal = 'too_large'
  if (refusal) return new GatewayRefusal(refusal, response.status, looksLike)
  return new GatewayError(response.status === 428 ? 'verification-required' : response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'dependency' : 'http', response.status)
}

/** The readable name from Content-Disposition, stripped of anything a file system would misread. */
export function downloadFilename(header: string | null, format: GatewayFileFormat): string {
  let name = ''
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], plain = header?.match(/filename="([^"]*)"/i)?.[1]
  try { name = encoded ? decodeURIComponent(encoded) : plain ?? '' } catch { name = plain ?? '' }
  // No control or direction-changing characters: the name shows as it is stored.
  name = [...name].filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127 && !/[‎‏‪-‮⁦-⁩]/.test(character) && !'/\\:*?"<>|'.includes(character)).join('').trim().replace(/^\.+/, '').slice(-120)
  return name.toLowerCase().endsWith(`.${format}`) && name.length > format.length + 1 ? name : `conker-export.${format}`
}

async function bytes(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = response.headers.get('content-length')
  if (length && Number(length) > limit) { await response.body?.cancel().catch(() => undefined); throw new GatewayRefusal('export_too_big', 413) }
  if (!response.body) throw new GatewayError('invalid-response')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel().catch(() => undefined); throw new GatewayRefusal('export_too_big', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

export function createGatewayFileTransfer(origin: string, fetcher: typeof fetch) {
  async function send(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    let response: Response
    try {
      response = await fetcher(url, { ...init, signal, credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'same-origin' })
    } catch {
      if (!signal?.aborted) reportReachability(false)
      throw new GatewayError(signal?.aborted ? 'aborted' : 'network')
    }
    reportReachability(true)
    if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && new URL(response.url).origin !== origin)) throw new GatewayError('invalid-response')
    if (!response.ok) throw await failure(response)
    return response
  }
  return {
    /** GET one owner download (an artifact's current version, or one answer). The type must be the one asked for. */
    async download(path: string, query: { format: GatewayFileFormat }, signal?: AbortSignal): Promise<GatewayDownload> {
      const formats = artifactDownload.test(path) ? ['docx', 'pdf', 'pptx', 'xlsx', 'csv', 'json'] : answerDownload.test(path) ? ['docx', 'pdf', 'pptx', 'xlsx'] : []
      if (!formats.includes(query.format) || Object.keys(query).length !== 1) throw new GatewayError('validation')
      const search = new URLSearchParams({ format: query.format })
      try {
        const response = await send(`${origin}${path}?${search}`, { method: 'GET', headers: { Accept: `${gatewayFileTypes[query.format]}, application/json` } }, signal)
        const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        if (type !== gatewayFileTypes[query.format]) { await response.body?.cancel().catch(() => undefined); throw new GatewayError('invalid-response') }
        const content = await bytes(response, GATEWAY_DOWNLOAD_LIMIT)
        return { blob: new Blob([content], { type: gatewayFileTypes[query.format] }), filename: downloadFilename(response.headers.get('content-disposition'), query.format) }
      } catch (error) {
        if (error instanceof GatewayError) throw error
        throw new GatewayError(signal?.aborted ? 'aborted' : 'network')
      }
    },
    /** POST a chat export's conversations.json as the raw body (preview, or import with a password proof). */
    async upload(path: string, body: Blob, csrfToken: string, verificationToken?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
      if (!importUpload.test(path) || !(body instanceof Blob) || !body.size || body.size > GATEWAY_IMPORT_LIMIT || !/^[A-Za-z0-9_-]{32,128}$/.test(csrfToken) ||
        (verificationToken === undefined) === isImportSave(path) || verificationToken !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(verificationToken)) throw new GatewayError('validation')
      const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }
      if (verificationToken) headers['X-Conker-Verification'] = verificationToken
      try {
        return await responseObject(await send(`${origin}${path}`, { method: 'POST', headers, body }, signal), 256 * 1024)
      } catch (error) {
        if (error instanceof GatewayError) throw error
        throw new GatewayError(signal?.aborted ? 'aborted' : 'network')
      }
    },
  }
}
export type GatewayFileTransfer = ReturnType<typeof createGatewayFileTransfer>
