import { useEffect, useState } from 'react'
import { BookOpen, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { SkillMetadata } from '@/lib/gateway/skills'
import { gatewayError } from '@/lib/gateway/transport'

/** Selection is explicit and applies to the next submitted message only. */
export function GatewaySkillPicker({ client, value, onChange, disabled, harnessDisabled = false }: { client: GatewayRuntimeClient; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; harnessDisabled?: boolean }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<SkillMetadata[] | null>(null), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    client.listSkills({ signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setRows(result); setError(null) } }).catch(cause => { if (!controller.signal.aborted) setError(gatewayError(cause).message) })
    return () => controller.abort()
  }, [client, open, retry])
  const enabled = rows?.filter(row => row.enabled)
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={disabled || harnessDisabled} aria-label={harnessDisabled ? 'Skills unavailable in No-harness mode' : `Skills for next message${value.length ? `: ${value.join(', ')}` : ''}`} className="max-w-full gap-1.5 rounded-full text-muted-foreground"><BookOpen className="size-4" /><span className="truncate">{harnessDisabled ? 'Skills off' : value.length ? value.join(', ') : 'Skills'}</span></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0"><div className="border-b p-3"><p className="text-sm font-medium">Skills for the next message</p><p className="mt-1 text-xs text-muted-foreground">Choose up to 3. Selection clears after the message is accepted.</p></div><Command><CommandInput placeholder="Find a skill…" /><CommandList aria-label="Skills for next message">
      {!!enabled?.length && <CommandEmpty>No matching skills.</CommandEmpty>}
      {!rows && !error && <p role="status" className="p-3 text-xs text-muted-foreground">Loading skills…</p>}
      {enabled?.map(row => <CommandItem key={row.id} value={`${row.name} ${row.description}`} disabled={!value.includes(row.id) && value.length >= 3} onSelect={() => onChange(value.includes(row.id) ? value.filter(id => id !== row.id) : [...value, row.id])}><Check className={value.includes(row.id) ? 'size-4 shrink-0' : 'size-4 shrink-0 invisible'} /><span className="min-w-0"><span className="block break-words text-sm">{row.name}</span><span className="line-clamp-2 text-xs text-muted-foreground">{row.description}</span></span></CommandItem>)}
      {enabled?.length === 0 && <p className="p-3 text-xs text-muted-foreground">No enabled skills. Import a SKILL.md in Agent studio.</p>}
      {error && <div className="space-y-2 p-3"><p role="alert" className="text-xs text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => setRetry(current => current + 1)}>Reload skills</Button></div>}
    </CommandList></Command>
    {!!value.length && <div className="space-y-1 border-t p-3"><p className="break-words text-xs text-muted-foreground">Selected: {value.join(', ')}</p>{rows && value.some(id => !enabled?.some(row => row.id === id)) && <p role="alert" className="text-xs text-destructive">A selected skill is no longer enabled. Clear the selection before sending.</p>}<Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>Clear selection</Button></div>}
    <div className="border-t p-2"><Button variant="ghost" size="sm" asChild><Link to="/agents?tab=skills" onClick={() => setOpen(false)}>Manage skills</Link></Button></div></PopoverContent>
  </Popover>
}
