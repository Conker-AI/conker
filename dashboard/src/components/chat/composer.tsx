import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ChatContract } from '@/lib/chat/contract'

export function ChatComposer({ chat }: { chat: ChatContract }) {
  const overLimit = [...chat.draft].length > 16_000
  const send = () => { if (chat.send.availability === 'enabled') void chat.send.run() }
  const generation = chat.generation
  return <form aria-label="Message composer" className="min-w-0 rounded-2xl border border-input bg-card p-3 text-card-foreground shadow-sm transition-colors focus-within:border-foreground/20" onSubmit={event => { event.preventDefault(); send() }}>
    <Label htmlFor="gateway-composer" className="sr-only">Message Conker</Label>
    <Textarea id="gateway-composer" dir="auto" rows={1} value={chat.draft} placeholder="Reply to Conker…" disabled={chat.setDraft.availability !== 'enabled'} aria-invalid={overLimit || undefined} aria-describedby="gateway-composer-help" onChange={event => { if (chat.setDraft.availability === 'enabled') void chat.setDraft.run(event.target.value) }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() } }} className="max-h-40 min-h-11 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-1 py-1 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent" />
    <div className="flex min-w-0 items-center gap-2">
      <p id="gateway-composer-help" className="sr-only">Enter to send. Shift+Enter for a new line.</p><span className="flex-1" />
      {generation ? <Button type="button" variant="outline" size="sm" className="rounded-lg" disabled={generation.stop.availability !== 'enabled'} onClick={() => { if (generation.stop.availability === 'enabled') void generation.stop.run() }}><Square />{generation.phase === 'stopping' ? 'Stopping…' : 'Stop'}</Button> : <Button type="submit" size="icon" className="size-8 rounded-lg" aria-label="Send message" disabled={chat.send.availability !== 'enabled'} title={chat.send.availability !== 'enabled' ? chat.send.reason : 'Send message'}><ArrowUp /></Button>}
    </div>
    {overLimit && <p role="alert" className="mt-2 text-xs text-destructive">Use 16,000 characters or fewer.</p>}
  </form>
}
