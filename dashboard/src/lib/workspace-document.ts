import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react'

export type DocumentChapter = { id: string; title: string; element: HTMLElement }
export const DocumentIndexContext = createContext<{ register: (chapter: DocumentChapter) => () => void } | null>(null)

/** Register real mounted content, excluding the contents of portaled task dialogs. */
export function useDocumentSection(title: string) {
  const id = useId()
  const ref = useRef<HTMLElement>(null)
  const register = useContext(DocumentIndexContext)?.register
  useLayoutEffect(() => {
    if (register && ref.current && title && !ref.current.closest('[role="dialog"], [role="alertdialog"]')) return register({ id, title, element: ref.current })
  }, [id, register, title])
  return { id, ref }
}
