import type { PortMappingInput, SystemRuntimeSnapshot } from "./system-runtime-types"

export function validatePortMapping(input: PortMappingInput, state: SystemRuntimeSnapshot, editingId?: string): PortMappingInput {
  if (!state.containers.some(item => item.id === input.containerId)) throw new Error("Choose an available preview container.")
  if (!["127.0.0.1", "0.0.0.0"].includes(input.hostAddress)) throw new Error("Choose a supported host address.")
  if (!["tcp", "udp"].includes(input.protocol)) throw new Error("Choose TCP or UDP.")
  if (![input.hostPort, input.containerPort].every(port => Number.isInteger(port) && port >= 1 && port <= 65535)) throw new Error("Use whole port numbers from 1 to 65535.")
  // Stopped bindings remain reserved so restarting cannot silently create a conflict.
  if (state.ports.some(port => port.id !== editingId && port.hostPort === input.hostPort && port.protocol === input.protocol && (port.hostAddress === input.hostAddress || port.hostAddress === "0.0.0.0" || input.hostAddress === "0.0.0.0"))) throw new Error("That host port and protocol are already reserved in this preview. Choose another port.")
  return { containerId: input.containerId, hostAddress: input.hostAddress, hostPort: input.hostPort, containerPort: input.containerPort, protocol: input.protocol }
}
