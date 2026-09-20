import { useConker } from "@/lib/api/store"
import { Navigate, useLocation, useParams } from "react-router-dom"
import { MessageCircle } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Conversation } from "./conversation"

export default function ChatDetailPage() {
  const sessions = useConker(data => data.sessions)
  const companionSessionId = useConker(data => data.companionSessionId)
  const { id } = useParams()
  const location = useLocation()
  const session = sessions.find(item => item.id === id)
  if (session?.id === companionSessionId) return <Navigate to={{ pathname: "/companion", search: location.search, hash: location.hash }} replace />
  if (session) return <BaseLayout variant="conversation"><Conversation key={session.id} session={session} /></BaseLayout>
  return (
    <BaseLayout title="Conversation not found">
      <Alert><MessageCircle /><AlertTitle>No matching conversation</AlertTitle><AlertDescription>This session is not in the preview. Use Chats in the appbar to choose an available conversation.</AlertDescription></Alert>
    </BaseLayout>
  )
}
