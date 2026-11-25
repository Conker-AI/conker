import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'
import { GatewayError } from './transport'

/** Pi keeps at most this many characters of shared text (pi/agents/shared_notes.py). */
export const SHARED_LIMIT = 2000
const noteId = z.string().regex(/^note_[0-9a-f]{32}$/)
const sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/)
const title = z.string().min(1).max(160)
// Pi types the status as a checked string (^(saved|already_saved)$); the same two values here.
const status = z
  .string()
  .regex(/^(saved|already_saved)$/)
  .transform(value => value as 'saved' | 'already_saved')
const saved = z.object({ noteId, sessionId, title, status }).strict()
const note = z.object({ id: noteId, sessionId, title, createdAt: z.number().finite().nonnegative() }).strict()
const page = z.object({ results: z.array(note).max(100) }).strict()

export type SharedSaved = z.infer<typeof saved>
export type SharedNote = z.infer<typeof note>

/**
 * Text shared from another app (Pi's /inbox/shared): each is saved in a chat of its own, marked as
 * someone else's words, with an Inbox note that opens it. Nothing goes to memory and no model runs.
 */
export function createSharedNotesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const pi = createPiClient(auth)
  return {
    /** Retrying with the same request id returns the same chat; it is never saved twice. */
    async save(requestId: string, text: string, signal?: AbortSignal): Promise<SharedSaved> {
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId) || !text.trim() || text.length > SHARED_LIMIT) throw new GatewayError('validation')
      return piData(pi.POST('/inbox/shared', { body: { request_id: requestId, text }, signal }), saved)
    },
    list: async (signal?: AbortSignal): Promise<SharedNote[]> => (await piData(pi.GET('/inbox/shared', { signal }), page)).results,
    /** Hides the note; the chat keeps the text until the owner forgets the chat. */
    async dismiss(id: string, signal?: AbortSignal): Promise<void> {
      if (!noteId.safeParse(id).success) throw new GatewayError('validation')
      await piData(pi.POST('/inbox/shared/{identity}/dismiss', { params: { path: { identity: id } }, signal }), z.object({ id: z.literal(id), dismissed: z.literal(true), changed: z.boolean() }).strict())
    },
  }
}

export type SharedNotesClient = ReturnType<typeof createSharedNotesClient>
