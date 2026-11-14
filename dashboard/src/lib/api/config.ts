export const serviceNames = ["memorygate", "toolgate", "pi"] as const
export type ServiceName = typeof serviceNames[number]
export type ServiceConnection = { endpoint: string; apiKey: string }
export type Connections = Record<ServiceName, ServiceConnection>

