import "./phone.css"
import { runtimeMode } from "@/lib/runtime-mode"
import { trackKeyboard } from "./keyboard"
import { registerServiceWorker } from "./register"
import { syncThemeColor } from "./theme-color"

/** Phone and installed-app behavior that lives outside React: keyboard, status bar color, offline support. */
export function startPwa() {
  trackKeyboard()
  syncThemeColor()
  if (import.meta.env.PROD && runtimeMode === "gateway") registerServiceWorker(import.meta.env.BASE_URL)
}
