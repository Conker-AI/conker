export const vitals = [
  { name: "Memory", value: "6.2", unit: "/ 16 GB", used: 38.75, detail: "9.8 GB available at last sample" },
  { name: "CPU", value: "12", unit: "%", used: 12, detail: "4 cores · 46°C at last sample" },
  { name: "Disk", value: "84", unit: "/ 256 GB", used: 32.8, detail: "172 GB free on the system drive" },
]
export type Service = { name: string; purpose: string; version: string; status: "Live" | "Degraded"; evidence: string }
export const services: Service[] = [
  { name: "Pi", purpose: "Conversations & turns", version: "0.3.0", status: "Live", evidence: "Fixture probe · turn loop responding" },
  { name: "ToolGate", purpose: "Scoped actions & approvals", version: "0.2.2", status: "Live", evidence: "Fixture probe · execution boundary responding" },
  { name: "MemoryGate", purpose: "Evidence & long-term memory", version: "0.2.0", status: "Degraded", evidence: "Vector index unavailable · source records safe" },
]

