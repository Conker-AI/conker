import { useServerSetting } from '@/settings/server-setting'

/**
 * The letter that opens Search everything with Ctrl (or Cmd), or null when the owner has turned
 * keyboard shortcuts off in Settings > Keyboard. It is always K: Ctrl+P took over the browser's Print.
 */
export function useSearchShortcut(): 'k' | null {
  const shortcuts = useServerSetting('keyboard.shortcuts', true)
  return shortcuts ? 'k' : null
}
