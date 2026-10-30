import { safeAnswerUrl } from "@/lib/rich-answer"

/** A link a button may open: it passes the Markdown link check and is a web or mail address. */
export function checkedLink(url: unknown): string | undefined {
  const safe = typeof url === "string" ? safeAnswerUrl(url) : undefined
  return safe && /^(https?:\/\/|mailto:)/i.test(safe) ? safe : undefined
}
