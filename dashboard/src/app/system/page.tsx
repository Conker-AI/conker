import { BaseLayout } from "@/components/layouts/base-layout"
import { RouteSection } from "@/components/design-system"
import { usePageSection } from "@/hooks/use-page-navigation"
import { SystemOverview } from "./overview"
import { SystemTerminal } from "./terminal"
import { SystemFiles } from "./files"
import { SystemRuntime } from "./runtime"

export default function SystemPage() {
  const section = usePageSection()
  const workspace = section === "terminal" || section === "files"
  const runtime = section === "processes" || section === "ports" || section === "containers"
  const description = section === "terminal" ? "Your server, when you need to work directly."
    : section === "files" ? "Browse your project’s directory tree and copy paths."
    : runtime ? "Inspect sample processes, port bindings, and containers. Actions simulate changes in this tab."
    : "A clear picture of the machine. Configuration is not a health check."

  return <BaseLayout title="System" description={description} variant={workspace ? "workspace" : runtime ? "collection" : "page"}>
    <RouteSection value="overview"><SystemOverview /></RouteSection>
    <RouteSection value="processes"><SystemRuntime section="processes" /></RouteSection>
    <RouteSection value="ports"><SystemRuntime section="ports" /></RouteSection>
    <RouteSection value="containers"><SystemRuntime section="containers" /></RouteSection>
    <RouteSection value="terminal" variant="workspace"><SystemTerminal /></RouteSection>
    <RouteSection value="files" variant="workspace"><SystemFiles /></RouteSection>
  </BaseLayout>
}
