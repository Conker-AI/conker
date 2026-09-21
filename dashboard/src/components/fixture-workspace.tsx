import { lazy, Suspense } from "react"
import { DataProvider } from "@/lib/api/provider"
import { AppRouter } from "@/components/router/app-router"
import { installConkerClient } from "@/lib/api"
import { createFixtureClient } from "@/lib/api/fixture-adapter"
import { browserVoiceInput } from "@/lib/voice/browser-voice-input"

installConkerClient({ ...createFixtureClient(), voiceInput: browserVoiceInput })

const CallHost = lazy(() => import("@/components/call/call-host"))

/** Preview composition is separate from authenticated server data. */
export default function FixtureWorkspace() {
  return <DataProvider><AppRouter /><Suspense fallback={null}><CallHost /></Suspense></DataProvider>
}
