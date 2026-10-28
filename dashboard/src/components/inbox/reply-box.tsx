import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * Change / Reply on an Inbox card: his own words go back to Conker as his next message in that
 * chat. Nothing on the card runs. Every button is type="button": the card can sit inside a form.
 */
export function ReplyBox({ label, placeholder, value, busy, onChange, onSend, onCancel }: {
  label: string; placeholder: string; value: string; busy: boolean
  onChange: (value: string) => void; onSend: () => void; onCancel: () => void
}) {
  const id = useId()
  return <div className="flex flex-col gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Textarea id={id} autoFocus value={value} maxLength={2000} disabled={busy} placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && value.trim()) { event.preventDefault(); onSend() } }} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={busy || !value.trim()} onClick={onSend}>Send to Conker</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  </div>
}
