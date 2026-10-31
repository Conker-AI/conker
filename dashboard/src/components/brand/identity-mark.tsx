import { Bot, Clock3, Folder, GitBranch, KeyRound, MessagesSquare, Plug, Server, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brandIcons, type BrandId } from './brand-icons'

/** What kind of thing a mark stands for when no service logo fits. */
export type IdentityKind = 'tool' | 'workflow' | 'job' | 'agent' | 'mcp' | 'project' | 'chat' | 'provider' | 'server'

const kindIcons: Record<IdentityKind, LucideIcon> = {
  tool: Wrench, workflow: GitBranch, job: Clock3, agent: Bot, mcp: Plug, project: Folder, chat: MessagesSquare, provider: KeyRound, server: Server,
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
