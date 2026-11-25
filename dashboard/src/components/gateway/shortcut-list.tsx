import { useEffect, useState } from 'react'
import { OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { Dialog } from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useEnterSends } from '@/pwa/enter-key'
import { useServerSetting } from '@/settings/server-setting'

/** True while the owner is typing somewhere, where ? is just a question mark. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]')
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <KbdGroup>
      {keys.map(key => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}

/**
 * Every keyboard shortcut, opened with ? (Settings > Keyboard: "Shortcut list on ?"). Nothing opens
 * while he types, or when shortcuts are off altogether. The list names only shortcuts that work now.
 */
export function ShortcutList() {
  const shortcuts = useServerSetting('keyboard.shortcuts', true)
  const cheatSheet = useServerSetting('keyboard.cheat_sheet', true)
  const enterSends = useEnterSends()
  const [open, setOpen] = useState(false)
  const on = shortcuts && cheatSheet
  const [mod] = useState(() => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'))

  useEffect(() => {
    if (!on) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || typingIn(event.target)) return
      event.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [on])

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
    <Dialog open={open && on} onOpenChange={setOpen}>
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
