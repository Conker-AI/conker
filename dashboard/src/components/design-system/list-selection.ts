import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/**
 * Multi-select for any list: a select mode, one tap per row, Shift picks a range from the last
 * row tapped, and "all" means every row loaded now. Ids that leave the list (a new filter, a
 * refresh) leave the selection with them, so a bulk action never reaches a row you cannot see.
 */
export function useListSelection(ids: readonly string[]) {
  const [active, setActive] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const selected = useMemo(() => new Set(ids.filter(id => picked.has(id))), [ids, picked])
  useEffect(() => {
    if (!active) return
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { setActive(false); setPicked(new Set()) } }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [active])
  const toggle = useCallback((id: string, range = false) => {
    setActive(true)
    setPicked(current => {
      const next = new Set([...current].filter(item => ids.includes(item)))
      const from = anchor.current === null ? -1 : ids.indexOf(anchor.current), to = ids.indexOf(id)
      if (range && from >= 0 && to >= 0) {
        const on = !next.has(id) || next.has(anchor.current!)
        ids.slice(Math.min(from, to), Math.max(from, to) + 1).forEach(item => on ? next.add(item) : next.delete(item))
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
  }, [ids])
  const all = ids.length > 0 && selected.size === ids.length
  return {
    active, selected, count: selected.size, total: ids.length, all, some: selected.size > 0 && !all,
    has: (id: string) => selected.has(id),
    toggle,
    setAll: (on: boolean) => { setActive(true); setPicked(on ? new Set(ids) : new Set()); anchor.current = null },
    start: () => setActive(true),
    stop: () => { setActive(false); setPicked(new Set()); anchor.current = null },
  }
}

export type ListSelection = ReturnType<typeof useListSelection>
