import { useCallback, useEffect, useState } from 'react'
import type { Setting } from './registry'

/**
 * Planned settings (`effect: "stored"`) keep the owner's choice for a feature still being built:
 * nothing reads them yet, so Settings and search leave them out until "Planned" is on. The choice
 * is a view filter, not a setting, remembered in this browser. Storage can be missing or blocked
 * (private windows): reads fall back to hidden and writes last for this page only.
 */
const KEY = 'conker.settings-view.planned'
const EVENT = 'conker-settings-planned'

export const isPlanned = (setting: Pick<Setting, 'effect'>) => setting.effect === 'stored'

export function plannedShown(): boolean {
  try { return window.localStorage.getItem(KEY) === 'true' } catch { return false }
}

function remember(value: boolean) {
  try {
    if (value) window.localStorage.setItem(KEY, 'true')
    else window.localStorage.removeItem(KEY)
  } catch { /* storage unavailable: the choice lasts for this page only */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }))
}

/** Whether planned settings show, and a setter shared by every open Settings view in this tab. */
export function usePlannedShown(): [boolean, (value: boolean) => void] {
  const [shown, setShown] = useState(plannedShown)
  useEffect(() => {
    const follow = (event: Event) => setShown((event as CustomEvent<boolean>).detail === true)
    window.addEventListener(EVENT, follow)
    return () => window.removeEventListener(EVENT, follow)
  }, [])
  const set = useCallback((value: boolean) => { setShown(value); remember(value) }, [])
  return [shown, set]
}
