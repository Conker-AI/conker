import { useServerSetting } from '@/settings/server-setting'

/**
 * The letter that opens Search everything with Ctrl (or Cmd), from Settings > Keyboard, or null
 * when the owner has turned keyboard shortcuts off. Ctrl+P is no longer offered (it took over the
 * browser's Print); a saved `ctrl_p` reads as Ctrl+K.
 */
export function useSearchShortcut(): 'k' | null {
  const shortcuts = useServerSetting('keyboard.shortcuts', true)
  const palette = useServerSetting<'ctrl_k'>('keyboard.palette', 'ctrl_k')
  return shortcuts && palette === 'ctrl_k' ? 'k' : null
}
