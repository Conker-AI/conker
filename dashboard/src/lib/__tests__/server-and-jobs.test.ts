import { describe, expect, it } from 'vitest'
import type { HostBackupList, HostReceipt, HostService, HostServicesStatus } from '../gateway/host-ops'
import { jobIntervalHours, jobStarters, starterTiming } from '../job-starters'
import {
  UPDATE_EFFECT,
  actionCommand,
  backupPlace,
  bytes,
  describeHostAction,
  receiptSource,
  receiptTarget,
  receiptTime,
  receiptTitle,
  restartEffect,
  serviceFine,
  serviceJob,
  serviceLabel,
  serviceState,
  servicesSummary,
  snapshotLabel,
  snapshotTime,
  sortReceipts,
  span,
} from '../server-actions'

const service = (name: string, partial: Partial<HostService> = {}): HostService => ({ service: name, state: 'running', health: 'none', oneShot: false, startedAt: null, ...partial }) as unknown as HostService
const status = (...rows: HostService[]) => ({ services: rows }) as unknown as HostServicesStatus
const receipt = (partial: Record<string, unknown>) => ({ operation: 'services.restart', arguments: { service: 'pi' }, outcome: 'done', source: 'app', startedAt: '2026-01-01T10:00:00Z', endedAt: null, ...partial }) as unknown as HostReceipt
const SNAPSHOT = 'snapshot-20260102T030405Z-0a1b2c3d'

