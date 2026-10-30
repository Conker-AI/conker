import { useEffect, useState } from 'react'

/** Whether Markdown holds a table, read the way answers are drawn (GitHub tables, not code). */
export function useHasTable(text: string | null): boolean {
  const [found, setFound] = useState<{ text: string; table: boolean } | null>(null)
  const possible = text !== null && text.includes('|')
  useEffect(() => {
    if (!possible || text === null) return
    let active = true
    // The answer renderer loads the same Markdown reader, so this adds no download of its own.
    import('@/lib/rich-answer').then(module => { if (active) setFound({ text, table: module.tableRowsFromMarkdown(text).length > 0 }) }).catch(() => undefined)
    return () => { active = false }
  }, [possible, text])
  return possible && found?.text === text && found.table
}
