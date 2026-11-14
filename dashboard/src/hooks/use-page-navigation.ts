import { useLocation } from "react-router-dom"
import { gatewayPageNavigation } from "@/components/gateway/navigation"

/** The tab a page shows, from the one navigation table the sidebar and header use. */
export function usePageSection() {
  const { pathname, search } = useLocation()
  return gatewayPageNavigation(pathname, search).activeSection
}
