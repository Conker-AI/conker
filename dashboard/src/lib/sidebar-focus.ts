/** The mobile sidebar has external triggers, so Base UI cannot infer its return target. */
export function createSidebarFocus() {
  let open = false, generation = 0, href = '', destination: 'opener' | 'content' = 'opener'
  let opener: HTMLElement | null = null
  const usable = (element: HTMLElement | null): element is HTMLElement => Boolean(element?.isConnected && element !== document.body && !element.matches(':disabled') && !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length)
  return {
    isOpen: () => open,
    change(next: boolean, target?: HTMLElement, focus: 'opener' | 'content' = 'opener') {
      if (next && !open) {
        opener = target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
        href = window.location.href; destination = 'opener'
      } else if (!next && focus === 'content') destination = 'content'
      if (open !== next) generation++
      open = next
    },
    /** Base UI `finalFocus`: always returns false because focus is moved here, a frame later. */
    restore(root: () => HTMLElement | null): false {
      const ticket = generation, wrapper = root()
      requestAnimationFrame(() => {
        if (ticket !== generation || open || !wrapper?.isConnected || root() !== wrapper) return
        // Search or another dialog may own focus after this sidebar closes.
        const dialog = document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]')
        if (dialog) {
          if (usable(opener) && dialog.contains(opener) && !dialog.contains(document.activeElement)) opener.focus({ preventScroll: true })
          return
        }
        const content = wrapper.querySelector<HTMLElement>('[data-slot="sidebar-inset"]')
        const target = destination === 'content' || window.location.href !== href ? content : usable(opener) ? opener : content
        if (usable(target)) target.focus({ preventScroll: true })
      })
      return false
    },
  }
}
