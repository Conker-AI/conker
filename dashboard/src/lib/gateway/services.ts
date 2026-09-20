import { createGatewayTransport } from "./transport"
import { createGatewayAuthClient } from "./auth"
import { createGatewayAuthStore } from "./auth-store"

// Same-origin cookie authority. No gate credentials or configurable network destination.
export function createGatewayServices() {
  const auth = createGatewayAuthClient({ transport: createGatewayTransport() })
  return { auth, store: createGatewayAuthStore({ client: auth }) }
}
