import type { HostBackupList, HostReceipt, HostService, HostServicesStatus } from './gateway/host-ops'

/**
 * Plain words for the server's services, backups and the receipts of server actions: one source
 * for the Server screens and the password sheet, so a restart reads the same everywhere.
 */
const names: Record<string, string> = {
  pi: 'Pi', gateway: 'Web access', memorygate: 'Memory', toolgate: 'Tools', postgres: 'Memory database',
  qdrant: 'Memory search', embeddings: 'Meaning search', ollama: 'Local models', searxng: 'Web search',
  systemgate: 'Server readings', subscriptions: 'Plan sign-ins', 'sandbox-runner': 'Tool sandbox',
  'package-proxy': 'Package downloads', 'owner-terminal': 'Terminal', 'data-owner': 'Folder permissions',
}
const jobs: Record<string, string> = {
  pi: 'Runs your chats, agents and cron jobs.', gateway: 'Serves this page and signs you in.', memorygate: 'Keeps and recalls what Conker remembers.',
  toolgate: 'Runs tools and checks what they may do.', postgres: 'Stores memories and their history.', qdrant: 'Finds memories by meaning.',
  embeddings: 'Turns text into numbers for meaning search.', ollama: 'Runs the AI models on this server.', searxng: 'Searches the web for Conker.',
  systemgate: 'Reads the server’s health for this page.', subscriptions: 'Uses your Claude and ChatGPT plans.', 'sandbox-runner': 'Runs tool commands in a closed box.',
  'package-proxy': 'Fetches packages for the tool sandbox.', 'owner-terminal': 'Opens the terminal on this page.', 'data-owner': 'Sets folder permissions once when Conker starts.',
}
const pauses: Record<string, string> = {
  pi: 'Chats and cron jobs stop until it is back; a reply being written may be cut off.',
  gateway: 'This page loses the connection for a moment and reconnects by itself.',
  memorygate: 'Conker can’t recall or save memories until it is back.',
  toolgate: 'Tools stop until it is back; a tool that is running may be cut off.',
  postgres: 'Memory stops until the database is back.',
  ollama: 'Local models stop; the next request loads the model again, which takes longer.',
}

export const serviceLabel = (name: string) => names[name] ?? name.replace(/^./, letter => letter.toUpperCase())
export const serviceJob = (name: string) => jobs[name] ?? null
/** What restarting this service pauses, in the owner's words. */
export function restartEffect(name: string) {
  return `It stops and starts again, usually within a minute. ${pauses[name] ?? `What ${serviceLabel(name)} does pauses until it is back.`}`
}

const stateWords: Record<HostService['state'], string> = {
  created: 'Not started', running: 'Running', restarting: 'Restarting', paused: 'Paused', exited: 'Stopped',
  removing: 'Being removed', dead: 'Stopped', unknown: 'State unknown',
}
/** Running and healthy (or without a health check) is fine; anything else needs a look. */
export const serviceFine = (row: HostService) => row.oneShot ? row.state !== 'dead' : row.state === 'running' && row.health !== 'unhealthy'
export function serviceState(row: HostService, now = Date.now()) {
  if (row.oneShot) return row.state === 'exited' ? 'Ran when Conker started' : stateWords[row.state]
  const parts = [stateWords[row.state]]
  if (row.health === 'healthy') parts.push('Healthy')
  if (row.health === 'unhealthy') parts.push('Not healthy')
  if (row.health === 'starting') parts.push('Starting up')
  if (row.state === 'running' && row.startedAt) parts.push(`up ${span(now - Date.parse(row.startedAt))}`)
  return parts.join(' · ')
}
export function span(milliseconds: number) {
  const minutes = Math.max(1, Math.round(milliseconds / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.round(hours / 24)
  return `${days} days`
}
/** `restarting`: services with a restart being sent or running; their last read state is old news. */
export function servicesSummary(status: HostServicesStatus, restarting: string[] = []) {
  const lasting = status.services.filter(row => !row.oneShot)
  if (!lasting.length) return 'No services are running in this install.'
  const busy = lasting.filter(row => restarting.includes(row.service))
  const rest = lasting.filter(row => !restarting.includes(row.service))
  const fine = rest.filter(serviceFine)
  const off = rest.filter(row => !serviceFine(row)).map(row => serviceLabel(row.service))
  const look = `${list(off)} ${off.length === 1 ? 'needs' : 'need'} a look.`
  if (!busy.length) return fine.length === lasting.length ? `All ${lasting.length} services are running.` : `${fine.length} of ${lasting.length} services are running fine. ${look}`
  const head = `Restarting ${list(busy.map(row => serviceLabel(row.service)))}…`
  if (!rest.length) return head
  if (!off.length) return `${head} ${rest.length === 1 ? 'The other service is' : `The other ${rest.length} services are`} running.`
  return fine.length ? `${head} ${fine.length} of the other ${rest.length} are running fine. ${look}` : `${head} ${look}`
}
const list = (items: string[]) => items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

export const when = (value: string | number) => new Date(value).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const snapshotTime = (createdAt: string) => when(createdAt)
export function bytes(value: number) {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let amount = value, unit = 0
  while (amount >= 1000 && unit < units.length - 1) { amount /= 1000; unit++ }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: amount < 10 && unit ? 1 : 0 }).format(amount)} ${units[unit]}`
}
/** Where the backups are and what that place does not protect against (owner, 2026-10-29). */
export function backupPlace(list: HostBackupList) {
  if (list.separateDisk === true) return { title: 'On a second disk in this computer', protects: 'Survives the system disk failing.', risk: 'Same computer: lost if this PC dies.' }
  if (list.separateDisk === false) return { title: 'On the same disk as Conker', protects: 'Lets you undo a bad change or update.', risk: 'Same computer and same disk: lost if this disk or this PC dies.' }
  return { title: 'Backup folder', protects: null, risk: 'Same computer: lost if this PC dies.' }
}

const snapshotName = /^snapshot-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/
export function snapshotLabel(name: string) {
  const parts = snapshotName.exec(name)
  return parts ? `the backup from ${when(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}Z`)}` : 'this backup'
}

