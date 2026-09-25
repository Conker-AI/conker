import { useState } from 'react'
import { Copy, Link, MoreHorizontal } from 'lucide-react'
import { CompanionPortrait } from '@/components/companion-portrait'
import { MessageActionButton } from '@/components/message-action-button'
import { RichAnswer } from '@/components/rich-answer'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Action, ChatContract, ChatMessage, MessageAction } from '@/lib/chat/contract'
import { cn } from '@/lib/utils'

const labels: Record<MessageAction, string> = { copy: 'Copy message', link: 'Copy message link', edit: 'Edit', retry: 'Retry', fork: 'Fork', pin: 'Pin', rateUp: 'Good response', rateDown: 'Poor response', redact: 'Redact', saveArtifact: 'Save artifact' }

export function ChatMessageRecord({ message }: { message: ChatMessage }) {
  const [notice, setNotice] = useState('')
  const moreActions = (Object.keys(labels) as MessageAction[]).filter(kind => kind !== 'copy' && kind !== 'link' && message.actions[kind].availability !== 'unsupported')
  const createdAt = new Date(message.createdAt)
  const isToday = createdAt.toDateString() === new Date().toDateString()
  const shortTime = createdAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  async function invoke(action: Action, kind: MessageAction) {
    if (action.availability !== 'enabled') return
    try { await action.run(); setNotice(kind === 'copy' ? 'Message copied.' : kind === 'link' ? 'Local message link copied. Sign-in is required to open it.' : '') }
    catch { setNotice('Clipboard unavailable. Select the message text to copy it.') }
  }
  const body = message.content.kind === 'unavailable'
    ? <p className="text-sm italic text-muted-foreground">{message.content.reason === 'forgotten' ? 'This message was forgotten. Its content is unavailable.' : 'This record cannot be displayed as text.'}</p>
    : message.role === 'assistant' ? <RichAnswer text={message.content.text} /> : <p dir="auto" className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{message.content.text}</p>
  if (message.role === 'system' || message.role === 'tool') return <details className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer rounded-sm text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring">{message.role === 'tool' ? 'Tool' : 'System'} record · {message.sequence}</summary><div className="mt-3 min-w-0">{body}</div></details>
  return <article aria-label={`${message.role} message ${message.sequence}`} className={cn('min-w-0', message.role === 'user' ? 'ml-auto flex max-w-[92%] flex-col items-end sm:max-w-[85%]' : 'w-full')}>
    {message.role === 'assistant' && <div className="mb-2 flex items-center gap-2"><CompanionPortrait portrait="/conker.png" name="Conker" tone="graphite" className="size-6 rounded-md" /><span className="text-sm font-medium">Conker</span></div>}
    <div className={cn('min-w-0 max-w-full', message.role === 'user' && 'rounded-xl border bg-card px-4 py-3')}>{body}</div>
    <div role="group" aria-label="Message actions" className="mt-2 flex max-w-full flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {(['copy', 'link'] as const).filter(kind => message.actions[kind].availability !== 'unsupported').map(kind => <MessageActionButton key={kind} label={message.actions[kind].availability === 'disabled' ? `${labels[kind]}: ${message.actions[kind].reason}` : labels[kind]} disabled={message.actions[kind].availability !== 'enabled'} onClick={() => void invoke(message.actions[kind], kind)}>{kind === 'copy' ? <Copy /> : <Link />}</MessageActionButton>)}
      {moreActions.length > 0 && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More message actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuGroup>{moreActions.map(kind => {
          const action = message.actions[kind]
          return <DropdownMenuItem key={kind} disabled={action.availability !== 'enabled'} title={action.availability === 'disabled' ? action.reason : undefined} onSelect={() => void invoke(action, kind)}>
            <span className="flex min-w-0 flex-col gap-1">
              <span>{labels[kind]}</span>
              {action.availability === 'disabled' && <span className="max-w-60 whitespace-normal text-xs text-muted-foreground">{action.reason}</span>}
            </span>
          </DropdownMenuItem>
        })}</DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>}
      <time className="text-muted-foreground" dateTime={message.createdAt} title={createdAt.toLocaleString()}>{isToday ? shortTime : `${createdAt.toLocaleDateString()} ${shortTime}`}</time>
      <span role="status" className="basis-full">{notice}</span>
    </div>
  </article>
}

/** The wrapper owns scroll regions and gateway-only evidence and recovery panels. */
export function ChatTranscript({ chat }: { chat: ChatContract }) {
  return <div className="flex min-w-0 flex-col gap-5" data-source={chat.source}>
    {chat.notice && <p role="status" className="text-sm text-muted-foreground">{chat.notice}</p>}
    {chat.error && <p role="alert" className="text-sm text-destructive">{chat.error}</p>}
    {chat.history === 'loading' && <p role="status" className="text-sm text-muted-foreground">Loading saved history…</p>}
    {chat.messages.map(message => <div id={`record-${message.id}`} key={`${message.id}:${message.content.kind}`} className={cn('min-w-0 scroll-mt-4', chat.focusedMessageId === message.id && 'rounded-lg border border-primary/30 bg-muted p-3')}><ChatMessageRecord message={message} /></div>)}
    {chat.generation && <article aria-label="Conker is writing" aria-busy={chat.generation.phase !== 'ended'} className="min-w-0" data-reset-version={chat.generation.resetVersion}><p role="status" className="mb-2 text-sm text-muted-foreground">{chat.generation.phase === 'stopping' ? 'Stopping…' : chat.generation.phase === 'ended' ? 'Preview ended. Waiting for saved history…' : 'Conker is writing…'}</p>{chat.generation.previewText && <RichAnswer text={chat.generation.previewText} />}</article>}
    {chat.history === 'ready' && !chat.messages.length && <p className="text-sm text-muted-foreground">No saved messages in this conversation.</p>}
  </div>
}
