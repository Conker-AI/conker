import type { BrandId } from './brand-icons'

// Words that name a service, longest first so "google calendar" wins over "google". Whole words
// only: "x" is matched as "twitter" or "x.com", never the letter.
const serviceWords: [string, BrandId][] = ([
  ['google calendar', 'googlecalendar'], ['google drive', 'googledrive'], ['chatgpt', 'openai'], ['openai', 'openai'],
  ['claude', 'claude'], ['anthropic', 'anthropic'], ['gemini', 'gemini'], ['grok', 'xai'], ['xai', 'xai'],
  ['mistral', 'mistral'], ['deepseek', 'deepseek'], ['openrouter', 'openrouter'], ['ollama', 'ollama'],
  ['tiktok', 'tiktok'], ['github', 'github'], ['gmail', 'gmail'], ['telegram', 'telegram'], ['youtube', 'youtube'],
  ['google', 'google'], ['discord', 'discord'], ['notion', 'notion'], ['twitter', 'x'], ['x.com', 'x'],
  ['whatsapp', 'whatsapp'], ['spotify', 'spotify'], ['reddit', 'reddit'], ['instagram', 'instagram'], ['dropbox', 'dropbox'],
] as [string, BrandId][]).sort((a, b) => b[0].length - a[0].length)

/** The service a name or description talks about, if it names one Conker has a logo for. */
export function serviceIn(...texts: (string | null | undefined)[]): BrandId | null {
  const text = ` ${texts.filter(Boolean).join(' ').toLowerCase()} `
  for (const [word, id] of serviceWords) {
    if (new RegExp(`[^a-z0-9]${word.replace('.', '\\.')}[^a-z0-9]`).test(text)) return id
  }
  return null
}
