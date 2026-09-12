import { Link, useParams } from "react-router-dom"
import { ArrowLeft, MessageCircle } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Conversation } from "./conversation"
import { sessions } from "./data"
export default function ChatDetailPage() {
  const { id } = useParams()
  const session = sessions.find((item) => item.id === id)
  return (
    <BaseLayout title={session?.title || "Conversation not found"}>
      <div className="flex flex-col gap-4 ">
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link to="/chat">
            <ArrowLeft />
            All chats
          </Link>
        </Button>
        {session ? (
          <Conversation key={session.id} session={session} />
        ) : (
          <Alert>
            <MessageCircle />
            <AlertTitle>No matching conversation</AlertTitle>
            <AlertDescription>
              This session is not in the fixture. Open All chats to choose an
              available conversation.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </BaseLayout>
  )
}
