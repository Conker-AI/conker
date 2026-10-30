import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; onDispatch?: () => void }
type Receipt = { id: string; operation: string; arguments: Record<string, string>; argumentsDigest: string; source: 'ui' | 'cli'; startedAt: string; endedAt: string | null; outcome: 'working' | 'done' | 'failed' | 'unknown'; reason: string | null; check: { operation: string; arguments: Record<string, string> } | null }

/**
 * Preview-only host helper (ADR-0014) for the Server screens, in the helper's exact shapes. Pick a
 * state with `?preview-host=`: first-use, same-disk, unmounted, unavailable, docker, held, busy,
 * refused, lost, unknown, failed, working. Actions finish after a few seconds; nothing leaves the tab.
 */
export function createFakeHostOps(scenario: string | null) {
  const minute = 60_000, hour = 60 * minute, day = 24 * hour, start = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
  const snapshot = (ms: number, tag: string) => ({ name: `snapshot-${iso(ms).replace(/[-:]/g, '').replace(/Z$/, '')}Z-${tag}`, createdAt: iso(ms) })
  const up = start - 3 * day - 2 * hour
  const service = (name: string, health: string, restarts = 0, oneShot = false) => ({ service: name, state: oneShot ? 'exited' : 'running', health, startedAt: oneShot ? null : iso(up), restarts, oneShot })
  const services: Json[] = [
    service('data-owner', 'none', 0, true), service('embeddings', 'healthy'), service('gateway', 'healthy'), service('memorygate', 'healthy'),
    service('ollama', 'none'), service('pi', 'healthy'), service('postgres', 'healthy'), service('qdrant', 'none'),
    service('searxng', 'none', 2), service('systemgate', 'healthy'), service('toolgate', 'healthy'),
  ]
  const snapshots = [snapshot(start - 21 * hour, '3f2a91c0'), snapshot(start - 4 * day, '9b17e4d2'), snapshot(start - 9 * day, '0c55a7e1')]
  const digest = (seed: string) => [...seed.padEnd(64, '0')].map(character => (character.charCodeAt(0) % 16).toString(16)).join('').slice(0, 64)
  const CUT_OFF = 'This was cut off before it finished, so it may or may not have happened. Check before trying again.'
  const failure: Record<string, string> = {
    'services.restart': 'The service did not restart. Check its status and logs, then try again.',
    'backup.verify': 'This backup did not pass its check. Do not rely on it; take a new backup.',
    'backup.run': 'The backup did not finish. Check that the backup disk is mounted and has space, then try again.',
  }
  const checks: Record<string, string> = { 'services.restart': 'services.status', 'backup.run': 'backup.list', 'backup.verify': 'backup.verify' }
  const receipt = (id: string, operation: string, args: Record<string, string>, source: 'ui' | 'cli', started: number, outcome: Receipt['outcome'], ended: number | null): Receipt => ({
    id, operation, arguments: args, argumentsDigest: digest(id), source, startedAt: iso(started), endedAt: ended === null ? null : iso(ended), outcome,
    reason: outcome === 'failed' ? failure[operation] : outcome === 'unknown' ? CUT_OFF : null,
    check: outcome === 'unknown' ? { operation: checks[operation], arguments: operation === 'backup.verify' ? args : {} } : null,
  })
  const journal: Receipt[] = [
    receipt('ui_preview_backup_yesterday', 'backup.run', {}, 'ui', start - 21 * hour, 'done', start - 21 * hour + 6 * minute),
    receipt('cli-preview-restart-pi', 'services.restart', { service: 'pi' }, 'cli', start - 2 * day, 'done', start - 2 * day + minute),
  ]
  if (scenario === 'unknown') journal.unshift(
    receipt('ui_preview_backup_cut_off', 'backup.run', {}, 'ui', start - 3 * hour, 'unknown', start - 3 * hour + 4 * minute),
    receipt('ui_preview_restart_cut_off', 'services.restart', { service: 'memorygate' }, 'ui', start - 20 * minute, 'unknown', start - 19 * minute),
  )
  if (scenario === 'failed') {
    Object.assign(services[8], { state: 'exited', startedAt: null, health: 'none' })
    journal.unshift(receipt('ui_preview_verify_failed', 'backup.verify', { snapshot: snapshots[1].name }, 'ui', start - 2 * hour, 'failed', start - 2 * hour + 3 * minute),
      receipt('ui_preview_restart_failed', 'services.restart', { service: 'searxng' }, 'ui', start - 15 * minute, 'failed', start - 14 * minute))
  }
  // A backup started on the server's command line, still copying.
  const running = new Map<string, { finishAt: number; outcome: Receipt['outcome']; pausedUntil?: number }>()
  if (scenario === 'working') {
    journal.unshift(receipt('cli-preview-backup-running', 'backup.run', {}, 'cli', start - 2 * minute, 'working', null))
    running.set('cli-preview-backup-running', { finishAt: start + 25_000, outcome: 'done' })
  }
  const policy = scenario === 'first-use' ? null : { destination: scenario === 'same-disk' ? '/opt/conker/backups' : '/mnt/backup/conker', retentionCopies: 7 }

  const fail = (status: number, code?: string, detail?: string): never => {
    throw new GatewayError(status >= 500 ? 'dependency' : 'http', status, undefined, code as never, detail)
  }
  const settle = () => {
    for (const row of journal) {
      const job = running.get(row.id)
      if (!job || Date.now() < job.finishAt) continue
      running.delete(row.id)
      Object.assign(row, { outcome: job.outcome, endedAt: iso(Date.now()), reason: job.outcome === 'failed' ? failure[row.operation] : null })
      if (job.outcome !== 'done') continue
      if (row.operation === 'services.restart') Object.assign(services.find(item => item.service === row.arguments.service) ?? {}, { state: 'running', startedAt: iso(Date.now()), health: 'healthy' })
      if (row.operation === 'backup.run') { snapshots.unshift(snapshot(Date.parse(row.startedAt), Math.random().toString(16).slice(2, 10).padEnd(8, '0'))); snapshots.splice(policy?.retentionCopies ?? 7) }
    }
  }
  const status = () => {
    settle()
    const restarting = new Set(journal.filter(row => row.outcome === 'working' && row.operation === 'services.restart').map(row => row.arguments.service))
    return { services: services.map(row => restarting.has(String(row.service)) ? { ...row, state: 'restarting', health: 'starting', startedAt: null } : structuredClone(row)), backupLock: scenario === 'held' || journal.some(row => row.outcome === 'working' && row.operation === 'backup.run'), recoveryHeld: false }
  }
  const backups = () => {
    settle()
    const lock = scenario === 'held' || journal.some(row => row.outcome === 'working' && row.operation === 'backup.run')
    if (!policy) return { destination: null, retentionCopies: null, ready: false, separateDisk: null, freeBytes: null, snapshots: [], partialSnapshots: 0, backupLock: lock, recoveryHeld: false }
    const ready = scenario !== 'unmounted'
    return { ...policy, ready, separateDisk: ready ? scenario !== 'same-disk' : null, freeBytes: ready ? (scenario === 'same-disk' ? 41.6e9 : 3.62e12) : null,
      snapshots: ready ? structuredClone(snapshots) : [], partialSnapshots: scenario === 'unknown' && ready ? 1 : 0, backupLock: lock, recoveryHeld: false }
  }

  return function handle(path: string, options: Request): Json {
    const method = options.method ?? 'GET'
    if (scenario === 'unavailable') fail(503)
    if (path === '/api/host/read' && method === 'POST') {
      const operation = options.body?.operation
      if (scenario === 'docker' && operation === 'services.status') fail(503, 'host_unavailable', 'Docker did not answer.')
      if (operation === 'services.status') return { operation, result: status() }
      if (operation === 'backup.list') return { operation, result: backups() }
      return fail(422, 'invalid_host_operation', 'This server read is not allowed.')
    }
    if (path === '/api/host/ops' && method === 'GET') { settle(); return { schemaVersion: 1, operations: structuredClone(journal), damagedRecords: 0 } }
    const one = path.match(/^\/api\/host\/ops\/([A-Za-z0-9_.:-]{16,128})$/)
    if (one && method === 'GET') {
      settle()
      const row = journal.find(item => item.id === one[1])
      if (!row) return fail(404, 'unknown_operation_id')
      // A backup pauses Conker: the page can't reach the server for a while.
      const job = running.get(row.id)
      if (job?.pausedUntil && Date.now() < job.pausedUntil) fail(503)
      return structuredClone(row)
    }
    if (path === '/api/host/ops' && method === 'POST') {
      options.onDispatch?.()
      const body = options.body ?? {}, operation = String(body.operation), args = (body.arguments ?? {}) as Record<string, string>, id = String(body.id)
      const existing = journal.find(item => item.id === id)
      if (existing) return structuredClone(existing)
      settle()
      if (scenario === 'busy' || journal.some(row => row.outcome === 'working')) fail(409, 'host_busy', 'Another server action is running. Wait for it to finish.')
      if (scenario === 'refused') fail(409, 'host_operation_refused', operation === 'services.restart' ? 'This installation has no service with that name.' : 'The backup folder is not there. Check that the disk is mounted.')
      if (scenario === 'held') fail(409, 'host_busy', 'A backup is running or was cut off. Check the backup folder before trying again.')
      if (operation !== 'services.restart' && !policy) fail(409, 'host_operation_refused', 'No backup folder is saved yet. Choose one in setup first.')
      const created = receipt(id, operation, args, 'ui', Date.now(), 'working', null)
      journal.unshift(created)
      const seconds = operation === 'backup.run' ? 14 : operation === 'backup.verify' ? 6 : 5
      running.set(id, { finishAt: Date.now() + seconds * 1000, outcome: scenario === 'failed' ? 'failed' : 'done', pausedUntil: operation === 'backup.run' ? Date.now() + 8000 : undefined })
      // The answer is lost on the way back, though the server recorded it.
      if (scenario === 'lost') throw new GatewayError('network')
      return structuredClone(created)
    }
    return fail(404)
  }
}
