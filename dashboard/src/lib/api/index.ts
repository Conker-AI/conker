import type { ConkerClient } from "./client"

// Composition owns the transport. Importing shared UI must never initialize sample data.
export let conkerClient: ConkerClient
export function installConkerClient(client: ConkerClient) { conkerClient = client }
export type * from "./client"
export type * from "./models"
