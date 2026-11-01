import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetPanel, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { ContextSettingsPanel } from './context-settings-panel'
import { ContextSummaryPanel } from './context-summary-panel'

/** This chat's context: a header button that opens the context editor. `lastMessageId` is the chat's newest message (a context fork continues from it); `onChanged` reloads the chat after a change. */
export function ChatContextControl({ control, sessionId, lastMessageId, disabled, onChanged }: { control: GatewayControlClient; sessionId: string; lastMessageId: string | null; disabled: boolean; onChanged: () => void }) {
  return <Sheet>
    <SheetTrigger render={<Button size="icon" variant="ghost" aria-label="Context" title="Context" />}><Layers /></SheetTrigger>
    <SheetContent className="sm:max-w-lg">
      <SheetHeader><SheetTitle>Context</SheetTitle></SheetHeader>
      <SheetPanel className="space-y-8">
        <ContextSettingsPanel client={control.chatContext} sessionId={sessionId} disabled={disabled} onChanged={onChanged} />
        <ContextSummaryPanel client={control.chatSummary} sessionId={sessionId} lastMessageId={lastMessageId} disabled={disabled} onChanged={onChanged} />
      </SheetPanel>
    </SheetContent>
  </Sheet>
}
