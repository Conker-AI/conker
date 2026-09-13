import { useLocation } from "react-router-dom"
import { activePageSection, getPageNavigation, matchAppRoute } from "@/config/navigation"
import { useConker } from "@/lib/api/store"

export function usePageNavigation() {
  const { pathname, search } = useLocation()
  const data = useConker(snapshot => snapshot)
  return getPageNavigation(pathname, search, data)
}

export function usePageSection() {
  const { pathname, search } = useLocation()
  return activePageSection(matchAppRoute(pathname).key, search)
}
