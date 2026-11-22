import { afterEach, describe, expect, it } from 'vitest'
import { ARTIFACT_HTML_CSP, ARTIFACT_HTML_PERMISSIONS, ARTIFACT_HTML_SANDBOX, artifactHtmlDocument } from '../artifact-html'
import { normalizeMediaUrl } from '../artifact-media'
import { requireStillImage } from '../character-media'
import { normalizeResearchMode, researchLabel } from '../conversation-research'
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TOTAL,
  attachmentPreview,
  attachmentSize,
  discardLocalAttachment,
  prepareAttachments,
  pruneLocalAttachments,
  validateAttachments,
  type ConversationAttachment,
} from '../conversation-attachments'
import { plainWords } from '../plain-words'
import { resolveRuntimeMode, runtimeMode } from '../runtime-mode'

describe('research mode', () => {
  it('defaults to off and accepts only the three modes', () => {
    expect(normalizeResearchMode(undefined)).toBe('off')
    expect(normalizeResearchMode('off')).toBe('off')
    expect(normalizeResearchMode('web')).toBe('web')
    expect(normalizeResearchMode('deep')).toBe('deep')
    expect(() => normalizeResearchMode('Web')).toThrow('Choose Off, Web, or Deep research.')
    expect(() => normalizeResearchMode(null)).toThrow('Choose Off, Web, or Deep research.')
  })
  it('labels each mode', () => {
    expect([researchLabel(), researchLabel('off'), researchLabel('web'), researchLabel('deep')]).toEqual(['Research off', 'Research off', 'Web', 'Deep research'])
  })
})

describe('runtime mode', () => {
  it('falls back to fixtures only in development, never in production', () => {
    expect(resolveRuntimeMode(undefined, true)).toBe('fixture')
    expect(resolveRuntimeMode('', false)).toBe('gateway')
  })
  it('takes an explicit choice and refuses anything else', () => {
    expect(resolveRuntimeMode('fixture', false)).toBe('fixture')
    expect(resolveRuntimeMode('gateway', true)).toBe('gateway')
    expect(resolveRuntimeMode('Gateway', true)).toBe('invalid')
    expect(resolveRuntimeMode(3, false)).toBe('invalid')
  })
  it('is resolved once for the build', () => {
    expect(['fixture', 'gateway', 'invalid']).toContain(runtimeMode)
  })
})

describe('plain words', () => {
  it('swaps Pi’s mechanism words for the owner’s words', () => {
    expect(plainWords('The Conker runtime is ready')).toBe('The Chat engine is ready')
    expect(plainWords('This needs a verified receipt.')).toBe('This is not proven yet.')
    expect(plainWords('Verified receipts and a verified receipt')).toBe('proof and a proof')
  })
  it('leaves other text alone', () => {
    expect(plainWords('conker runtime')).toBe('conker runtime')
    expect(plainWords('')).toBe('')
  })
})

describe('artifact media url', () => {
  it('accepts a plain https url and trims it', () => {
    expect(normalizeMediaUrl('  https://example.com/a.mp4?x=1 ')).toBe('https://example.com/a.mp4?x=1')
    expect(normalizeMediaUrl('   ')).toBe('')
  })
  it('refuses everything that is not a clean https url', () => {
    expect(() => normalizeMediaUrl('http://example.com/a.png')).toThrow('HTTPS media URL without embedded credentials')
    expect(() => normalizeMediaUrl('javascript:alert(1)')).toThrow('HTTPS media URL without embedded credentials')
    expect(() => normalizeMediaUrl('data:image/png;base64,AA==')).toThrow('HTTPS media URL without embedded credentials')
    expect(() => normalizeMediaUrl('https://user:pass@example.com/a')).toThrow('without embedded credentials')
    expect(() => normalizeMediaUrl('https://user@example.com/a')).toThrow('without embedded credentials')
    expect(() => normalizeMediaUrl('not a url')).toThrow('Use a complete HTTPS media URL.')
    expect(() => normalizeMediaUrl(`https://example.com/${'a'.repeat(2048)}`)).toThrow('up to 2,048 characters')
  })
})

