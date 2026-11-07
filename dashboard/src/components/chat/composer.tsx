import { isValidElement, useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { MoreHorizontal, Square } from 'lucide-react'
import { AnimatedIconButton } from '@/components/icons/animated/animated-icon'
import { SendIcon } from '@/components/icons/animated/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEnterSends } from '@/pwa/enter-key'
import { Textarea } from '@/components/ui/textarea'
import type { ChatContract } from '@/lib/chat/contract'
import { ComposerItemContext, FOLD_BELOW, itemSummary, splitComposerItems, withItemValue, type ComposerItemId, type ComposerItemValues } from './composer-items'

export const conversationColumn = 'mx-auto w-full max-w-[816px] px-4 sm:px-6'

type ComposerFrameProps = {
  id: string; label: string; placeholder: string; value: string
  onChange: (value: string) => void; onSend: () => void; disabled: boolean
  inputRef?: RefObject<HTMLTextAreaElement | null>; controls?: ReactNode; actions: ReactNode; feedback?: ReactNode; input?: ReactNode
  /** The registered controls about the next message or this chat: on the bar while there is room, folded when not. */
  settings?: ReactNode
}

/**
 * The overflow that holds the folded items when the toolbar row is too narrow. It stays mounted so
 * the folded controls keep loading and reporting their values, and the fold line above the bar
 * names what is in there.
 */
function ComposerOverflow({ values, children }: { values: string[]; children: ReactNode }) {
  return <Popover>
    <PopoverTrigger render={<Button type="button" size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={values.length ? `More options: ${values.join(' · ')}` : 'More options'} title={values.length ? values.join(' · ') : undefined} />}>
      <MoreHorizontal className="size-4" />
    </PopoverTrigger>
    <PopoverContent portalProps={{ keepMounted: true }} side="top" align="start" aria-label="More options" className="w-[min(20rem,calc(100vw-2rem))]"><div className="flex w-full flex-col items-start gap-1 [&_[data-label]]:not-sr-only">{children}</div></PopoverContent>
  </Popover>
}

/** Reads the item id a registered control carries, or null for an unregistered child. */
function itemIdOf(item: ReactNode): ComposerItemId | null {
  if (!isValidElement<{ 'data-item'?: ComposerItemId }>(item)) return null
  return item.props['data-item'] ?? null
}

export function ChatComposerFrame({ id, label, placeholder, value, onChange, onSend, disabled, inputRef, controls, settings, actions, feedback, input }: ComposerFrameProps) {
  const localInput = useRef<HTMLTextAreaElement>(null)
  const enterSends = useEnterSends()
  const inputEl = inputRef ?? localInput
  const [moreValues, setMoreValues] = useState<ComposerItemValues>({})
  const report = useCallback((control: ComposerItemId, next: string | null) => setMoreValues(current => withItemValue(current, control, next)), [])
  const { settings: items, actions: bar } = splitComposerItems(settings, actions)
  const named = itemSummary(moreValues)
  const toolbar = useRef<HTMLDivElement>(null)
  const [toolbarWidth, setToolbarWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = toolbar.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const next = entries.at(-1)?.contentRect.width
      if (next !== undefined) setToolbarWidth(Math.round(next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
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
  // One ResizeObserver measures the toolbar row; an item whose FOLD_BELOW is above the measured
  // width folds into the overflow menu. Before the first measurement nothing is folded.
  const onBar: ReactNode[] = [], folded: ReactNode[] = []
  for (const item of items) {
    const foldId = itemIdOf(item)
    if (toolbarWidth !== null && foldId && foldId !== 'model' && toolbarWidth < FOLD_BELOW[foldId]) folded.push(item)
    else onBar.push(item)
  }
  return <ComposerItemContext.Provider value={report}><form aria-label="Message composer" className="@container relative min-w-0 rounded-3xl border bg-card text-card-foreground shadow-composer transition-colors focus-within:border-foreground/16" onSubmit={event => { event.preventDefault(); onSend() }}>
    {input ?? <><Label htmlFor={id} className="sr-only">{label}</Label>
    <Textarea ref={inputEl} id={id} dir="auto" rows={2} value={value} placeholder={placeholder} disabled={disabled} aria-invalid={[...value].length > 16_000 || undefined} aria-describedby={`${id}-help`} enterKeyHint={enterSends ? 'send' : 'enter'} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (enterSends && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend() } }} unstyled className="block [&>textarea]:max-h-[min(16.5rem,calc(var(--app-height)*0.3+1.5rem))] [&>textarea]:min-h-16 [&>textarea]:resize-none [&>textarea]:overflow-y-auto [&>textarea]:bg-transparent [&>textarea]:px-4 [&>textarea]:pb-2 [&>textarea]:pt-4 [&>textarea]:text-base" />
    <p id={`${id}-help`} className="sr-only">{enterSends ? 'Enter to send. Shift+Enter for a new line.' : 'Enter for a new line. Use the Send button to send.'}</p></>}
    {folded.length > 0 && <p aria-hidden className="truncate px-4 pb-1 text-sm text-muted-foreground">{named.join(' · ')}</p>}
    <div ref={toolbar} className="flex min-w-0 flex-nowrap items-center gap-2 px-3 pb-3">
      <div className="flex min-w-0 flex-nowrap items-center gap-1">{controls}{onBar}
        {folded.length > 0 && <ComposerOverflow values={named}>{folded}</ComposerOverflow>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">{bar}</div>
    </div>
    {feedback && <div className="px-4 pb-3">{feedback}</div>}
  </form></ComposerItemContext.Provider>
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
