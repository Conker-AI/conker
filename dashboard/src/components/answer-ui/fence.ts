/** Where interactive parts of an answer begin. Kept free of OpenUI so plain answers never load it. */

/** Fenced code languages that hold OpenUI Lang. `openui-lang` is what OpenUI's own docs write. */
const LANGUAGES = new Set(["openui", "openui-lang"])
/** A block longer than this is not drawn: it is either a mistake or more than one answer should hold. */
export const MAX_BLOCK_CHARACTERS = 16_000
/** At most this many components in one block. */
export const MAX_BLOCK_NODES = 300
/** Maximum nesting depth for a block to prevent stack overflow. */
export const MAX_BLOCK_DEPTH = 64

export function isAnswerUiLanguage(language: string): boolean {
  return LANGUAGES.has(language.toLowerCase())
}

/** Whether a fenced block's own source ends with a closing fence; an open one is still arriving or was cut off. */
export function fenceClosed(source: string): boolean {
  const lines = source.replace(/\s+$/, "").split(/\r?\n/)
  const opening = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0] ?? "")
  if (!opening || lines.length < 2) return false
  const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines.at(-1) ?? "")
  return !!closing && closing[1][0] === opening[1][0] && closing[1].length >= opening[1].length
}
