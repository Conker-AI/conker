import { afterEach, describe, expect, it, vi } from 'vitest'
import { citationId, codeFilename, csvFromRows, downloadAnswerFile, readableAnswer, safeAnswerUrl, tableRowsFromMarkdown } from '../rich-answer'

describe('safe answer urls', () => {
  it('lets through https, http, mailto, anchors and site paths', () => {
    expect(safeAnswerUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeAnswerUrl('http://example.com')).toBe('http://example.com')
    expect(safeAnswerUrl('mailto:me@example.com')).toBe('mailto:me@example.com')
    expect(safeAnswerUrl('#section')).toBe('#section')
    expect(safeAnswerUrl('/chat/abc')).toBe('/chat/abc')
  })

  it('refuses protocols that run code or load data', () => {
    expect(safeAnswerUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeAnswerUrl('JaVaScRiPt:alert(1)')).toBeUndefined()
    expect(safeAnswerUrl('data:text/html,<script>1</script>')).toBeUndefined()
    expect(safeAnswerUrl('vbscript:x')).toBeUndefined()
    expect(safeAnswerUrl('file:///etc/passwd')).toBeUndefined()
  })

  it('refuses credentials, protocol-relative and backslash tricks, and control characters', () => {
    expect(safeAnswerUrl('https://user:pw@example.com')).toBeUndefined()
    expect(safeAnswerUrl('https://user@example.com')).toBeUndefined()
    expect(safeAnswerUrl('//evil.example/x')).toBeUndefined()
    expect(safeAnswerUrl('/\\evil.example')).toBeUndefined()
    expect(safeAnswerUrl('java\nscript:alert(1)')).toBeUndefined()
    expect(safeAnswerUrl('https://example.com/a b')).toBeUndefined()
    expect(safeAnswerUrl('https://example.com/\u007f')).toBeUndefined()
    expect(safeAnswerUrl('relative/path')).toBeUndefined()
    expect(safeAnswerUrl('')).toBeUndefined()
    expect(safeAnswerUrl(undefined)).toBeUndefined()
  })
})

describe('citation ids', () => {
  it('reads the id after citation:, decoded', () => {
    expect(citationId('citation:abc')).toBe('abc')
    expect(citationId('citation:a%20b')).toBe('a b')
  })
  it('gives nothing for other links, empty ids or bad escapes', () => {
    expect(citationId('https://example.com')).toBeUndefined()
    expect(citationId('citation:')).toBeUndefined()
    expect(citationId('citation:%E0%A4%A')).toBeUndefined()
    expect(citationId(undefined)).toBeUndefined()
  })
})

describe('csv export', () => {
  it('quotes every cell, doubles quotes and joins rows with CRLF', () => {
    expect(
      csvFromRows([
        ['a', 'b "c"'],
        ['d', ''],
      ]),
    ).toBe('"a","b ""c"""\r\n"d",""')
    expect(csvFromRows([])).toBe('')
  })

  it('neutralises cells a spreadsheet would run as a formula, even behind spaces', () => {
    const cells = ['=SUM(A1)', '+1', '@x', '-1+1', '  =HYPERLINK("x")', '\t=1', '\n=1', '\r=1']
    for (const cell of cells) expect(csvFromRows([[cell]])).toBe(`"'${cell.replaceAll('"', '""')}"`)
  })

  it('leaves ordinary text and numbers as they are', () => {
    expect(csvFromRows([['plain', '12', 'a=b', '']])).toBe('"plain","12","a=b",""')
  })
})

describe('markdown tables', () => {
  const markdown = ['Intro', '', '| Name | Note |', '| --- | --- |', '| **Ann** | a `code` b |', '| ![pic](x.png) | line<br>two |', '| <b>x</b> | y |', '', 'Second:', '', '| K |', '| - |', '| v |'].join('\n')

  it('reads the visible text of each cell (inline html tags add no text)', () => {
    expect(tableRowsFromMarkdown(markdown)).toEqual([
      ['Name', 'Note'],
      ['Ann', 'a code b'],
      ['pic', 'linetwo'],
      ['x', 'y'],
    ])
  })

  it('reads the table at a given offset', () => {
    const offset = markdown.indexOf('| K |')
    expect(tableRowsFromMarkdown(markdown, offset)).toEqual([['K'], ['v']])
    expect(tableRowsFromMarkdown(markdown, 3)).toEqual([])
  })

  it('has nothing for text without a table', () => {
    expect(tableRowsFromMarkdown('Just words')).toEqual([])
  })

  it('keeps math as its source text rather than rendered trees', () => {
    expect(tableRowsFromMarkdown('| A |\n| - |\n| $x^2$ |')).toEqual([['A'], ['x^2']])
  })
})

describe('readable answer', () => {
  it('drops markup, links keep their text and images are announced', () => {
    const text = readableAnswer('# Title\n\nSome **bold** and [a link](https://example.com).\n\n![A cat](cat.png)\n\n- one\n- two')
    expect(text).toBe('Title\n\nSome bold and a link.\n\nImage: A cat\n\none\n\ntwo')
  })

  it('leaves out citation links, raw html, definitions and interactive blocks', () => {
    const text = readableAnswer('Fact [1](citation:abc) here.\n\n<div>hidden</div>\n\n[ref]: https://example.com\n\n```openui\nStack()\n```\n\n```python\nprint(1)\n```')
    expect(text).toContain('Fact  here.')
    expect(text).not.toContain('hidden')
    expect(text).not.toContain('example.com')
    expect(text).not.toContain('Stack()')
    expect(text).toContain('print(1)')
  })

  it('reads table cells and rows on their own lines and collapses blank runs', () => {
    expect(readableAnswer('| A | B |\n| - | - |\n| 1 | 2 |')).toBe('A\nB\n\n1\n2')
    expect(readableAnswer('a\n\n\n\n\nb')).toBe('a\n\nb')
    expect(readableAnswer('   ')).toBe('')
  })
})

describe('code filenames', () => {
  it('picks an extension by language, ignoring case, and falls back to txt', () => {
    expect(codeFilename('TypeScript')).toBe('code.ts')
    expect(codeFilename('python')).toBe('code.py')
    expect(codeFilename('shell')).toBe('code.sh')
    expect(codeFilename('markdown')).toBe('code.md')
    expect(codeFilename('klingon')).toBe('code.txt')
    expect(codeFilename('')).toBe('code.txt')
  })
})

describe('downloading an answer', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('downloads the text as an inert file and releases the url afterwards', () => {
    vi.useFakeTimers()
    const anchor = { href: '', download: '', click: vi.fn() }
    const create = vi.fn(() => anchor)
    const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('document', { createElement: create })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    downloadAnswerFile('<script>x</script>', 'a.html')
    expect(create).toHaveBeenCalledWith('a')
    expect(anchor).toMatchObject({ href: 'blob:text/plain;charset=utf-8', download: 'a.html' })
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:text/plain;charset=utf-8')
    downloadAnswerFile('{}', 'a.json', 'application/json')
    expect(anchor.href).toBe('blob:application/json')
  })
})
