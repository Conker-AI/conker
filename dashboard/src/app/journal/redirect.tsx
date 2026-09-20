import { Navigate, useLocation } from "react-router-dom"

export default function JournalRedirect() {
  const { search, hash } = useLocation()
  const params = new URLSearchParams(search)
  params.set("tab", "events")
  return <Navigate to={`/activity?${params.toString()}${hash}`} replace />
}
