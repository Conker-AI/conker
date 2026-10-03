import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Square } from 'lucide-react'
import { AnimatedIconButton } from '@/components/icons/animated/animated-icon'
import { SendIcon } from '@/components/icons/animated/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ChatContract } from '@/lib/chat/contract'

export const conversationColumn = 'mx-auto w-full max-w-[816px] px-4 sm:px-6'

type ComposerFrameProps = {
  id: string; label: string; placeholder: string; value: string
  onChange: (value: string) => void; onSend: () => void; disabled: boolean
  inputRef?: RefObject<HTMLTextAreaElement | null>; controls?: ReactNode; actions: ReactNode; feedback?: ReactNode
}

export function ChatComposerFrame({ id, label, placeholder, value, onChange, onSend, disabled, inputRef, controls, actions, feedback }: ComposerFrameProps) {
  const localInput = useRef<HTMLTextAreaElement>(null)
  const input = inputRef ?? localInput
  useLayoutEffect(() => {
    const resize = () => {
      const field = input.current
      if (!field) return
      field.style.height = '0px'
      field.style.height = `${Math.min(240, Math.max(64, field.scrollHeight))}px`
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [input, value])
  return <form aria-label="Message composer" className="relative min-w-0 rounded-3xl border bg-card text-card-foreground shadow-composer transition-colors focus-within:border-ring" onSubmit={event => { event.preventDefault(); onSend() }}>
    <Label htmlFor={id} className="sr-only">{label}</Label>
    <Textarea ref={input} id={id} dir="auto" rows={2} value={value} placeholder={placeholder} disabled={disabled} aria-invalid={[...value].length > 16_000 || undefined} aria-describedby={`${id}-help`} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend() } }} className="max-h-60 min-h-16 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 pb-2 pt-4 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent" />
    <p id={`${id}-help`} className="sr-only">Enter to send. Shift+Enter for a new line.</p>
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 pb-3">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">{controls}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
    </div>
    {feedback && <div className="px-4 pb-3">{feedback}</div>}
  </form>
}

export function ChatComposer({ chat, inputRef, controls, actions, dictating = false }: { chat: ChatContract; inputRef?: RefObject<HTMLTextAreaElement | null>; controls?: ReactNode; actions?: ReactNode; dictating?: boolean }) {
  const overLimit = [...chat.draft].length > 16_000
  const send = () => { if (!dictating && chat.send.availability === 'enabled') void chat.send.run() }
  const generation = chat.generation
  return <ChatComposerFrame id="gateway-composer" label={`Message ${chat.activeAgentName}`} placeholder={`Reply to ${chat.activeAgentName}...`} value={chat.draft} inputRef={inputRef} disabled={chat.setDraft.availability !== 'enabled'} onChange={value => { if (chat.setDraft.availability === 'enabled') void chat.setDraft.run(value) }} onSend={send} controls={controls} actions={<>
    {actions}
    {generation ? <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={generation.stop.availability !== 'enabled'} onClick={() => { if (generation.stop.availability === 'enabled') void generation.stop.run() }}><Square />{generation.phase === 'stopping' ? 'Stopping...' : 'Stop'}</Button> : <AnimatedIconButton icon={SendIcon} type="submit" size="icon" className="size-9 shrink-0 rounded-full" aria-label="Send message" disabled={dictating || chat.send.availability !== 'enabled'} title={dictating ? 'Finish voice typing before sending' : chat.send.availability !== 'enabled' ? chat.send.reason : 'Send message'} />}
  </>} feedback={overLimit && <p role="alert" className="text-xs text-destructive">Use 16,000 characters or fewer.</p>} />
}