describe('artifact html document', () => {
  const unescape = (html: string) => html.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&')

  it('puts the source only inside an escaped srcdoc attribute', () => {
    const source = '<script>alert("x")</script><b a="1">&</b>'
    const page = artifactHtmlDocument(source)
    expect(page).not.toContain(source)
    expect(page).not.toContain('<script>')
    const srcdoc = /srcdoc="([^"]*)"/.exec(page)?.[1] ?? ''
    expect(unescape(srcdoc)).toContain(`<body>${source}</body>`)
  })

  it('sandboxes the frame with scripts only and no powerful features', () => {
    const page = artifactHtmlDocument('hi')
    expect(page).toContain(`sandbox="${ARTIFACT_HTML_SANDBOX}"`)
    expect(ARTIFACT_HTML_SANDBOX).toBe('allow-scripts')
    expect(page).toContain('referrerpolicy="no-referrer"')
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) expect(ARTIFACT_HTML_PERMISSIONS).toContain(`${feature} 'none'`)
  })

  it('carries the same closed content policy in the wrapper and the inner document', () => {
    const page = artifactHtmlDocument('hi')
    const policy = unescape('<meta http-equiv="Content-Security-Policy" content="' + ARTIFACT_HTML_CSP.replaceAll('"', '&quot;') + '">')
    expect(unescape(page)).toContain(policy)
    expect(ARTIFACT_HTML_CSP).toContain("default-src 'none'")
    expect(ARTIFACT_HTML_CSP).toContain("connect-src 'none'")
    expect(ARTIFACT_HTML_CSP).toContain("frame-src 'none'")
    expect(ARTIFACT_HTML_CSP).toContain("form-action 'none'")
    expect(page.split('Content-Security-Policy').length - 1).toBe(2)
  })

  it('refuses a source over 200,000 characters and takes exactly that many', () => {
    expect(() => artifactHtmlDocument('x'.repeat(200_001))).toThrow('HTML source must fit within 200,000 characters.')
    expect(artifactHtmlDocument('x'.repeat(200_000))).toContain('<iframe')
  })
})

describe('still image check', () => {
  const ascii = (text: string) => [...text].map(char => char.charCodeAt(0))
  const u32 = (value: number, little = false) => (little ? [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255] : [(value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255])
  const pngChunk = (type: string, length: number) => [...u32(length), ...ascii(type), ...new Array<number>(length).fill(0), 0, 0, 0, 0]
  const png = (...types: string[]) => new Uint8Array([0x89, ...ascii('PNG\r\n\x1a\n'), ...pngChunk('IHDR', 13), ...types.flatMap(type => pngChunk(type, 8)), ...pngChunk('IEND', 0)])
  const riffChunk = (type: string, length: number) => [...ascii(type), ...u32(length, true), ...new Array<number>(length + (length % 2)).fill(0)]
  const webp = (...types: string[]) => new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...riffChunk('VP8 ', 10), ...types.flatMap(type => riffChunk(type, 6))])
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])

  it('accepts a still PNG, JPEG and WebP', () => {
    expect(() => requireStillImage(png('IDAT'), 'image/png')).not.toThrow()
    expect(() => requireStillImage(jpeg, 'image/jpeg')).not.toThrow()
    expect(() => requireStillImage(webp(), 'image/webp')).not.toThrow()
  })

  it('refuses an animated PNG and tells the owner to use a video loop', () => {
    expect(() => requireStillImage(png('acTL', 'IDAT'), 'image/png')).toThrow('Use a still PNG for portraits. Upload an MP4/WebM loop')
  })

  it('refuses an animated WebP by either marker', () => {
    expect(() => requireStillImage(webp('ANIM'), 'image/webp')).toThrow('Use a still WebP for portraits')
    expect(() => requireStillImage(webp('ANMF'), 'image/webp')).toThrow('Use a still WebP for portraits')
  })

  it('refuses contents that do not match the claimed format', () => {
    const mismatch = "This image's contents do not match its format. Choose a still PNG, JPEG, or WebP."
    expect(() => requireStillImage(jpeg, 'image/png')).toThrow(mismatch)
    expect(() => requireStillImage(png('IDAT'), 'image/jpeg')).toThrow(mismatch)
    expect(() => requireStillImage(webp(), 'image/png')).toThrow(mismatch)
    expect(() => requireStillImage(new Uint8Array(), 'image/png')).toThrow(mismatch)
    expect(() => requireStillImage(new Uint8Array([1, 2, 3]), 'image/gif')).toThrow(mismatch)
    expect(() => requireStillImage(png('IDAT'), 'image/webp')).toThrow(mismatch)
  })

  it('reads a view into a larger buffer from its own offset', () => {
    const bytes = png('IDAT')
    const padded = new Uint8Array(bytes.length + 5)
    padded.set(bytes, 5)
    expect(() => requireStillImage(padded.subarray(5), 'image/png')).not.toThrow()
  })
})