type Words = Record<HostReceipt['outcome'], string>
function receiptWords(receipt: Pick<HostReceipt, 'operation' | 'arguments'>): Words {
  if (receipt.operation === 'services.restart') {
    const name = serviceLabel(receipt.arguments.service ?? 'service')
    return { working: `Restarting ${name}…`, done: `Restarted ${name}`, failed: `${name} didn’t restart`, unknown: `Can’t tell if ${name} restarted` }
  }
  if (receipt.operation === 'backup.run') return { working: 'Backing up…', done: 'Backed up and checked', failed: 'The backup didn’t finish', unknown: 'Can’t tell if the backup finished' }
  if (receipt.operation === 'backup.verify') {
    const name = snapshotLabel(receipt.arguments.snapshot ?? '')
    return { working: `Checking ${name}…`, done: `${capital(name)} passed its check`, failed: `${capital(name)} didn’t pass its check`, unknown: `Can’t tell if the check of ${name} finished` }
  }
  return { working: `${receipt.operation} is running…`, done: `${receipt.operation} finished`, failed: `${receipt.operation} failed`, unknown: `Can’t tell if ${receipt.operation} finished` }
}
const capital = (value: string) => value.replace(/^./, letter => letter.toUpperCase())
export const receiptTitle = (receipt: Pick<HostReceipt, 'operation' | 'arguments' | 'outcome'>) => receiptWords(receipt)[receipt.outcome]
export const receiptSource = (receipt: Pick<HostReceipt, 'source'>) => receipt.source === 'cli' ? 'from the server’s command line' : 'from this app'
/** The time a receipt is about: when it ended, or when it started while it runs. */
export const receiptTime = (receipt: Pick<HostReceipt, 'startedAt' | 'endedAt'>) => receipt.endedAt ?? receipt.startedAt
/** Live first, then what needs a look, then the rest, each newest first (server-actions design). */
export function sortReceipts(rows: readonly HostReceipt[]) {
  const rank = { working: 0, unknown: 1, failed: 2, done: 3 } as const
  return [...rows].sort((a, b) => rank[a.outcome] - rank[b.outcome] || Date.parse(receiptTime(b)) - Date.parse(receiptTime(a)))
}
export const receiptTarget = (receipt: Pick<HostReceipt, 'operation' | 'arguments'>) =>
  receipt.operation === 'services.restart' ? `service:${receipt.arguments.service}` : receipt.operation === 'backup.verify' ? `snapshot:${receipt.arguments.snapshot}` : receipt.operation === 'backup.run' ? 'backup' : receipt.operation

/** The command that does the same thing on the server (parity: the CLI works with the helper down). */
export function actionCommand(receipt: Pick<HostReceipt, 'operation' | 'arguments'>) {
  if (receipt.operation === 'services.restart') return `conker ops run services.restart service=${receipt.arguments.service}`
  if (receipt.operation === 'backup.verify') return `conker ops run backup.verify snapshot=${receipt.arguments.snapshot}`
  if (receipt.operation === 'backup.run') return 'conker ops run backup.run'
  return 'conker ops list'
}

/** The password sheet for a server action: the effect in plain words and a button named after it. */
export function describeHostAction(body: Record<string, unknown>) {
  const args = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments) ? body.arguments as Record<string, unknown> : {}
  const once = 'One server action runs at a time. If the answer is lost, it is never sent again by itself.'
  if (body.operation === 'services.restart' && typeof args.service === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(args.service)) {
    const name = serviceLabel(args.service)
    return { title: `Restart ${name}`, target: `${name} (${args.service}) on your server`, details: [restartEffect(args.service), once], action: `Restart ${name}` }
  }
  if (body.operation === 'backup.run') {
    return { title: 'Back up now', target: 'Your backup folder on the server', details: ['Conker pauses for a few minutes while it copies everything: chats, tools and memory stop until it is done, and this page may lose the connection and reconnect by itself.', 'Then it checks the new backup and keeps the number of copies you saved.', once], action: 'Back up now' }
  }
  if (body.operation === 'backup.verify' && typeof args.snapshot === 'string' && /^snapshot-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(args.snapshot)) {
    return { title: 'Check this backup', target: capital(snapshotLabel(args.snapshot)), details: ['Checks every file in this backup against its saved fingerprints. Conker keeps running; nothing is changed or restored.', once], action: 'Check backup' }
  }
  return null
}
