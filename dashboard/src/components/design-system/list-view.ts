import { useMemo, useState } from "react"
import type { ListSort } from "./list-card"

type Sorter<T> = { label: string; compare: (a: T, b: T) => number }

/**
 * Search and order for a list the browser already holds (Agents, Projects, Skills...). `text` says
 * which words a row is found by; `sorts` names each order, the first is the default. Lists the
 * server pages (Chats) search and sort on the server instead. Define `text` and `sorts` outside the
 * component (module constants), so the list is not re-sorted on every render.
 */
export function useListView<T, S extends string>(rows: readonly T[], { text, sorts }: { text: (row: T) => readonly (string | null | undefined)[]; sorts: Record<S, Sorter<T>> }) {
  const keys = Object.keys(sorts) as S[]
  const [query, setQuery] = useState("")
  const [order, setOrder] = useState<S>(keys[0])
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const found = words.length ? rows.filter(row => { const hay = text(row).filter(Boolean).join(" ").toLowerCase(); return words.every(word => hay.includes(word)) }) : [...rows]
    return found.sort(sorts[order].compare)
  }, [rows, query, order, text, sorts])
  const sort: ListSort<S> = { value: order, options: keys.map(value => ({ value, label: sorts[value].label })), onChange: value => setOrder(value) }
  return { query, setQuery, rows: shown, sort }
}

/** Common orders: by a name (A to Z) and by a time, newest first. */
export const byName = <T,>(name: (row: T) => string) => (a: T, b: T) => name(a).localeCompare(name(b), undefined, { sensitivity: "base", numeric: true })
export const byNewest = <T,>(time: (row: T) => number | string | null | undefined) => (a: T, b: T) => stamp(time(b)) - stamp(time(a))
const stamp = (value: number | string | null | undefined) => typeof value === "number" ? value : value ? Date.parse(value) || 0 : 0