describe('attachments', () => {
  const item = (id: string, partial: Partial<ConversationAttachment> = {}): ConversationAttachment => ({ id, name: `${id}.txt`, size: 100, type: 'text/plain', lastModified: 1, ...partial })

  it('accepts valid metadata and keeps only the known fields', () => {
    const extra = { ...item('a'), bytes: 'secret', url: 'blob:x' } as ConversationAttachment
    expect(validateAttachments([extra])).toEqual([item('a')])
  })

  it('allows five files and refuses a sixth', () => {
    expect(validateAttachments(Array.from({ length: MAX_ATTACHMENTS }, (_, index) => item(`f${index}`)))).toHaveLength(5)
    expect(() => validateAttachments(Array.from({ length: 6 }, (_, index) => item(`f${index}`)))).toThrow('Attach up to 5 files per message.')
    expect(() => validateAttachments(null as unknown as ConversationAttachment[])).toThrow('Attach up to 5 files per message.')
  })

  it('refuses a file with an invalid name, id, type, size or date', () => {
    const message = 'Each attachment needs a valid name and must be 10 MB or smaller.'
    const bad = (partial: Partial<ConversationAttachment>) => expect(() => validateAttachments([item('a', partial)])).toThrow(message)
    bad({ id: '' })
    bad({ id: 'x'.repeat(101) })
    bad({ name: '   ' })
    bad({ name: 'x'.repeat(256) })
    bad({ type: 'x'.repeat(256) })
    bad({ size: -1 })
    bad({ size: 1.5 })
    bad({ size: MAX_ATTACHMENT_BYTES + 1 })
    bad({ lastModified: Number.NaN })
    bad({ lastModified: -1 })
    expect(() => validateAttachments([null as unknown as ConversationAttachment])).toThrow(message)
    expect(() => validateAttachments([item('a'), item('a')])).toThrow(message)
    expect(validateAttachments([item('a', { size: MAX_ATTACHMENT_BYTES })])).toHaveLength(1)
  })

  it('keeps the total at 25 MB', () => {
    const big = (id: string) => item(id, { size: MAX_ATTACHMENT_BYTES })
    expect(() => validateAttachments([big('a'), big('b'), big('c')])).toThrow('Keep the total attachment size at 25 MB or less.')
    expect(validateAttachments([big('a'), big('b'), item('c', { size: MAX_ATTACHMENT_TOTAL - 2 * MAX_ATTACHMENT_BYTES })])).toHaveLength(3)
  })

  it('writes sizes in bytes, KB and MB', () => {
    expect(attachmentSize(0)).toBe('0 B')
    expect(attachmentSize(1023)).toBe('1023 B')
    expect(attachmentSize(1025)).toBe('2 KB')
    expect(attachmentSize(1024 * 1024)).toBe('1.0 MB')
    expect(attachmentSize(5.5 * 1024 * 1024)).toBe('5.5 MB')
  })
})

describe('local attachment previews', () => {
  const created: string[] = []
  afterEach(() => {
    pruneLocalAttachments(new Set())
    created.length = 0
  })

  it('adds new files to the existing ones, with metadata only', () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain', lastModified: 42 })
    const next = prepareAttachments([file], [])
    expect(next).toEqual([{ id: expect.any(String), name: 'note.txt', size: 5, type: 'text/plain', lastModified: 42 }])
    const more = prepareAttachments([new File(['x'], 'b.txt')], next)
    expect(more.map(entry => entry.name)).toEqual(['note.txt', 'b.txt'])
  })

  it('keeps nothing when the batch is refused', () => {
    const files = Array.from({ length: 6 }, (_, index) => new File(['x'], `f${index}.txt`))
    expect(() => prepareAttachments(files, [])).toThrow('Attach up to 5 files per message.')
    expect(attachmentPreview({ id: 'unknown', name: 'a', size: 1, type: 'image/png', lastModified: 1 })).toBeUndefined()
  })

  it('previews only still image types, and only once per file', () => {
    const [text, image, svg] = prepareAttachments([new File(['t'], 'a.txt', { type: 'text/plain' }), new File(['i'], 'a.png', { type: 'image/png' }), new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })], [])
    expect(attachmentPreview(text)).toBeUndefined()
    expect(attachmentPreview(svg)).toBeUndefined()
    const url = attachmentPreview(image)
    expect(url).toMatch(/^blob:/)
    expect(attachmentPreview(image)).toBe(url)
  })

  it('drops a file’s preview when it is discarded or no longer referenced', () => {
    const [a, b] = prepareAttachments([new File(['i'], 'a.png', { type: 'image/png' }), new File(['i'], 'b.png', { type: 'image/png' })], [])
    attachmentPreview(a)
    attachmentPreview(b)
    discardLocalAttachment(a.id)
    expect(attachmentPreview(a)).toBeUndefined()
    expect(attachmentPreview(b)).toMatch(/^blob:/)
    pruneLocalAttachments(new Set([a.id]))
    expect(attachmentPreview(b)).toBeUndefined()
    expect(() => discardLocalAttachment('never-existed')).not.toThrow()
  })
})
