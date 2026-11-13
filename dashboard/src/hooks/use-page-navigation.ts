import { useLocation } from "react-router-dom"
import { activePageSection, matchAppRoute } from "@/config/navigation"

export function usePageSection() {
  const { pathname, search } = useLocation()
  return activePageSection(matchAppRoute(pathname).key, search)
}
