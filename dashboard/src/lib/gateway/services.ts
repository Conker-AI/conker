import { createGatewayTransport } from "./transport"
import { createGatewayAuthClient } from "./auth"
import { createGatewayAuthStore } from "./auth-store"
import { createGatewayVerificationStore } from "./verification"

// Same-origin cookie authority. No gate credentials or configurable network destination.
export function createGatewayServices() {
  const verification = createGatewayVerificationStore()
  const auth = createGatewayAuthClient({ transport: createGatewayTransport(), verification })
  return { auth, verification, store: createGatewayAuthStore({ client: auth }) }
}
