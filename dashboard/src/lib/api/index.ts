import type { ConkerClient } from "./client"
import { createFixtureClient } from "./fixture-adapter"
import { browserVoiceInput } from "../voice/browser-voice-input"

// The only composition point. Install an HTTP implementation here when contracts exist.
export const conkerClient: ConkerClient = { ...createFixtureClient(), voiceInput: browserVoiceInput }
export type * from "./client"
export type * from "./models"
