import { DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Choices keep native Select behavior inline and real menu items in overflow. WorkspaceRouteActions
 * knows a choice by its `options` prop, so the shell need not import Select. */
export function WorkspaceChoice({ label, value, options, onValueChange, disabled, menuItem = false, mobileMenu = false }: {
  label: string; value: string; options: readonly { value: string; label: string }[]; onValueChange: (value: string) => void; disabled?: boolean; menuItem?: boolean; mobileMenu?: boolean
}) {
  if (menuItem && mobileMenu) return <><DropdownMenuLabel>{label}</DropdownMenuLabel><DropdownMenuRadioGroup aria-label={label} value={value} onValueChange={onValueChange}>{options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} disabled={disabled}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /></>
  if (menuItem) return <DropdownMenuSub><DropdownMenuSubTrigger disabled={disabled}>{label}: {options.find(option => option.value === value)?.label ?? value}</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>{options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub>
  return <Select value={value} onValueChange={value => { if (value !== null) onValueChange(value) }} disabled={disabled} items={[...options.map((option) => ({ value: option.value, label: option.label }))]}><SelectTrigger aria-label={label} size="sm"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
}
