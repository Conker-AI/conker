import "./phone.css"
import { runtimeMode } from "@/lib/runtime-mode"
import { trackKeyboard } from "./keyboard"
import { registerServiceWorker } from "./register"
import { reloadOnStaleBuild } from "./stale-build"
import { keepSharedItem } from "./share-target"
import { syncThemeColor } from "./theme-color"

/** Phone and installed-app behavior that lives outside React: keyboard, status bar color, offline support, sharing to Conker. */
export function startPwa() {
  keepSharedItem()
  trackKeyboard()
  syncThemeColor()
  if (import.meta.env.PROD && runtimeMode === "gateway") { registerServiceWorker(import.meta.env.BASE_URL); reloadOnStaleBuild() }
}
