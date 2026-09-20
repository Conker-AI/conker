import { GatewayBoundary } from "./gateway-boundary"
import { createGatewayServices } from "@/lib/gateway/services"
import { GatewayError } from "@/lib/gateway/transport"
import { PageHeader } from "@/components/design-system/primitives"
import { createGatewayRuntimeClient } from "@/lib/gateway/runtime"
import { GatewayRuntimeWorkspace } from "@/components/gateway/runtime-workspace"
import { createGatewayRuntimeWorkspaceState } from "@/components/gateway/runtime-state"

// Create once per document, including React StrictMode mounts. Configuration failures stay visible.
const services = (() => {
  try {
    const value = createGatewayServices()
    const workspace = createGatewayRuntimeWorkspaceState()
    let ownerSession: string | null = null
    value.store.subscribe(state => {
      // Brief same-session verification may unmount the UI, but retains drafts and uncertain-send locks.
      if (state.phase === "checking") return
      const next = state.phase === "authenticated" && !state.logoutUnconfirmed ? state.session?.sessionId ?? null : null
      if (next !== ownerSession || next === null) workspace.getState().reset()
      ownerSession = next
    })
    return { value: { ...value, workspace, runtime: createGatewayRuntimeClient(value.auth) }, error: null }
  } catch (error) { return { value: null, error: error instanceof GatewayError ? error.message : "Gateway configuration could not be loaded." } }
})()

export default function GatewayEntry() {
  if (!services.value) return <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-foreground"><PageHeader title="Open Conker over HTTPS" /><p role="alert" className="max-w-lg text-center text-sm text-muted-foreground">{services.error} Open the configured HTTPS gateway address. No connection was attempted.</p></main>
  return <GatewayBoundary store={services.value.store}><GatewayRuntimeWorkspace authStore={services.value.store} client={services.value.runtime} state={services.value.workspace} /></GatewayBoundary>
}
