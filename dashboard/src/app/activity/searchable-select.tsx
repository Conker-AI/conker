import { useId, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function SearchableSelect({ id, label, value, options, onChange, disabled }: {
  id: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} disabled={disabled} className="w-full justify-between font-normal"><span className="truncate">{options.find(option => option.value === value)?.label ?? `Choose ${label.toLocaleLowerCase()}`}</span><ChevronsUpDown className="shrink-0 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command><CommandInput aria-label={`Search ${label.toLocaleLowerCase()}`} placeholder={`Search ${label.toLocaleLowerCase()}…`} /><CommandList id={listId}><CommandEmpty>No matching {label.toLocaleLowerCase()}.</CommandEmpty><CommandGroup>{options.map(option => <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => { onChange(option.value); setOpen(false) }}><span className="min-w-0 flex-1 break-words">{option.label}</span>{value === option.value && <Check />}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>
}
