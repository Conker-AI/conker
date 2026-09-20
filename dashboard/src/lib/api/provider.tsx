import { useEffect, type ReactNode } from "react"
import { useConkerStore } from "./store"
import { Button } from "@/components/ui/button"
import { conkerClient } from "./index"

export function DataProvider({ children }: { children: ReactNode }) {
  const { data, error, load } = useConkerStore()
  useEffect(() => { void load() }, [load])
  useEffect(() => conkerClient.toolWorkspace.subscribe(() => { void load() }), [load])
  if (!data) return <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
    {error ? <><p role="alert">{error}</p><Button onClick={() => void load()}>Retry</Button></> : <p role="status">Loading your dashboard…</p>}
  </main>
  return children
}
