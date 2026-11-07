import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { OverlayBody, TaskDialogContent } from '@/components/design-system'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { ContextSettingsPanel } from './context-settings-panel'
import { ContextSummaryPanel } from './context-summary-panel'

/** This chat's context: a header button that opens the context editor. `lastMessageId` is the chat's newest message (a context fork continues from it); `onChanged` reloads the chat after a change. */
/** Phones pass `open` and `onOpenChange` and open it from the chat's "..." menu instead of a header button. */
export function ChatContextControl({ control, sessionId, lastMessageId, disabled, onChanged, open, onOpenChange }: { control: GatewayControlClient; sessionId: string; lastMessageId: string | null; disabled: boolean; onChanged: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {open === undefined && <DialogTrigger render={<Button size="icon" variant="ghost" aria-label="Context" title="Context" />}><Layers /></DialogTrigger>}
    <TaskDialogContent title="Context" description="What the AI keeps in mind in this chat." size="wide">
      <OverlayBody className="space-y-8">
        <ContextSettingsPanel client={control.chatContext} sessionId={sessionId} disabled={disabled} onChanged={onChanged} />
        <ContextSummaryPanel client={control.chatSummary} sessionId={sessionId} lastMessageId={lastMessageId} disabled={disabled} onChanged={onChanged} />
      </OverlayBody>
    </TaskDialogContent>
  </Dialog>
}
