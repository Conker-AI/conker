import type { PortMappingInput, RuntimeAction, RuntimePort, SystemRuntimeClient, SystemRuntimeSnapshot } from "./system-runtime-types"

function seed(): SystemRuntimeSnapshot {
  return {
    mode: "fixture",
    processes: [
      { id: "dashboard", name: "Dashboard preview", pid: 2418, command: "node dashboard/server.js", user: "owner", status: "Running", cpuPercent: 1.2, memoryMb: 148, restarts: 0 },
      { id: "memory", name: "Memory service", pid: 2604, command: "python -m memory_service", user: "service", status: "Running", cpuPercent: 2.4, memoryMb: 384, restarts: 0, containerId: "memory-service", controlTarget: { kind: "container", id: "memory-service", actions: ["start", "stop", "restart"] } },
      { id: "tool", name: "Tool worker", pid: 2740, command: "node worker.js", user: "service", status: "Running", cpuPercent: 0.4, memoryMb: 92, restarts: 0, containerId: "tool-worker", controlTarget: { kind: "container", id: "tool-worker", actions: ["start", "stop", "restart"] } },
      { id: "index", name: "Index worker", pid: 2801, command: "python -m index_worker", user: "service", status: "Stopped", cpuPercent: 0, memoryMb: 0, restarts: 0, containerId: "index-worker", controlTarget: { kind: "container", id: "index-worker", actions: ["start", "stop", "restart"] } },
    ],
    containers: [
      { id: "memory-service", name: "memory-service", image: "conker/memory:preview", status: "Running", processId: "memory", restarts: 0 },
      { id: "tool-worker", name: "tool-worker", image: "conker/tools:preview", status: "Running", processId: "tool", restarts: 0 },
      { id: "index-worker", name: "index-worker", image: "conker/index:preview", status: "Stopped", processId: "index", restarts: 0 },
    ],
    ports: [
      { id: "dashboard-port", processId: "dashboard", hostAddress: "127.0.0.1", hostPort: 3000, targetPort: 3000, protocol: "tcp", listening: true },
      { id: "memory-port", processId: "memory", containerId: "memory-service", hostAddress: "127.0.0.1", hostPort: 8787, targetPort: 8000, protocol: "tcp", listening: true },
      { id: "tool-port", processId: "tool", containerId: "tool-worker", hostAddress: "127.0.0.1", hostPort: 8790, targetPort: 8080, protocol: "tcp", listening: true },
    ],
    receipts: [],
  }
}

export function validatePortMapping(input: PortMappingInput, state: SystemRuntimeSnapshot, editingId?: string): PortMappingInput {
  if (!state.containers.some(item => item.id === input.containerId)) throw new Error("Choose an available preview container.")
  if (!["127.0.0.1", "0.0.0.0"].includes(input.hostAddress)) throw new Error("Choose a supported host address.")
  if (!["tcp", "udp"].includes(input.protocol)) throw new Error("Choose TCP or UDP.")
  if (![input.hostPort, input.containerPort].every(port => Number.isInteger(port) && port >= 1 && port <= 65535)) throw new Error("Use whole port numbers from 1 to 65535.")
  // Stopped bindings remain reserved so restarting cannot silently create a conflict.
  if (state.ports.some(port => port.id !== editingId && port.hostPort === input.hostPort && port.protocol === input.protocol && (port.hostAddress === input.hostAddress || port.hostAddress === "0.0.0.0" || input.hostAddress === "0.0.0.0"))) throw new Error("That host port and protocol are already reserved in this preview. Choose another port.")
  return { containerId: input.containerId, hostAddress: input.hostAddress, hostPort: input.hostPort, containerPort: input.containerPort, protocol: input.protocol }
}

/** In-memory UI fixture only. Never reads the host, Docker, sockets, or network. */
export function createSystemRuntimeFixture(): SystemRuntimeClient {
  let state = seed(), busy = false
  const listeners = new Set<() => void>()
  function record(next: SystemRuntimeSnapshot, targetId: string, targetName: string, action: string) {
    next.receipts.unshift({ id: crypto.randomUUID(), targetId, targetName, action, createdAt: new Date().toISOString(), detail: "Simulated in this tab only. No host process, container, firewall, or network binding changed." })
    next.receipts = next.receipts.slice(0, 30)
  }
  async function change<T>(update: (next: SystemRuntimeSnapshot) => T): Promise<T> {
    if (busy) throw new Error("Wait for the current preview change to finish.")
    busy = true
    try {
      await Promise.resolve()
      const next = structuredClone(state)
      const result = update(next)
      state = next
      for (const listener of listeners) { try { listener() } catch { /* A view cannot invalidate a completed fixture change. */ } }
      return structuredClone(result)
    } finally { busy = false }
  }
  return {
    async load() { return structuredClone(state) },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async act(kind, id, action: RuntimeAction) {
      await change(next => {
        if (!["start", "stop", "restart"].includes(action) || !["process", "container"].includes(kind)) throw new Error("Choose a supported preview action.")
        const container = kind === "container" ? next.containers.find(item => item.id === id) : next.containers.find(item => item.processId === id)
        const process = next.processes.find(item => item.id === (kind === "container" ? container?.processId : id))
        if (!process) throw new Error("This runtime item is unavailable.")
        if (kind === "process" && (!process.controlTarget?.actions.includes(action) || (process.controlTarget.kind === "container" && process.controlTarget.id !== container?.id))) throw new Error("This process is inspect-only. Lifecycle actions require a managed service or container target.")
        if (action === "stop" && process.status === "Stopped") throw new Error("This item is already stopped in the preview.")
        if (action === "start" && process.status === "Running") throw new Error("This item is already running in the preview.")
        process.status = action === "stop" ? "Stopped" : "Running"
        process.cpuPercent = 0
        process.memoryMb = action === "stop" ? 0 : 64
        if (action === "restart") process.restarts++
        if (container) { container.status = process.status; if (action === "restart") container.restarts++ }
        for (const port of next.ports) if (port.processId === process.id) port.listening = process.status === "Running"
        record(next, id, kind === "container" ? container!.name : process.name, `Preview ${action}`)
      })
    },
    async savePort(input, id) {
      return change(next => {
        if (id && !next.ports.some(port => port.id === id && port.containerId)) throw new Error("Only an existing container mapping can be edited.")
        const value = validatePortMapping(input, next, id)
        const container = next.containers.find(item => item.id === value.containerId)!
        const port: RuntimePort = { id: id || crypto.randomUUID(), processId: container.processId, containerId: container.id, hostAddress: value.hostAddress, hostPort: value.hostPort, targetPort: value.containerPort, protocol: value.protocol, listening: container.status === "Running" }
        if (id) next.ports = next.ports.map(item => item.id === id ? port : item)
        else next.ports.push(port)
        record(next, port.id, `${port.hostAddress}:${port.hostPort}/${port.protocol}`, id ? "Preview mapping updated" : "Preview mapping created")
        return port
      })
    },
    async removePort(id) {
      await change(next => {
        const port = next.ports.find(item => item.id === id)
        if (!port?.containerId) throw new Error("Only container mappings can be removed. Host listeners are read-only.")
        next.ports = next.ports.filter(item => item.id !== id)
        record(next, id, `${port.hostAddress}:${port.hostPort}/${port.protocol}`, "Preview mapping removed")
      })
    },
  }
}
