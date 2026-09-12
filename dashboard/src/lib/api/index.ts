import type { ConkerClient } from "./client"
import { createFixtureClient } from "./fixture-adapter"

// The only composition point. Install an HTTP implementation here when contracts exist.
export const conkerClient: ConkerClient = createFixtureClient()
export type * from "./client"
export type * from "./models"
