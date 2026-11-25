import { lazy, Suspense, useEffect, useState } from 'react'
import { useServerSetting } from '@/settings/server-setting'

const ShortcutListDialog = lazy(() => import('./shortcut-list-dialog').then(module => ({ default: module.ShortcutListDialog })))

/** True while the owner is typing somewhere, where ? is just a question mark. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]')
}

/**
 * Every keyboard shortcut, opened with ? (Settings > Keyboard: "Shortcut list on ?"). Nothing opens
 * while he types, or when shortcuts are off altogether. Only this listener ships with the app; the
 * list itself loads the first time he asks for it.
 */
export function ShortcutList() {
  const shortcuts = useServerSetting('keyboard.shortcuts', true)
  const cheatSheet = useServerSetting('keyboard.cheat_sheet', true)
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const on = shortcuts && cheatSheet

  useEffect(() => {
    if (!on) return
    const key = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || typingIn(event.target)) return
      event.preventDefault()
      setAsked(true)
      setOpen(true)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [on])

  if (!asked) return null
  return (
    <Suspense fallback={null}>
      <ShortcutListDialog open={open && on} onOpenChange={setOpen} />
    </Suspense>
  )
}
