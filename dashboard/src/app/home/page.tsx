import { BaseLayout } from "@/components/layouts/base-layout"
import { Conversation } from "@/app/chat/conversation"
import { sessions } from "@/app/chat/data"
export default function HomePage() {
  return <BaseLayout title="Home" description="Your day, with a little room left in it."><div className="px-4 lg:px-6"><Conversation session={sessions[0]} /></div></BaseLayout>
}

