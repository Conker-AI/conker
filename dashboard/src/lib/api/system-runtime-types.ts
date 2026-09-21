export type RuntimeStatus = "Running" | "Stopped"
export type RuntimeAction = "start" | "stop" | "restart"
export type RuntimeProcess = { id: string; name: string; pid: number; command: string; user: string; status: RuntimeStatus; cpuPercent: number; memoryMb: number; restarts: number; containerId?: string; controlTarget?: { kind: "container" | "service"; id: string; actions: RuntimeAction[] } }
export type RuntimeContainer = { id: string; name: string; image: string; status: RuntimeStatus; processId: string; restarts: number }
export type PortMappingInput = { containerId: string; hostAddress: "127.0.0.1" | "0.0.0.0"; hostPort: number; containerPort: number; protocol: "tcp" | "udp" }
export type RuntimePort = { id: string; processId: string; hostAddress: "127.0.0.1" | "0.0.0.0"; hostPort: number; targetPort: number; protocol: "tcp" | "udp"; containerId?: string; listening: boolean }
export type RuntimeReceipt = { id: string; targetId: string; targetName: string; action: string; createdAt: string; detail: string }
export type SystemRuntimeSnapshot = { mode: "fixture"; processes: RuntimeProcess[]; containers: RuntimeContainer[]; ports: RuntimePort[]; receipts: RuntimeReceipt[] }
export interface SystemRuntimeClient {
  load(): Promise<SystemRuntimeSnapshot>
  subscribe(listener: () => void): () => void
  act(kind: "process" | "container", id: string, action: RuntimeAction): Promise<void>
  savePort(input: PortMappingInput, id?: string): Promise<RuntimePort>
  removePort(id: string): Promise<void>
}
