import { useEffect, useState } from "react"

const drafts = new Map<string, { value: unknown; revision?: number }>()

export function useCollaborationDraft<T>(key: string, initial: T, currentRevision?: number) {
  const [value, setValue] = useState<T>(() => structuredClone(drafts.get(key)?.value as T ?? initial))
  const [revision] = useState(drafts.get(key)?.revision ?? currentRevision)
  useEffect(() => { drafts.set(key, { value: structuredClone(value), revision }) }, [key, value, revision])
  const dirty = JSON.stringify(value) !== JSON.stringify(initial)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  return { value, setValue, revision, stale: revision !== currentRevision, clear: () => drafts.delete(key) }
}
