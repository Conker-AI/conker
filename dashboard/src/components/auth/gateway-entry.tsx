import { createGatewayOwnerClient } from '@/lib/gateway/owner'
import { createGatewayProposalClient } from '@/lib/gateway/proposals'
import { createGatewayOwnerState } from '@/components/gateway/owner-state'
import { createGatewayControlClient } from "@/lib/gateway/control"
import { GatewayBoundary } from "./gateway-boundary"
import { GatewayOperationVerification } from "./gateway-verification"
import { createGatewayServices } from "@/lib/gateway/services"
import { GatewayError } from "@/lib/gateway/transport"
import { PageHeader } from "@/components/design-system/primitives"
import { createGatewayRuntimeClient } from "@/lib/gateway/runtime"
import { GatewayWorkspace } from "@/components/gateway/workspace"
import { createGatewayRuntimeWorkspaceState } from "@/components/gateway/runtime-state"
import { createGatewayActivityWorkspaceState } from "@/components/gateway/activity-state"
import { bindGatewayWorkspaceReset } from "@/components/gateway/auth-workspace-reset"
import { createGatewayActivityClient } from "@/lib/gateway/activity"
import { createGatewaySourcePrivacyState } from "@/components/gateway/source-privacy"

// Create once per document, including React StrictMode mounts. Configuration failures stay visible.
const services = (() => {
  try {
    const value = createGatewayServices()
    const workspace = createGatewayRuntimeWorkspaceState()
    const activityState = createGatewayActivityWorkspaceState()
    const ownerState = createGatewayOwnerState()
    const sourcePrivacy = createGatewaySourcePrivacyState()
    bindGatewayWorkspaceReset(value.store, [workspace, activityState, sourcePrivacy, ownerState])
    return { value: { ...value, ownerState, owner: createGatewayOwnerClient(value.auth), proposals: createGatewayProposalClient(value.auth), control: createGatewayControlClient(value.auth), workspace, activityState, sourcePrivacy, activity: createGatewayActivityClient(value.auth), runtime: createGatewayRuntimeClient(value.auth) }, error: null }
  } catch (error) { return { value: null, error: error instanceof GatewayError ? error.message : "Gateway configuration could not be loaded." } }
})()

export default function GatewayEntry() {
  if (!services.value) return <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-foreground"><PageHeader title="Open Conker over HTTPS" /><p role="alert" className="max-w-lg text-center text-sm text-muted-foreground">{services.error} Open the configured HTTPS gateway address. No connection was attempted.</p></main>
  return <><GatewayBoundary store={services.value.store}><GatewayWorkspace owner={services.value.owner} proposals={services.value.proposals} ownerState={services.value.ownerState} control={services.value.control} authStore={services.value.store} runtime={services.value.runtime} activity={services.value.activity} conversationState={services.value.workspace} activityState={services.value.activityState} sourcePrivacy={services.value.sourcePrivacy} /></GatewayBoundary><GatewayOperationVerification store={services.value.verification} authStore={services.value.store} /></>
}
