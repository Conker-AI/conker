import { Bot, Clock3, Folder, GitBranch, KeyRound, MessagesSquare, Plug, Server, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brandIcons, type BrandId } from './brand-icons'

/** What kind of thing a mark stands for when no service logo fits. */
export type IdentityKind = 'tool' | 'workflow' | 'job' | 'agent' | 'mcp' | 'project' | 'chat' | 'provider' | 'server'

const kindIcons: Record<IdentityKind, LucideIcon> = {
  tool: Wrench, workflow: GitBranch, job: Clock3, agent: Bot, mcp: Plug, project: Folder, chat: MessagesSquare, provider: KeyRound, server: Server,
}

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

const sizes = { sm: 'size-6 rounded-md [&_svg]:size-3.5', md: 'size-8 rounded-lg [&_svg]:size-4', lg: 'size-10 rounded-xl [&_svg]:size-5' }

/**
 * One mark for every item in every list: the logo of the service it acts on, else its type icon,
 * else its first letter. Same tile, same size, so items can be told apart from across the room.
 * The logo takes the text color, so the shell keeps one accent. Decorative: the item's name is
 * always written next to it, so screen readers skip it.
 */
export function IdentityMark({ brand, kind, name, size = 'md', className }: { brand?: BrandId | null; kind?: IdentityKind; name?: string; size?: keyof typeof sizes; className?: string }) {
  const logo = brand ? brandIcons[brand] : null
  const Icon = kind ? kindIcons[kind] : null
  const letter = name?.trim().match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase()
  return <span aria-hidden="true" data-slot="identity-mark" data-brand={brand ?? undefined} className={cn('inline-flex shrink-0 items-center justify-center border bg-muted text-foreground', sizes[size], className)}>
    {logo ? <svg viewBox="0 0 24 24" fill="currentColor"><path d={logo.path} fillRule={logo.evenOdd ? 'evenodd' : undefined} /></svg>
      : Icon ? <Icon />
        : <span className="text-xs font-semibold leading-none">{letter ?? '?'}</span>}
  </span>
}
