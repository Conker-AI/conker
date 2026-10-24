import { useCallback, useState } from 'react'

const KEY = 'conker-inbox-later'

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 500) : []
  } catch { return [] }
}

function write(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* Later still works for this visit. */ }
}

/**
 * "Not now" for Inbox items, kept in this browser. It only reorders the Inbox: nothing is decided,
 * a permission still expires on its own, and Undo brings the item straight back.
 */
export function useLater() {
  const [ids, setIds] = useState(read)
  const update = useCallback((next: (current: string[]) => string[]) => setIds(current => { const value = next(current); write(value); return value }), [])
  const later = useCallback((id: string) => update(current => current.includes(id) ? current : [...current, id]), [update])
  const restore = useCallback((id: string) => update(current => current.filter(item => item !== id)), [update])
  return { isLater: (id: string) => ids.includes(id), later, restore }
}
