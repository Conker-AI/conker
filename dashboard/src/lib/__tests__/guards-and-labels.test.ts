import { afterEach, describe, expect, it, vi } from 'vitest'
import { ARTIFACT_HTML_CSP, ARTIFACT_HTML_SANDBOX, artifactHtmlDocument } from '../artifact-html'
import { normalizeMediaUrl } from '../artifact-media'
import { normalizeResearchMode, researchLabel } from '../conversation-research'
import { plainWords } from '../plain-words'
import { resolveRuntimeMode } from '../runtime-mode'
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

describe('plain words', () => {
  it('swaps mechanism words for the owner words', () => {
    expect(plainWords('The Conker runtime is busy')).toBe('The Chat engine is busy')
    expect(plainWords('It needs a verified receipt')).toBe('It is not proven yet')
    expect(plainWords('Verified receipts and a verified receipt')).toBe('proof and a proof')
  })
  it('leaves other text alone', () => {
    expect(plainWords('Nothing to change')).toBe('Nothing to change')
  })
})

describe('artifact media URLs', () => {
  it('returns an empty string for blank input', () => {
    expect(normalizeMediaUrl('   ')).toBe('')
  })
  it('accepts a plain https URL and trims it', () => {
    expect(normalizeMediaUrl(' https://example.com/a.png ')).toBe('https://example.com/a.png')
  })
  it('refuses a URL over 2,048 characters', () => {
    expect(() => normalizeMediaUrl(`https://example.com/${'a'.repeat(2048)}`)).toThrow('Use a media URL up to 2,048 characters.')
  })
  it('refuses text that is not a URL', () => {
    expect(() => normalizeMediaUrl('not a url')).toThrow('Use a complete HTTPS media URL.')
  })
  it('refuses http, data and embedded credentials', () => {
    const refusal = 'Use an HTTPS media URL without embedded credentials.'
    expect(() => normalizeMediaUrl('http://example.com/a.png')).toThrow(refusal)
    expect(() => normalizeMediaUrl('data:image/png;base64,AAAA')).toThrow(refusal)
    expect(() => normalizeMediaUrl('https://user@example.com/a.png')).toThrow(refusal)
    expect(() => normalizeMediaUrl('https://user:pass@example.com/a.png')).toThrow(refusal)
  })
})

describe('artifact HTML document', () => {
  it('wraps the source in a sandboxed frame under a closed policy', () => {
    const html = artifactHtmlDocument('<p>hi</p>')
    expect(html).toContain(`sandbox="${ARTIFACT_HTML_SANDBOX}"`)
    expect(html).toContain('referrerpolicy="no-referrer"')
    expect(ARTIFACT_HTML_CSP).toContain("default-src 'none'")
    expect(ARTIFACT_HTML_CSP).toContain("connect-src 'none'")
  })
  it('escapes the source into the srcdoc attribute instead of putting it in host markup', () => {
    const html = artifactHtmlDocument('<script>alert("x")</script>')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
  })
  it('escapes ampersands before the other characters', () => {
    expect(artifactHtmlDocument('a & b')).toContain('a &amp; b')
  })
  it('refuses source over 200,000 characters and accepts exactly 200,000', () => {
    expect(() => artifactHtmlDocument('x'.repeat(200_001))).toThrow('HTML source must fit within 200,000 characters.')
    expect(artifactHtmlDocument('x'.repeat(200_000))).toContain('srcdoc=')
  })
})

describe('research mode', () => {
  it('treats a missing value as off and keeps the two modes', () => {
    expect(normalizeResearchMode(undefined)).toBe('off')
    expect(normalizeResearchMode('off')).toBe('off')
    expect(normalizeResearchMode('web')).toBe('web')
    expect(normalizeResearchMode('deep')).toBe('deep')
  })
  it('refuses anything else', () => {
    for (const value of ['Web', 'on', '', null, 3]) expect(() => normalizeResearchMode(value)).toThrow('Choose Off, Web, or Deep research.')
  })
  it('labels each mode, defaulting to off', () => {
    expect(researchLabel('deep')).toBe('Deep research')
    expect(researchLabel('web')).toBe('Web')
    expect(researchLabel('off')).toBe('Research off')
    expect(researchLabel()).toBe('Research off')
  })
})

describe('runtime mode', () => {
  it('defaults to fixtures in development and live data in production', () => {
    expect(resolveRuntimeMode(undefined, true)).toBe('fixture')
    expect(resolveRuntimeMode('', true)).toBe('fixture')
    expect(resolveRuntimeMode(undefined, false)).toBe('gateway')
    expect(resolveRuntimeMode('', false)).toBe('gateway')
  })
  it('honours an explicit choice and flags anything else as invalid', () => {
    expect(resolveRuntimeMode('fixture', false)).toBe('fixture')
    expect(resolveRuntimeMode('gateway', true)).toBe('gateway')
    expect(resolveRuntimeMode('mock', true)).toBe('invalid')
    expect(resolveRuntimeMode(1, false)).toBe('invalid')
  })
})

