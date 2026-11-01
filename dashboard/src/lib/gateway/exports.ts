import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import type { GatewayArtifactContent } from './artifacts'
import { GatewayRefusal, type GatewayDownload, type GatewayFileFormat, type GatewayRefusalCode } from './file-transfer'
import { GatewayError, gatewayError } from './transport'

/** A completed answer exports as a document, deck or spreadsheet; an artifact can also be CSV or JSON. */
export type AnswerExportFormat = Extract<GatewayFileFormat, 'docx' | 'pdf' | 'pptx' | 'xlsx'>
export const exportLabels: Record<GatewayFileFormat, string> = {
  docx: 'Word (.docx)', pdf: 'PDF (.pdf)', pptx: 'PowerPoint (.pptx)', xlsx: 'Excel (.xlsx)', csv: 'CSV (.csv)', json: 'JSON (.json)',
}
/** Short names for "Making the PDF…" lines. */
export const exportNames: Record<GatewayFileFormat, string> = { docx: 'Word file', pdf: 'PDF', pptx: 'slides', xlsx: 'spreadsheet', csv: 'CSV file', json: 'JSON file' }

/** Excel only when there is a table to put in it (Pi refuses a spreadsheet without one). */
export function answerFormats(hasTable: boolean): AnswerExportFormat[] {
  return hasTable ? ['docx', 'pdf', 'pptx', 'xlsx'] : ['docx', 'pdf', 'pptx']
}
/** What Pi makes from each artifact kind, plus the CSV or JSON it already had. */
export function artifactFormats(content: GatewayArtifactContent, hasTable: boolean): GatewayFileFormat[] {
  if (content.kind === 'table') return ['docx', 'pdf', 'pptx', 'xlsx', 'csv']
  if (content.kind === 'markdown') return answerFormats(hasTable)
  if (content.kind === 'code') return ['docx', 'pdf', 'pptx']
  if (content.kind === 'chart' || content.kind === 'diagram' || content.kind === 'media') return ['json']
  return []
}

// Pi's refusals in plain words (pi/content/office_exports.py REASONS and the answer checks).
const refusals: Partial<Record<GatewayRefusalCode, string>> = {
  export_too_long: 'This is too long to export: the limit is 400,000 characters.',
  export_too_deep: 'Lists or quotes sit more than 12 levels inside each other. Flatten them, then export.',
  export_too_many_blocks: 'This has more than 10,000 paragraphs, headings and other parts, too many to export.',
  export_table_too_big: 'A table is too big to export: at most 64 columns, 2,000 rows, 40,000 cells and 32,000 characters in a cell.',
  export_page_cells: 'Tables over 10,000 cells export only as Excel (.xlsx).',
  export_no_table: 'There is no table here to put in a spreadsheet. Choose Word or PDF.',
  export_pages: 'The PDF would be longer than 500 pages. Try Word (.docx).',
  export_slides: 'The slides would run past 300 slides. Try Word (.docx) or PDF.',
  export_too_big: 'The file would be larger than 16 MB, too big to download.',
  too_large: 'The file would be larger than 16 MB, too big to download.',
  export_layout: 'A table or block is too large for a PDF page. Export it as Word or Excel instead.',
  export_control: 'The text holds hidden control characters that a document can’t store.',
  export_invalid: 'Conker couldn’t make that file from this content.',
  export_busy: 'Two exports are already running. Try again in a moment.',
  export_unavailable: 'The export took too long or couldn’t start. Try again, or export a shorter part.',
  unsupported_format: 'This can’t be exported in that format.',
  source_unavailable: 'Its source chat is unavailable or private, so it can’t be exported.',
  not_found: 'It’s no longer on your server. Reload, then try again.',
  not_an_answer: 'Only Conker’s finished answers can be exported.',
  privacy_unknown: 'This chat’s privacy couldn’t be checked. Try again.',
  source_changed: 'This answer’s sources can’t be read, so it wasn’t exported.',
  invalid_version: 'That version no longer exists. Reload the artifact.',
}
export function exportRefusalMessage(error: unknown): string {
  return error instanceof GatewayRefusal && refusals[error.refusal] || gatewayError(error).message
}

/** Hand the downloaded bytes to the browser as a file; nothing is opened or shown. */
export function saveDownload(file: GatewayDownload) {
  const url = URL.createObjectURL(file.blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = file.filename; anchor.rel = 'noopener'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const artifactId = z.string().regex(/^artifact_[0-9a-f]{32}$/), sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/), messageId = z.string().regex(/^msg_[0-9a-f]{16}$/)
function check<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new GatewayError('validation'); return result.data }

export function createGatewayExportsClient(auth: Pick<GatewayAuthClient, 'download'>) {
  return {
    /** The artifact's current version; an earlier one exports through its saved source (artifacts.export). */
    artifact(id: string, format: GatewayFileFormat, signal?: AbortSignal): Promise<GatewayDownload> {
      return auth.download(`/api/control/pi/artifacts/${check(artifactId, id)}/download`, { format }, signal)
    },
    answer(session: string, message: string, format: AnswerExportFormat, signal?: AbortSignal): Promise<GatewayDownload> {
      return auth.download(`/api/control/pi/sessions/${check(sessionId, session)}/messages/${check(messageId, message)}/download`, { format }, signal)
    },
  }
}
