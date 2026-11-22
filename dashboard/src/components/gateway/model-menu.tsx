import { useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioRow, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChatFeatureError } from '@/components/chat/chat-feature-error'
import type { ModelMenuLayout } from '@/lib/gateway/claude-models'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import { effortLabel, effortStops } from './use-chat-effort'

/** The radio key of the "Auto" row, which stands for no chosen model: the router picks per message. */
export const AUTO_KEY = '__auto__'

/** A menu row on a phone is a 44 px tap target; the menu primitive's 32 px stays for pointer widths. */
const ROW = 'max-sm:min-h-11'

export type ModelMenuEffort = { value: ChatEffort; onChange: (value: ChatEffort) => void; disabled: boolean; note: string | null; error: string; newChat: boolean }
export type ModelMenuAdd = { count: number; pending: boolean; error: string; onAdd: () => void }

type ModelMenuProps = {
  /** The model that will answer, as the button names it. */
  name: string
  disabled: boolean
  layout: ModelMenuLayout
  /** The ticked row: a catalogue id, or AUTO_KEY. */
  selected: string
  auto: boolean
  /** A private chat has no default model, so one must be chosen. */
  manualRequired: boolean
  /** A model this chat names that the list no longer offers. */
  lostModel: boolean
  onSelect: (key: string) => void
  effort?: ModelMenuEffort
  add?: ModelMenuAdd
}

/**
 * The composer's one model button: its label is the model and, when set, the effort ("Sonnet 5.5 High").
 * The menu lists the top models with number keys, Effort as a submenu and every other model under
 * More models, as Claude Code's own model menu does.
 */
export function ModelMenu({ name, disabled, layout, selected, auto, manualRequired, lostModel, onSelect, effort, add }: ModelMenuProps) {
  const [open, setOpen] = useState(false)
  const effortText = effort && effort.value !== 'auto' ? effortLabel(effort.value) : null
  const pick = (key: string) => { onSelect(key); setOpen(false) }
  // 1-4 choose the numbered models; keys typed inside a submenu belong to that submenu.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || !/^[1-9]$/.test(event.key)) return
    if ((event.target as HTMLElement).closest('[data-slot=menu-sub-content]')) return
    const row = layout.top.find(item => item.number === Number(event.key))
    if (!row) return
    event.preventDefault()
    if (row.id) pick(row.id)
  }
  const rows = (items: ModelMenuLayout['top']) => items.map(row => <DropdownMenuRadioRow key={row.id ?? row.name} className={ROW} value={row.id ?? `missing:${row.name}`} disabled={!row.id} hint={row.number} title={row.id ? undefined : 'Not in your model list yet'}>{row.name}</DropdownMenuRadioRow>)
  return <DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Answer model: ${name}${effortText ? `, ${effortText} effort` : ''}`} className="min-w-0 max-w-[11.5rem] font-normal text-muted-foreground sm:max-w-56" />}>
      <span aria-hidden className="min-w-0 truncate"><span className="text-foreground">{name}</span>{effortText && <>{' '}<span className="ms-1.5">{effortText}</span></>}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" className="w-64 max-w-[calc(100vw-1rem)]" onKeyDown={onKeyDown}>
      <DropdownMenuRadioGroup value={selected} onValueChange={value => pick(String(value))} aria-label="Answer model">
        {auto && !manualRequired && <DropdownMenuRadioRow className={ROW} value={AUTO_KEY}>Auto · picks per message</DropdownMenuRadioRow>}
        {rows(layout.top)}
        {lostModel && <DropdownMenuRadioRow className={ROW} value={selected} disabled>Selected model unavailable</DropdownMenuRadioRow>}
      </DropdownMenuRadioGroup>
      {manualRequired && <DropdownMenuLabel>Choose a model for this chat.</DropdownMenuLabel>}
      {add && add.count > 0 && <DropdownMenuItem className={ROW} closeOnClick={false} disabled={add.pending} onClick={add.onAdd}><Plus />{add.pending ? 'Adding…' : `Add ${add.count === 1 ? 'a Claude model' : 'Claude models'} to my list`}</DropdownMenuItem>}
      {add?.error && <p role="alert" className="px-2 py-1 text-xs text-destructive-foreground">{add.error}</p>}
      {(effort || layout.more.length > 0) && <DropdownMenuSeparator />}
      {effort && <DropdownMenuSub>
        <DropdownMenuSubTrigger className={ROW} disabled={effort.disabled}><span>Effort</span>{effort.value === 'auto' && <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">Auto</span>}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-72 max-w-[calc(100vw-1rem)]">
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Higher effort means more thorough responses, but takes longer and uses your limits faster.</p>
          <DropdownMenuRadioGroup value={effort.value} onValueChange={value => { effort.onChange(value as ChatEffort); setOpen(false) }} aria-label="Effort">
            {effortStops.map(([value, text]) => <DropdownMenuRadioRow key={value} className={ROW} value={value} disabled={effort.disabled}>{text}</DropdownMenuRadioRow>)}
          </DropdownMenuRadioGroup>
          {(effort.note || effort.newChat) && <><DropdownMenuSeparator /><p role="status" className="px-2 py-1.5 text-xs text-muted-foreground">{effort.note}{effort.note && effort.newChat && ' '}{effort.newChat && 'It is saved with the chat when it starts.'}</p></>}
          {effort.error && <div className="px-2 py-1"><ChatFeatureError text={effort.error} /></div>}
        </DropdownMenuSubContent>
      </DropdownMenuSub>}
      {layout.more.length > 0 && <DropdownMenuSub>
        <DropdownMenuSubTrigger className={ROW}>More models</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-60 max-w-[calc(100vw-1rem)]">
          <DropdownMenuRadioGroup value={selected} onValueChange={value => pick(String(value))} aria-label="More models">{rows(layout.more)}</DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>}
    </DropdownMenuContent>
  </DropdownMenu>
}