const attachment = (over: Partial<ConversationAttachment> = {}): ConversationAttachment => ({ id: 'a1', name: 'notes.txt', size: 10, type: 'text/plain', lastModified: 1, ...over })

describe('attachment validation', () => {
  const invalid = 'Each attachment needs a valid name and must be 10 MB or smaller.'
  it('returns clean copies of valid metadata', () => {
    const input = [{ ...attachment(), extra: 'dropped' } as ConversationAttachment]
    expect(validateAttachments(input)).toEqual([attachment()])
  })
  it('refuses more than five files', () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => attachment({ id: `a${i}` }))
    expect(() => validateAttachments(many)).toThrow('Attach up to 5 files per message.')
    expect(() => validateAttachments('x' as unknown as ConversationAttachment[])).toThrow('Attach up to 5 files per message.')
  })
  it('refuses a duplicate id, a blank name and bad numbers', () => {
    expect(() => validateAttachments([attachment(), attachment()])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ name: '   ' })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ id: '' })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ id: 'x'.repeat(101) })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ name: 'n'.repeat(256) })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ type: 't'.repeat(256) })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ size: -1 })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ size: 1.5 })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ lastModified: -1 })])).toThrow(invalid)
    expect(() => validateAttachments([attachment({ lastModified: Number.NaN })])).toThrow(invalid)
    expect(() => validateAttachments([null as unknown as ConversationAttachment])).toThrow(invalid)
  })
  it('allows exactly 10 MB per file and refuses one byte more', () => {
    expect(validateAttachments([attachment({ size: MAX_ATTACHMENT_BYTES })])).toHaveLength(1)
    expect(() => validateAttachments([attachment({ size: MAX_ATTACHMENT_BYTES + 1 })])).toThrow(invalid)
  })
  it('refuses a total over 25 MB', () => {
    const files = [0, 1, 2].map(i => attachment({ id: `a${i}`, size: MAX_ATTACHMENT_BYTES }))
    expect(() => validateAttachments(files)).toThrow('Keep the total attachment size at 25 MB or less.')
    expect(MAX_ATTACHMENT_TOTAL).toBe(25 * 1024 * 1024)
    expect(validateAttachments([files[0], files[1], { ...files[2], size: 5 * 1024 * 1024 }])).toHaveLength(3)
  })
})

describe('attachment size labels', () => {
  it('uses bytes, rounded-up kilobytes, then megabytes with one decimal', () => {
    expect(attachmentSize(0)).toBe('0 B')
    expect(attachmentSize(1023)).toBe('1023 B')
    expect(attachmentSize(1024)).toBe('1 KB')
    expect(attachmentSize(1025)).toBe('2 KB')
    expect(attachmentSize(1024 * 1024)).toBe('1.0 MB')
    expect(attachmentSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})

describe('local attachment previews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    pruneLocalAttachments(new Set())
  })

  it('keeps files for this tab, previews only safe image types, and revokes on discard', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const image = new File(['x'], 'a.png', { type: 'image/png', lastModified: 5 })
    const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml', lastModified: 6 })
    const prepared = prepareAttachments([image, svg], [])
    expect(prepared.map(item => item.name)).toEqual(['a.png', 'a.svg'])
    expect(prepared[0]).toMatchObject({ size: 1, type: 'image/png', lastModified: 5 })

    expect(attachmentPreview(prepared[0])).toBe('blob:preview')
    expect(attachmentPreview(prepared[0])).toBe('blob:preview')
    expect(create).toHaveBeenCalledTimes(1)
    expect(attachmentPreview(prepared[1])).toBeUndefined()
    expect(attachmentPreview(attachment({ id: 'never-prepared' }))).toBeUndefined()

    discardLocalAttachment(prepared[0].id)
    expect(revoke).toHaveBeenCalledWith('blob:preview')
    expect(attachmentPreview(prepared[0])).toBeUndefined()
    discardLocalAttachment('never-prepared')
  })

  it('prunes files no message references any more', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:keep')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const [keep, drop] = prepareAttachments([new File(['1'], 'k.png', { type: 'image/png' }), new File(['2'], 'd.png', { type: 'image/png' })], [])
    attachmentPreview(drop)
    pruneLocalAttachments(new Set([keep.id]))
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(attachmentPreview(drop)).toBeUndefined()
    expect(attachmentPreview(keep)).toBe('blob:keep')
  })

  it('refuses a sixth file and leaves nothing behind', () => {
    const existing = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => attachment({ id: `e${i}` }))
    expect(() => prepareAttachments([new File(['x'], 'six.png', { type: 'image/png' })], existing)).toThrow('Attach up to 5 files per message.')
  })
})
