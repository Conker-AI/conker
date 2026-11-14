// Compile-time check: each dashboard wire schema must accept what Pi's OpenAPI says Pi sends, and the
// reverse. tsc -b fails on drift; nothing imports this file.
import type { paths } from './generated/pi'
import type { GatewayArtifactWire } from '../gateway/artifacts'
import type { GatewayHostInventory } from '../gateway/host-inventory'
import type { GatewayJob } from '../gateway/jobs'
import type { GatewayProject, GatewayProjectPage } from '../gateway/projects'
import type { GatewayTeam } from '../gateway/teams'
import type { GatewayDirectory } from '../gateway/filesystem'
import type { GatewayCall, GatewayCallAudioTurn, GatewayCallAvailability } from '../gateway/calls'
import type { AgentProfile, SetupChoice, SetupModelOptions, SetupProtectionPolicy, SetupReceipt, SetupRehearsal, SetupStatus } from '../gateway/control'
import type { GatewayConfiguredTargets } from '../gateway/host-inventory'
import type { GatewayAgentNote } from '../gateway/jobs'
import type { MemoryUpkeepPage } from '../gateway/memory-care'

type Ok<R> = R[Extract<keyof R, 200 | 201 | 202>]
type Json<R> = R extends { content: { 'application/json': infer J } } ? J : never
/** The JSON body Pi answers a route with, from the generated OpenAPI types. */
type PiResponse<P extends keyof paths, M extends keyof paths[P]> =
  paths[P][M] extends { responses: infer R } ? Json<Ok<R>> : never

/** Pydantic always sends fields with defaults, though the generator marks them optional; strict wire schemas may also leave fields optional. */
type Sent<T> = T extends readonly (infer U)[] ? Sent<U>[]
  : T extends object ? { [K in keyof T]-?: Sent<Exclude<T[K], undefined>> } : T

/** Each side accepts the other: Pi's reply fits the dashboard schema and nothing the schema needs is missing from Pi. */
type Same<A, B> = [Sent<A>] extends [Sent<B>] ? ([Sent<B>] extends [Sent<A>] ? true : false) : false

export const piWire = {
  memoryUpkeep: true satisfies Same<MemoryUpkeepPage, PiResponse<'/memory/upkeep', 'get'>>,
  projects: true satisfies Same<GatewayProjectPage, PiResponse<'/projects', 'get'>>,
  project: true satisfies Same<GatewayProject, PiResponse<'/projects/{identity}', 'get'>>,
  team: true satisfies Same<GatewayTeam, PiResponse<'/collaboration/teams/{identity}', 'get'>>,
  job: true satisfies Same<GatewayJob, PiResponse<'/jobs/{identity}', 'get'>>,
  inv: true satisfies Same<GatewayHostInventory, PiResponse<'/system/inventory', 'post'>>,
  art: true satisfies Same<GatewayArtifactWire, PiResponse<'/artifacts/{identity}', 'get'>>,
  listing: true satisfies Same<GatewayDirectory, PiResponse<'/system/files/listings', 'post'>>,
  call: true satisfies Same<GatewayCall, PiResponse<'/calls/browser', 'post'>>,
  callAudio: true satisfies Same<GatewayCallAudioTurn, PiResponse<'/calls/browser/{identity}/audio', 'post'>>,
  callAvailable: true satisfies Same<GatewayCallAvailability, PiResponse<'/calls/browser/capabilities', 'get'>>,
  setup: true satisfies Same<SetupStatus, PiResponse<'/setup/status', 'get'>>,
  setupReceipt: true satisfies Same<SetupReceipt, PiResponse<'/setup/receipts/{step}', 'get'>>,
  setupChoice: true satisfies Same<SetupChoice, PiResponse<'/setup/choices/{step}', 'get'>>,
  setupProtection: true satisfies Same<SetupProtectionPolicy, PiResponse<'/setup/protection', 'get'>>,
  setupModels: true satisfies Same<SetupModelOptions, PiResponse<'/setup/models', 'get'>>,
  rehearsal: true satisfies Same<SetupRehearsal, PiResponse<'/setup/rehearsal', 'get'>>,
  agent: true satisfies Same<AgentProfile, PiResponse<'/agents/{identity}', 'get'>>,
  targets: true satisfies Same<GatewayConfiguredTargets, PiResponse<'/system/inventory/configured/services', 'get'>>,
  notes: true satisfies Same<GatewayAgentNote, PiResponse<'/jobs/agent/notes', 'get'>['results'][number]>,
}
