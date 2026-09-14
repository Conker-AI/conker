import { useEffect, useSyncExternalStore } from "react"
import { readAloud } from "@/lib/voice/read-aloud"

export function useReadAloud(key: string, text: string) {
  const activeKey = useSyncExternalStore(readAloud.subscribe, readAloud.getSnapshot, () => null)
  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) readAloud.stop(key) }
    document.addEventListener("visibilitychange", stopWhenHidden)
    return () => { document.removeEventListener("visibilitychange", stopWhenHidden); readAloud.stop(key) }
  }, [key, text])
  return {
    active: activeKey === key,
    supported: readAloud.supported(),
    toggle: (onError: (message: string) => void) => activeKey === key ? readAloud.stop(key) : readAloud.start(key, text, onError),
  }
}
