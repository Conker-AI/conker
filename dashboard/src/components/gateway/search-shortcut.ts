import { useServerSetting } from '@/settings/server-setting'

/**
 * The letter that opens Search everything with Ctrl (or Cmd), from Settings > Keyboard, or null
 * when the owner has turned keyboard shortcuts off.
 */
export function useSearchShortcut(): 'k' | 'p' | null {
  const shortcuts = useServerSetting('keyboard.shortcuts', true)
  const palette = useServerSetting<'ctrl_k' | 'ctrl_p'>('keyboard.palette', 'ctrl_k')
  return !shortcuts ? null : palette === 'ctrl_p' ? 'p' : 'k'
}
