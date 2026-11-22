// Pi still names a few things in mechanism words. The screens show the owner's words instead, until Pi's text changes.
const replacements: [RegExp, string][] = [
  [/\bConker runtime\b/g, 'Chat engine'],
  [/\bneeds a verified receipt\b/gi, 'is not proven yet'],
  [/\bverified receipts?\b/gi, 'proof'],
]

export function plainWords(text: string): string {
  return replacements.reduce((value, [pattern, plain]) => value.replace(pattern, plain), text)
}
