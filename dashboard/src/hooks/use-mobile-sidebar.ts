import { useCallback, useRef, useState } from "react"
import { createSidebarFocus } from "@/lib/sidebar-focus"

/** Conker's mobile sidebar: it opens from triggers outside the sheet, so it returns focus itself. */
export function useMobileSidebar() {
  const [openMobile, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const [focus] = useState(createSidebarFocus)
  /** `content` hands focus to the page after navigating instead of back to the opener. */
  const setOpenMobile = useCallback((next: boolean, destination?: "opener" | "content") => {
    focus.change(next, undefined, destination)
    setOpen(next)
  }, [focus])
  const toggleMobile = useCallback((opener?: HTMLElement) => {
    const next = !focus.isOpen()
    focus.change(next, opener)
    setOpen(next)
  }, [focus])
  const restoreMobileFocus = useCallback(() => focus.restore(() => wrapper.current), [focus])
  return { openMobile, setOpenMobile, toggleMobile, restoreMobileFocus, wrapper }
}

/** Conker is a client-only app, so the sidebar's saved state is read back from its cookie. */
export function savedSidebarOpen(name: string, fallback: boolean) {
  const saved = document.cookie.split("; ").find(cookie => cookie.startsWith(`${name}=`))?.split("=")[1]
  return saved === undefined ? fallback : saved === "true"
}
