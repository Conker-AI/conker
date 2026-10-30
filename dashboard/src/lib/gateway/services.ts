import { createGatewayTransport } from "./transport"
import { createGatewayAuthClient } from "./auth"
import { createGatewayAuthStore } from "./auth-store"
import { createGatewayFileTransfer } from "./file-transfer"
import { createGatewayVerificationStore } from "./verification"

// Same-origin cookie authority. No gate credentials or configurable network destination.
export function createGatewayServices() {
  const verification = createGatewayVerificationStore()
  // The transport checks this page's HTTPS origin first; files then go to that same origin.
  const transport = createGatewayTransport(), files = createGatewayFileTransfer(window.location.origin, globalThis.fetch.bind(globalThis))
  const auth = createGatewayAuthClient({ transport, files, verification })
  return { auth, verification, store: createGatewayAuthStore({ client: auth }) }
}
