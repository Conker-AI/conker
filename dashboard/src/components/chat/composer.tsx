import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { SlidersHorizontal, Square } from 'lucide-react'
import { AnimatedIconButton } from '@/components/icons/animated/animated-icon'
import { SendIcon } from '@/components/icons/animated/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { useEnterSends } from '@/pwa/enter-key'
import { Textarea } from '@/components/ui/textarea'
import type { ChatContract } from '@/lib/chat/contract'
import { cn } from '@/lib/utils'
import { ComposerMoreContext, moreSummary, splitComposerActions, withMoreValue, type ComposerMoreId, type ComposerMoreValues } from './composer-more'

export const conversationColumn = 'mx-auto w-full max-w-[816px] px-4 sm:px-6'

type ComposerFrameProps = {
  id: string; label: string; placeholder: string; value: string
  onChange: (value: string) => void; onSend: () => void; disabled: boolean
  inputRef?: RefObject<HTMLTextAreaElement | null>; controls?: ReactNode; actions: ReactNode; feedback?: ReactNode; input?: ReactNode
  /** How the next message is made (template, model, skills, thinking): behind More, with the chat's own switches. */
  settings?: ReactNode
}

/**
 * One plain control for everything but Agent, Mode, voice typing and Send. It names what differs from the defaults
 * (on a phone, in a line above the bar). Kept mounted so the controls behind it keep their state and report their
 * values while it is closed. In a narrow composer (under 24rem, most phones) More and Mode drop their icons so the
 * bar stays on one row; narrower still, voice typing and Send wrap to a second row instead of overlapping.
 */
function ComposerMore({ values, children }: { values: string[]; children: ReactNode }) {
  const named = values.length > 0
  return <Popover>
    <PopoverTrigger render={<Button type="button" size="sm" variant="ghost" className={cn('min-w-0 shrink gap-1.5 px-2 font-normal', named ? 'text-foreground' : 'text-muted-foreground')} aria-label={named ? `More: ${values.join(', ')}` : 'More'} title={named ? values.join(' · ') : undefined} />}>
      <SlidersHorizontal className="@max-[24rem]:hidden" /><span>More</span>{named && <span className="hidden min-w-0 max-w-64 truncate sm:inline">· {values.join(' · ')}</span>}
    </PopoverTrigger>
    <PopoverPopup side="top" align="start" aria-label="More settings" portalProps={{ keepMounted: true }} className="w-[min(20rem,calc(100vw-2rem))]"><div className="flex flex-col items-start gap-1">{children}</div></PopoverPopup>
  </Popover>
}

export function ChatComposerFrame({ id, label, placeholder, value, onChange, onSend, disabled, inputRef, controls, settings, actions, feedback, input }: ComposerFrameProps) {
  const localInput = useRef<HTMLTextAreaElement>(null)
  const enterSends = useEnterSends()
  const inputEl = inputRef ?? localInput
  const [moreValues, setMoreValues] = useState<ComposerMoreValues>({})
  const report = useCallback((control: ComposerMoreId, next: string | null) => setMoreValues(current => withMoreValue(current, control, next)), [])
  const { bar, more } = splitComposerActions(actions)
  const named = moreSummary(moreValues)
  useLayoutEffect(() => {
    const resize = () => {
      const field = inputEl.current
      if (!field) return
      // At most 30% of what is visible, so the on-screen keyboard always leaves room for the chat.
      const limit = Math.min(240, Math.max(64, Math.floor((window.visualViewport?.height ?? window.innerHeight) * 0.3)))
      field.style.height = '0px'
      field.style.height = `${Math.min(limit, Math.max(64, field.scrollHeight))}px`
    }
    resize()
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize) }
  }, [inputEl, value])
  return <ComposerMoreContext.Provider value={report}><form aria-label="Message composer" className="@container relative min-w-0 rounded-3xl border bg-card text-card-foreground shadow-composer transition-colors focus-within:border-ring" onSubmit={event => { event.preventDefault(); onSend() }}>
    {input ?? <><Label htmlFor={id} className="sr-only">{label}</Label>
    <Textarea ref={inputEl} id={id} dir="auto" rows={2} value={value} placeholder={placeholder} disabled={disabled} aria-invalid={[...value].length > 16_000 || undefined} aria-describedby={`${id}-help`} enterKeyHint={enterSends ? 'send' : 'enter'} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (enterSends && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend() } }} unstyled className="block [&>textarea]:max-h-[min(16.5rem,calc(var(--app-height)*0.3+1.5rem))] [&>textarea]:min-h-16 [&>textarea]:resize-none [&>textarea]:overflow-y-auto [&>textarea]:bg-transparent [&>textarea]:px-4 [&>textarea]:pb-2 [&>textarea]:pt-4 [&>textarea]:text-base" />
    <p id={`${id}-help`} className="sr-only">{enterSends ? 'Enter to send. Shift+Enter for a new line.' : 'Enter for a new line. Use the Send button to send.'}</p></>}
    {named.length > 0 && <p aria-hidden className="truncate px-4 pb-1 text-sm text-muted-foreground sm:hidden">{named.join(' · ')}</p>}
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 pb-3 @max-[24rem]:gap-1">
      <div className="flex min-w-0 max-w-full items-center gap-1">{controls}{(settings || more.length > 0) && <ComposerMore values={named}>{settings}{settings && more.length > 0 && <Separator className="my-1" />}{more}</ComposerMore>}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1">{bar}</div>
    </div>
    {feedback && <div className="px-4 pb-3">{feedback}</div>}
  </form></ComposerMoreContext.Provider>
}

export function ChatComposer({ chat, inputRef, controls, settings, actions, dictating = false, input }: { chat: ChatContract; inputRef?: RefObject<HTMLTextAreaElement | null>; controls?: ReactNode; settings?: ReactNode; actions?: ReactNode; dictating?: boolean; input?: ReactNode }) {
  const overLimit = [...chat.draft].length > 16_000
  const send = () => { if (!dictating && chat.send.availability === 'enabled') void chat.send.run() }
  const generation = chat.generation
  return <ChatComposerFrame id="gateway-composer" label={`Message ${chat.activeAgentName}`} placeholder={`Reply to ${chat.activeAgentName}...`} value={chat.draft} inputRef={inputRef} disabled={chat.setDraft.availability !== 'enabled'} onChange={value => { if (chat.setDraft.availability === 'enabled') void chat.setDraft.run(value) }} onSend={send} controls={controls} settings={settings} input={input} actions={<>
    {actions}
    {generation ? <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={generation.stop.availability !== 'enabled'} onClick={() => { if (generation.stop.availability === 'enabled') void generation.stop.run() }}><Square />{generation.phase === 'stopping' ? 'Stopping...' : 'Stop'}</Button> : <AnimatedIconButton icon={SendIcon} type="submit" size="icon" className="size-9 shrink-0 rounded-full" aria-label="Send message" disabled={dictating || chat.send.availability !== 'enabled'} title={dictating ? 'Finish voice typing before sending' : chat.send.availability !== 'enabled' ? chat.send.reason : 'Send message'} />}
  </>} feedback={overLimit && <p role="alert" className="text-xs text-destructive-foreground">Use 16,000 characters or fewer.</p>} />
}
