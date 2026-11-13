// Compile-time check: each dashboard wire schema must accept what Pi's OpenAPI says Pi sends, and the
// reverse. tsc -b fails on drift; nothing imports this file.
import type { paths } from './generated/pi'
import type { GatewayArtifactWire } from '../gateway/artifacts'
import type { GatewayHostInventory } from '../gateway/host-inventory'
import type { GatewayJob } from '../gateway/jobs'
import type { GatewayProject, GatewayProjectPage } from '../gateway/projects'
import type { GatewayTeam } from '../gateway/teams'

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
  projects: true satisfies Same<GatewayProjectPage, PiResponse<'/projects', 'get'>>,
  project: true satisfies Same<GatewayProject, PiResponse<'/projects/{identity}', 'get'>>,
  team: true satisfies Same<GatewayTeam, PiResponse<'/collaboration/teams/{identity}', 'get'>>,
  job: true satisfies Same<GatewayJob, PiResponse<'/jobs/{identity}', 'get'>>,
  inv: true satisfies Same<GatewayHostInventory, PiResponse<'/system/inventory', 'post'>>,
  art: true satisfies Same<GatewayArtifactWire, PiResponse<'/artifacts/{identity}', 'get'>>,
}
