/**
 * Development-only preview for the system inventory and directory-listing screens: a synthetic
 * host observation and a fixed sample directory tree, keyed by request id like the real toolgate.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

export function createFakeSystem(now: () => number, iso: (seconds: number) => string, fail: (status: number) => never) {
  let hostInventory: Json | null = null
  let fileListing: Json | null = null
  const sampleDirectory = (rootId: string, path: string): Json => {
    const rows: Record<string, Json[]> = {
      '': [
        { name: 'dashboard', path: 'dashboard', kind: 'directory' },
        { name: 'docs', path: 'docs', kind: 'directory' },
        { name: 'README.md', path: 'README.md', kind: 'file' },
      ],
      dashboard: [
        { name: 'src', path: 'dashboard/src', kind: 'directory' },
        { name: 'package.json', path: 'dashboard/package.json', kind: 'file' },
      ],
      'dashboard/src': [
        { name: 'components', path: 'dashboard/src/components', kind: 'directory' },
        { name: 'App.tsx', path: 'dashboard/src/App.tsx', kind: 'file' },
      ],
      docs: [{ name: 'README.md', path: 'docs/README.md', kind: 'file' }],
    }
    return { mode: 'observed', rootId, path, truncated: false, sampledAt: iso(now()), entries: rows[path] ?? [] }
  }
  const hostObservation = (): Json => ({
    mode: 'observed', status: 'partial', sampledAt: iso(now()), ageSeconds: 0, collectionSeconds: 0.18,
    sourceScopes: { process: 'configured-procfs', network: 'collector-namespace', containers: 'configured-docker-daemon' },
    processes: { status: 'ok', truncated: false, errors: [], results: [
      { id: `process_${'1'.repeat(64)}`, name: 'conker-pi', status: 'sleeping', createdAt: now() - 3600, memoryBytes: 73400320 },
      { id: `process_${'2'.repeat(64)}`, name: 'gateway', status: 'sleeping', createdAt: now() - 3500, memoryBytes: 49283072 },
    ] },
    containers: { status: 'ok', truncated: false, errors: [], results: [
      { id: `container_${'3'.repeat(64)}`, name: 'conker-pi', status: 'running', imageConfigured: true },
      { id: `container_${'4'.repeat(64)}`, name: 'conker-gateway', status: 'running', imageConfigured: true },
    ] },
    ports: { status: 'partial', truncated: false, errors: ['process_link_unavailable'], results: [
      { id: `port_${'5'.repeat(64)}`, kind: 'listener', addressScope: 'loopback', hostPort: 8050, targetPort: null, protocol: 'tcp', processId: `process_${'2'.repeat(64)}`, containerId: null, state: 'listening' },
      { id: `port_${'6'.repeat(64)}`, kind: 'container-binding', addressScope: 'all-interfaces', hostPort: 443, targetPort: 8050, protocol: 'tcp', processId: null, containerId: `container_${'4'.repeat(64)}`, state: 'declared-binding' },
    ] },
    unavailableFieldCount: 1,
    capabilities: { inspection: true, processActions: false, containerActions: false, portMutation: false, terminal: false, files: false },
  })
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/control/pi/system/inventory/configured/services' && method === 'GET') return {
      schemaVersion: 1, kind: 'services', status: 'configured', results: [{ id: `service_${'7'.repeat(64)}`, kind: 'service', name: 'system:conker-api.service' }],
      requiresApproval: true, observed: false, authority: 'none', contentIncluded: true, execution: 'not-triggered',
    }
    if (path === '/api/control/pi/system/inventory/configured/containers' && method === 'GET') return {
      schemaVersion: 1, kind: 'containers', status: 'configured', results: [{ id: `container_${'8'.repeat(64)}`, kind: 'container', name: null }],
      requiresApproval: true, observed: false, authority: 'none', contentIncluded: true, execution: 'not-triggered',
    }
    if (path === '/api/control/pi/system/inventory' && method === 'POST') {
      const requestId = String(options.body?.request_id)
      hostInventory = { schemaVersion: 1, requestId, state: 'complete', limit: Number(options.body?.limit ?? 100), approvalRequired: false, errorCode: null,
        observation: hostObservation(), receiptStatus: null, currentAgeSeconds: 0, createdAt: now(), updatedAt: now(), source: 'toolgate/system.inventory',
        refreshRequiresNewRequest: true, authority: 'none', contentIncluded: true, execution: 'read-only-observation' }
      return hostInventory
    }
    if ((match = path.match(/^\/api\/control\/pi\/system\/inventory\/([A-Za-z0-9_-]{16,100})(?:\/resume)?$/))) {
      if (!hostInventory || hostInventory.requestId !== match[1]) return fail(404)
      return hostInventory
    }
    if (path === '/api/control/pi/system/files/roots' && method === 'GET') return {
      schemaVersion: 1, mode: 'configured', code: null, roots: [{ id: 'project', path: '/workspace/conker' }],
      capabilities: { list: true, read: false, write: false }, authority: 'none', execution: 'directory-listing-only', contentIncluded: false,
    }
    if (path === '/api/control/pi/system/files/listings' && method === 'POST') {
      const requestId = String(options.body?.request_id), rootId = String(options.body?.root_id), relative = String(options.body?.path ?? ''), limit = Number(options.body?.limit ?? 200)
      fileListing = { schemaVersion: 1, requestId, state: 'complete', limit, rootId, path: relative, approvalRequired: false, errorCode: null,
        listing: sampleDirectory(rootId, relative), receiptStatus: null, currentAgeSeconds: 0, createdAt: now(), updatedAt: now(), source: 'toolgate/system.files-list',
        refreshRequiresNewRequest: true, authority: 'none', contentIncluded: false, execution: 'directory-listing-only' }
      return fileListing
    }
    if ((match = path.match(/^\/api\/control\/pi\/system\/files\/listings\/([A-Za-z0-9_-]{16,100})(?:\/resume)?$/))) {
      if (!fileListing || fileListing.requestId !== match[1]) return fail(404)
      return fileListing
    }
    return undefined
  }
}
