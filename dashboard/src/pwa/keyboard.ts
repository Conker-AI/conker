/**
 * The on-screen keyboard. Android (with `interactive-widget=resizes-content` in index.html) shrinks
 * the page itself; iOS lays the keyboard over the page instead. There this keeps the app inside the
 * part of the screen the keyboard leaves visible, so the composer sits on top of the keyboard.
 */

// Rounding and toolbar animations differ by a few pixels; a keyboard or its accessory bar is larger.
const COVERED_MIN_PX = 40

export type ViewportReading = { layoutHeight: number; visualHeight: number; scale: number }

/** How many CSS pixels at the bottom of the page are covered, or 0 (also while zoomed in). */
export function keyboardInset({ layoutHeight, visualHeight, scale }: ViewportReading) {
  if (Math.abs(scale - 1) > 0.01) return 0
  const covered = layoutHeight - visualHeight
  return covered >= COVERED_MIN_PX ? Math.round(covered) : 0
}

/** Mirrors the visible area into `data-keyboard`, `--visual-height` and `--visual-top` (see phone.css). */
export function trackKeyboard(root: HTMLElement = document.documentElement, view: Window = window) {
  const viewport = view.visualViewport
  if (!viewport) return () => {}
  let frame = 0
  const apply = () => {
    frame = 0
    if (keyboardInset({ layoutHeight: view.innerHeight, visualHeight: viewport.height, scale: viewport.scale })) {
      root.dataset.keyboard = "open"
      root.style.setProperty("--visual-height", `${Math.round(viewport.height)}px`)
      root.style.setProperty("--visual-top", `${Math.round(viewport.offsetTop)}px`)
    } else if (root.dataset.keyboard) {
      delete root.dataset.keyboard
      root.style.removeProperty("--visual-height")
      root.style.removeProperty("--visual-top")
    }
  }
  const schedule = () => { if (!frame) frame = view.requestAnimationFrame(apply) }
  viewport.addEventListener("resize", schedule)
  viewport.addEventListener("scroll", schedule)
  apply()
  return () => {
    viewport.removeEventListener("resize", schedule)
    viewport.removeEventListener("scroll", schedule)
    if (frame) view.cancelAnimationFrame(frame)
  }
}
