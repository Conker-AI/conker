/** Two opaque frames: the trusted wrapper's frame-src policy also governs child navigation. */
export const ARTIFACT_HTML_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; font-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'"
export const ARTIFACT_HTML_SANDBOX = "allow-scripts"
export const ARTIFACT_HTML_PERMISSIONS = "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'"

function attribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** Source is confined to an escaped srcdoc attribute, never interpolated into host markup. */
export function artifactHtmlDocument(source: string): string {
  if (source.length > 200_000) throw new Error("HTML source must fit within 200,000 characters.")
  const policy = `<meta http-equiv="Content-Security-Policy" content="${attribute(ARTIFACT_HTML_CSP)}"><meta name="referrer" content="no-referrer">`
  const inner = `<!doctype html><html><head><meta charset="utf-8">${policy}<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{color-scheme:light dark;background:Canvas;color:CanvasText}</style></head><body>${source}</body></html>`
  return `<!doctype html><html><head><meta charset="utf-8">${policy}<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe title="HTML artifact content" sandbox="${ARTIFACT_HTML_SANDBOX}" allow="${attribute(ARTIFACT_HTML_PERMISSIONS)}" referrerpolicy="no-referrer" srcdoc="${attribute(inner)}"></iframe></body></html>`
}
