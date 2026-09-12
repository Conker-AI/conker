import { useConker } from "@/lib/api/store"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Conversation } from "@/app/chat/conversation"
export default function HomePage() {
  const sessions = useConker(data => data.sessions)
  return (
    <BaseLayout
      title="Home"
      description="Your day, with a little room left in it."
    >
      <div className="">
        {sessions[0] ? <Conversation session={sessions[0]} /> : <p>No conversations yet.</p>}
      </div>
    </BaseLayout>
  )
}
