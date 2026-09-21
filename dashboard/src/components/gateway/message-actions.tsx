import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Link as LinkIcon } from 'lucide-react'
import { MessageActionButton } from '@/components/message-action-button'
import type { RuntimeMessage } from '@/lib/gateway/runtime'

export function GatewayMessageActions({ message }: { message: RuntimeMessage }) {
  const [copied, setCopied] = useState<'text' | 'link' | null>(null)
  const [notice, setNotice] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const available = message.content.kind === 'text'
  async function copy(kind: 'text' | 'link') {
    if (message.content.kind !== 'text') return
    const url = new URL('/chat', window.location.origin)
    url.searchParams.set('session', message.sessionId)
    url.searchParams.set('message', message.id)
    try {
      await navigator.clipboard.writeText(kind === 'text' ? message.content.text : url.href)
      setCopied(kind)
      setNotice(kind === 'text' ? 'Message copied.' : 'Local message link copied. Sign-in is required to open it.')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => { setCopied(null); setNotice('') }, 2500)
    } catch { setNotice('Clipboard unavailable. Select the message text to copy it.') }
  }
  return <div role="group" aria-label="Message actions" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
    <MessageActionButton label={copied === 'text' ? 'Copied' : 'Copy message'} disabled={!available} onClick={() => void copy('text')}>{copied === 'text' ? <Check /> : <Copy />}</MessageActionButton>
    <MessageActionButton label={copied === 'link' ? 'Link copied' : 'Copy message link'} disabled={!available} onClick={() => void copy('link')}>{copied === 'link' ? <Check /> : <LinkIcon />}</MessageActionButton>
    <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
    <span role="status" className={notice.startsWith('Clipboard unavailable') ? 'basis-full' : 'sr-only'}>{notice}</span>
  </div>
}
