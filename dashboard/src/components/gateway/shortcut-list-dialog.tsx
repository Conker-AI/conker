import { useState } from 'react'
import { OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { Dialog } from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useEnterSends } from '@/pwa/enter-key'

function Keys({ keys }: { keys: string[] }) {
  return (
    <KbdGroup>
      {keys.map(key => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}

/** Every keyboard shortcut that works now, in one dialog (opened by ShortcutList, loaded on first use). */
export function ShortcutListDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const enterSends = useEnterSends()
  const [mod] = useState(() => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'))

  const rows: [string, string[]][] = [
    ['Search everything', [mod, 'K']],
    ['New chat', [mod, 'Shift', 'O']],
    ['Open or close the sidebar', [mod, 'B']],
    ...(enterSends
      ? ([
          ['Send a message', ['Enter']],
          ['New line in a message', ['Shift', 'Enter']],
        ] as [string, string[]][])
      : ([['New line in a message', ['Enter']]] as [string, string[]][])),
    ['Close a window or menu', ['Esc']],
    ['Show this list', ['?']],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TaskDialogContent title="Keyboard shortcuts" description="Use them anywhere in Conker; ? opens this list when you are not typing. Turn them off in Settings, Keyboard.">
        <OverlayBody>
          <dl className="divide-y">
            {rows.map(([what, keys]) => (
              <div key={what} className="flex min-h-11 items-center justify-between gap-4 py-2">
                <dt className="text-sm">{what}</dt>
                <dd>
                  <Keys keys={keys} />
                </dd>
              </div>
            ))}
          </dl>
        </OverlayBody>
      </TaskDialogContent>
    </Dialog>
  )
}
