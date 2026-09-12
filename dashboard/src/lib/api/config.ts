export const serviceNames = ["memorygate", "toolgate", "pi"] as const
export type ServiceName = typeof serviceNames[number]
export type ServiceConnection = { endpoint: string; apiKey: string }
export type Connections = Record<ServiceName, ServiceConnection>

// VITE_* values are public. Secrets come only from owner input, never build env.
export const clientConfig = {
  adapter: "fixture" as const,
  endpoints: {
    memorygate: import.meta.env.VITE_MEMORYGATE_URL || "",
    toolgate: import.meta.env.VITE_TOOLGATE_URL || "",
    pi: import.meta.env.VITE_PI_URL || "",
  },
}

let connections: Connections = Object.fromEntries(serviceNames.map(name => [name, {
  endpoint: clientConfig.endpoints[name], apiKey: "",
}])) as Connections
let sessionToken: string | null = null

export function validateConnections(value: Connections) {
  for (const name of serviceNames) {
    const { endpoint, apiKey } = value[name]
    if (!endpoint) {
      if (apiKey) throw new Error(`Add a ${name} endpoint before its key.`)
      continue
    }
    let url: URL
    try { url = new URL(endpoint) } catch { throw new Error(`Use a full HTTP or HTTPS URL for ${name}.`) }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error(`Use an HTTP or HTTPS URL without credentials, query, or fragment for ${name}.`)
    }
  }
}

/** Memory only. A future HTTP adapter consumes these helpers; fixtures never fetch. */
export const connectionConfig = {
  read: (): Connections => structuredClone(connections),
  write: (value: Connections) => {
    validateConnections(value)
    connections = structuredClone(value)
  },
  setSessionToken: (token: string | null) => { sessionToken = token },
  headers: (service: ServiceName): Record<string, string> => {
    const token = connections[service].apiKey || sessionToken
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  clearSecrets: () => {
    sessionToken = null
    serviceNames.forEach(name => { connections[name].apiKey = "" })
  },
}
