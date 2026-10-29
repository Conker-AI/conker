/**
 * The phone's status bar and app switcher take the color of the app's actual background, so they
 * follow the owner's theme choice (light, dark or a custom theme) rather than the system setting.
 */

/** Any CSS color the browser can paint, as #rrggbb; null if it cannot be read. */
export function hexColor(color: string, context: CanvasRenderingContext2D | null) {
  if (!context || !color) return null
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
  if (alpha === 0) return null
  return `#${[red, green, blue].map(value => value.toString(16).padStart(2, "0")).join("")}`
}

export function syncThemeColor(root: HTMLElement = document.documentElement) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) return () => {}
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  const apply = () => {
    const color = hexColor(getComputedStyle(document.body).backgroundColor, context)
    if (color && meta.content !== color) meta.content = color
  }
  // Theme, accent and custom-theme changes all land on the root element.
  const observer = new MutationObserver(apply)
  observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-accent", "data-theme"] })
  apply()
  return () => observer.disconnect()
}
