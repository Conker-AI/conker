import { ConfirmationDialog } from '@/components/design-system/overlays'

/** "Refresh anyway?": shown only when the owner would lose something by refreshing. */
export function RefreshConfirm({ description, onCancel, onConfirm }: { description: string; onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmationDialog open onOpenChange={open => { if (!open) onCancel() }} title="Refresh anyway?" description={description}
    actionLabel="Refresh anyway" actionVariant="default" pending={false} onConfirm={onConfirm} />
}