describe('job starters', () => {
  it('has unique, dash-separated ids and a name, summary and instructions each', () => {
    const ids = jobStarters.map(starter => starter.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const starter of jobStarters) {
      expect(starter.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
      expect(starter.name.trim()).not.toBe('')
      expect(starter.summary.trim()).not.toBe('')
      expect(starter.instructions.length).toBeGreaterThan(40)
    }
  })

  it('only asks for timings the New AI job form offers', () => {
    for (const { when } of jobStarters) {
      if (when.kind === 'hours') expect(jobIntervalHours).toContain(when.every)
      else expect(when.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      if (when.kind === 'weekly') expect(Number.isInteger(when.day) && when.day >= 0 && when.day <= 6).toBe(true)
    }
  })

  it('says what a starter needs only when it reads a tool the owner connects', () => {
    const needing = jobStarters.filter(starter => starter.needs).map(starter => starter.id)
    expect(needing).toEqual(expect.arrayContaining(['event-reminders', 'email-triage']))
    expect(jobStarters.find(starter => starter.id === 'morning-brief')?.needs).toBeUndefined()
  })

  it('turns a starter’s timing into what Pi stores', () => {
    expect(starterTiming({ kind: 'daily', time: '08:00' })).toEqual({ kind: 'daily', time: '08:00', day: 0, hours: 24 })
    expect(starterTiming({ kind: 'weekly', day: 1, time: '09:00' })).toEqual({ kind: 'weekly', time: '09:00', day: 1, hours: 24 })
    expect(starterTiming({ kind: 'hours', every: 4 })).toEqual({ kind: 'interval', time: '00:00', day: 0, hours: 4 })
  })
})

describe('server actions: services', () => {
  it('names a service in the owner’s words, with a readable fallback', () => {
    expect(serviceLabel('pi')).toBe('Chat engine')
    expect(serviceLabel('memorygate')).toBe('Memory')
    expect(serviceLabel('mystery')).toBe('Mystery')
    expect(serviceJob('toolgate')).toBe('Runs tools and checks what they may do.')
    expect(serviceJob('mystery')).toBeNull()
  })

  it('says what a restart pauses, with a general line for services without a note', () => {
    expect(restartEffect('pi')).toBe('It stops and starts again, usually within a minute. Chats and jobs stop until it is back; a reply being written may be cut off.')
    expect(restartEffect('searxng')).toContain('What Web search does pauses until it is back.')
  })

  it('calls a running service fine unless it is unhealthy, and a one-shot fine unless dead', () => {
    expect(serviceFine(service('pi'))).toBe(true)
    expect(serviceFine(service('pi', { health: 'healthy' }))).toBe(true)
    expect(serviceFine(service('pi', { health: 'unhealthy' }))).toBe(false)
    expect(serviceFine(service('pi', { state: 'exited' }))).toBe(false)
    expect(serviceFine(service('data-owner', { oneShot: true, state: 'exited' }))).toBe(true)
    expect(serviceFine(service('data-owner', { oneShot: true, state: 'dead' }))).toBe(false)
  })

  it('describes a service’s state, health and uptime', () => {
    const now = Date.parse('2026-01-01T12:00:00Z')
    expect(serviceState(service('pi', { health: 'healthy', startedAt: '2026-01-01T10:00:00Z' }), now)).toBe('Running · Healthy · up 2 hours')
    expect(serviceState(service('pi', { health: 'unhealthy' }), now)).toBe('Running · Not healthy')
    expect(serviceState(service('pi', { health: 'starting', state: 'restarting' }), now)).toBe('Restarting · Starting up')
    expect(serviceState(service('pi', { state: 'exited', startedAt: '2026-01-01T10:00:00Z' }), now)).toBe('Stopped')
    expect(serviceState(service('data-owner', { oneShot: true, state: 'exited' }), now)).toBe('Ran when Conker started')
    expect(serviceState(service('data-owner', { oneShot: true, state: 'dead' }), now)).toBe('Stopped')
  })

  it('writes spans as minutes, hours and days', () => {
    expect(span(0)).toBe('1 min')
    expect(span(5 * 60000)).toBe('5 min')
    expect(span(59 * 60000)).toBe('59 min')
    expect(span(60 * 60000)).toBe('1 hour')
    expect(span(5 * 3600000)).toBe('5 hours')
    expect(span(47 * 3600000)).toBe('47 hours')
    expect(span(72 * 3600000)).toBe('3 days')
  })

  it('writes sizes in decimal units', () => {
    expect(bytes(0)).toBe('0 bytes')
    expect(bytes(999)).toBe('999 bytes')
    expect(bytes(1500)).toMatch(/^1[.,]5 KB$/)
    expect(bytes(25_000_000)).toBe('25 MB')
    expect(bytes(3_200_000_000)).toMatch(/^3[.,]2 GB$/)
    expect(bytes(2e15)).toMatch(/ TB$/)
  })
})

describe('server actions: the services summary', () => {
  const up = (name: string) => service(name)
  const down = (name: string) => service(name, { state: 'exited' })

  it('says all are running, or how many are fine and which need a look', () => {
    expect(servicesSummary(status())).toBe('No services are running in this install.')
    expect(servicesSummary(status(service('data-owner', { oneShot: true })))).toBe('No services are running in this install.')
    expect(servicesSummary(status(up('pi'), up('gateway'), service('data-owner', { oneShot: true })))).toBe('All 2 services are running.')
    expect(servicesSummary(status(up('pi'), down('toolgate')))).toBe('1 of 2 services are running fine. Tools needs a look.')
    expect(servicesSummary(status(up('pi'), down('toolgate'), down('postgres')))).toBe('1 of 3 services are running fine. Tools and Memory storage need a look.')
    expect(servicesSummary(status(up('pi'), down('toolgate'), down('postgres'), down('qdrant')))).toContain('Tools, Memory storage and Memory search need a look.')
  })

  it('treats a service being restarted as busy, whatever its last read state was', () => {
    expect(servicesSummary(status(down('pi')), ['pi'])).toBe('Restarting Chat engine…')
    expect(servicesSummary(status(down('pi'), up('gateway')), ['pi'])).toBe('Restarting Chat engine… The other service is running.')
    expect(servicesSummary(status(down('pi'), up('gateway'), up('toolgate')), ['pi'])).toBe('Restarting Chat engine… The other 2 services are running.')
    expect(servicesSummary(status(up('pi'), up('gateway'), down('toolgate')), ['pi'])).toBe('Restarting Chat engine… 1 of the other 2 are running fine. Tools needs a look.')
    expect(servicesSummary(status(up('pi'), down('gateway')), ['pi'])).toBe('Restarting Chat engine… Dashboard needs a look.')
    expect(servicesSummary(status(up('pi'), up('gateway')), ['pi', 'gateway'])).toBe('Restarting Chat engine and Dashboard…')
  })
})

describe('server actions: backups', () => {
  it('says what each backup place does and does not protect against', () => {
    const place = (separateDisk: boolean | null | undefined) => backupPlace({ separateDisk } as unknown as HostBackupList)
    expect(place(true).title).toBe('On a second disk in this computer')
    expect(place(true).protects).toBe('Survives the system disk failing.')
    expect(place(false).title).toBe('On the same disk as Conker')
    expect(place(false).risk).toContain('same disk')
    expect(place(null)).toEqual({ title: 'Backup folder', protects: null, risk: 'Same computer: lost if this PC dies.' })
  })

  it('names a snapshot by its time and falls back for an odd name', () => {
    expect(snapshotLabel(SNAPSHOT)).toMatch(/^the backup from .+/)
    expect(snapshotLabel(SNAPSHOT)).not.toContain('Invalid')
    expect(snapshotTime('2026-01-02T03:04:05Z')).toBe(snapshotLabel(SNAPSHOT).replace('the backup from ', ''))
    expect(snapshotLabel('backup-old')).toBe('this backup')
    expect(snapshotLabel('')).toBe('this backup')
  })
})

describe('server actions: receipts', () => {
  it('titles a receipt by operation and outcome', () => {
    expect(receiptTitle(receipt({ outcome: 'working' }))).toBe('Restarting Chat engine…')
    expect(receiptTitle(receipt({ outcome: 'done' }))).toBe('Restarted Chat engine')
    expect(receiptTitle(receipt({ outcome: 'failed' }))).toBe('Chat engine didn’t restart')
    expect(receiptTitle(receipt({ outcome: 'unknown' }))).toBe('Can’t tell if Chat engine restarted')
    expect(receiptTitle(receipt({ operation: 'backup.run', arguments: {}, outcome: 'done' }))).toBe('Backed up and checked')
    expect(receiptTitle(receipt({ operation: 'backup.run', arguments: {}, outcome: 'unknown' }))).toBe('Can’t tell if the backup finished')
    expect(receiptTitle(receipt({ operation: 'backup.verify', arguments: { snapshot: 'odd' }, outcome: 'done' }))).toBe('This backup passed its check')
    expect(receiptTitle(receipt({ operation: 'backup.verify', arguments: { snapshot: 'odd' }, outcome: 'failed' }))).toBe('This backup didn’t pass its check')
    expect(receiptTitle(receipt({ operation: 'update.run', arguments: { version: '0.3.0' }, outcome: 'done' }))).toBe('Updated to 0.3.0')
    expect(receiptTitle(receipt({ operation: 'update.run', arguments: { version: '0.3.0' }, outcome: 'failed' }))).toBe('The update to 0.3.0 didn’t finish')
    expect(receiptTitle(receipt({ operation: 'disk.trim', arguments: {}, outcome: 'failed' }))).toBe('disk.trim failed')
  })

  it('titles a restart without a service name generically', () => {
    expect(receiptTitle(receipt({ arguments: {}, outcome: 'done' }))).toBe('Restarted Service')
  })

  it('says where a receipt came from and which time it is about', () => {
    expect(receiptSource(receipt({ source: 'cli' }))).toBe('from the server’s command line')
    expect(receiptSource(receipt({ source: 'app' }))).toBe('from this app')
    expect(receiptTime(receipt({ endedAt: '2026-01-01T10:05:00Z' }))).toBe('2026-01-01T10:05:00Z')
    expect(receiptTime(receipt({}))).toBe('2026-01-01T10:00:00Z')
  })

  it('names the target of each action so a screen can find its receipt', () => {
    expect(receiptTarget(receipt({}))).toBe('service:pi')
    expect(receiptTarget(receipt({ operation: 'backup.verify', arguments: { snapshot: SNAPSHOT } }))).toBe(`snapshot:${SNAPSHOT}`)
    expect(receiptTarget(receipt({ operation: 'backup.run', arguments: {} }))).toBe('backup')
    expect(receiptTarget(receipt({ operation: 'update.run', arguments: { version: '1.0.0' } }))).toBe('update')
    expect(receiptTarget(receipt({ operation: 'other.op', arguments: {} }))).toBe('other.op')
  })

  it('shows what is live first, then what needs a look, each newest first, without changing the input', () => {
    const rows = [
      receipt({ outcome: 'done', startedAt: '2026-01-03T00:00:00Z' }),
      receipt({ outcome: 'failed', startedAt: '2026-01-01T00:00:00Z' }),
      receipt({ outcome: 'unknown', startedAt: '2026-01-02T00:00:00Z' }),
      receipt({ outcome: 'working', startedAt: '2026-01-01T00:00:00Z' }),
      receipt({ outcome: 'done', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-04T00:00:00Z' }),
      receipt({ outcome: 'failed', startedAt: '2026-01-02T00:00:00Z' }),
    ]
    const before = [...rows]
    expect(sortReceipts(rows).map(row => `${row.outcome}@${receiptTime(row).slice(0, 10)}`)).toEqual(['working@2026-01-01', 'unknown@2026-01-02', 'failed@2026-01-02', 'failed@2026-01-01', 'done@2026-01-04', 'done@2026-01-03'])
    expect(rows).toEqual(before)
  })

  it('gives the command that does the same on the server', () => {
    expect(actionCommand(receipt({}))).toBe('conker ops run services.restart service=pi')
    expect(actionCommand(receipt({ operation: 'backup.verify', arguments: { snapshot: SNAPSHOT } }))).toBe(`conker ops run backup.verify snapshot=${SNAPSHOT}`)
    expect(actionCommand(receipt({ operation: 'backup.run', arguments: {} }))).toBe('conker ops run backup.run')
    expect(actionCommand(receipt({ operation: 'update.run', arguments: { version: '1.2.3' } }))).toBe('conker update --to 1.2.3')
    expect(actionCommand(receipt({ operation: 'anything', arguments: {} }))).toBe('conker ops list')
  })
})

describe('server actions: the password sheet', () => {
  it('describes a restart in the owner’s words', () => {
    const sheet = describeHostAction({ operation: 'services.restart', arguments: { service: 'toolgate' } })
    expect(sheet).toMatchObject({ title: 'Restart Tools', target: 'Tools (toolgate) on your server', action: 'Restart Tools' })
    expect(sheet?.details[0]).toContain('Tools stop until it is back')
    expect(sheet?.details[1]).toContain('never sent again by itself')
  })

  it('describes a backup, a backup check and an update', () => {
    expect(describeHostAction({ operation: 'backup.run' })).toMatchObject({ title: 'Back up now', action: 'Back up now' })
    const check = describeHostAction({ operation: 'backup.verify', arguments: { snapshot: SNAPSHOT } })
    expect(check).toMatchObject({ title: 'Check this backup', action: 'Check backup' })
    expect(check?.target).toMatch(/^The backup from /)
    const update = describeHostAction({ operation: 'update.run', arguments: { version: '1.2.3' } })
    expect(update).toMatchObject({ title: 'Update Conker to 1.2.3', action: 'Update to 1.2.3' })
    expect(update?.details[0]).toBe(UPDATE_EFFECT)
  })

  it('refuses to describe anything it does not recognise or that is malformed', () => {
    expect(describeHostAction({})).toBeNull()
    expect(describeHostAction({ operation: 'disk.wipe' })).toBeNull()
    expect(describeHostAction({ operation: 'services.restart', arguments: { service: 'Pi; rm -rf' } })).toBeNull()
    expect(describeHostAction({ operation: 'services.restart', arguments: { service: 7 } })).toBeNull()
    expect(describeHostAction({ operation: 'services.restart', arguments: ['pi'] })).toBeNull()
    expect(describeHostAction({ operation: 'backup.verify', arguments: { snapshot: '../etc' } })).toBeNull()
    expect(describeHostAction({ operation: 'update.run', arguments: { version: '1.2' } })).toBeNull()
    expect(describeHostAction({ operation: 'update.run', arguments: { version: '1.2.3-beta' } })).toBeNull()
  })
})
