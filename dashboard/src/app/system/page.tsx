import { BaseLayout } from "@/components/layouts/base-layout"
import { RouteSection } from "@/components/design-system"
import { usePageSection } from "@/hooks/use-page-navigation"
import { SystemOverview } from "./overview"
import { SystemTerminal } from "./terminal"
import { SystemFiles } from "./files"

export default function SystemPage() {
  const section = usePageSection()
  const workspace = section === "terminal" || section === "files"
  const description = section === "terminal" ? "Your server, when you need to work directly."
    : section === "files" ? "Browse your project’s directory tree and copy paths."
    : "A clear picture of the machine. Configuration is not a health check."

  return <BaseLayout title="System" description={description} variant={workspace ? "workspace" : "page"}>
    <RouteSection value="overview"><SystemOverview /></RouteSection>
    <RouteSection value="terminal" variant="workspace"><SystemTerminal /></RouteSection>
    <RouteSection value="files" variant="workspace"><SystemFiles /></RouteSection>
  </BaseLayout>
}
