export const MESSAGE_LIMIT = 4000

export type DraftAnchor = { text: string; start: number; end: number }

/** Inserts at the captured cursor. If the draft changed meanwhile, append without overwriting it. */
export function insertTranscript(current: string, transcript: string, anchor: DraftAnchor) {
  const words = transcript.trim()
  if (!words) return { text: current, caret: current.length }
  const unchanged = current === anchor.text
  const start = unchanged ? Math.max(0, Math.min(current.length, anchor.start)) : current.length
  const end = unchanged ? Math.max(start, Math.min(current.length, anchor.end)) : current.length
  const before = current.slice(0, start)
  const after = current.slice(end)
  const prefix = before && !/\s$/.test(before) ? " " : ""
  const suffix = after && !/^[\s.,!?;:،。！？]/u.test(after) ? " " : ""
  const insertion = prefix + words + suffix
  return { text: before + insertion + after, caret: before.length + insertion.length }
}
