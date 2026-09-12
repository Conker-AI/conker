import type { Service } from "../models"
export const system = {
  status: "Degraded · meaning search is paused",
  detail: "MemoryGate cannot reach the vector index. Source records remain available. These are fixture health samples, not a connection to your host.",
  sampleAge: "Stale · 7 min old",
  sampledAt: "Stale host sample · SystemGate · 12 Sep 2026, 16:36. Current host load is unknown.",
  recoverySummary: "Today, 03:00 · 4.2 GB · manifest checked",
  recoveryDetail: "Postgres, Pi database, ToolGate vault and recovery material are included. This snapshot’s restore drill has not run. A snapshot existing does not prove recoverability.",
}
export const vitals = [
  {
    name: "Memory",
    value: "6.2",
    unit: "/ 16 GB",
    used: 38.75,
    detail: "9.8 GB available at last sample",
  },
  {
    name: "CPU",
    value: "12",
    unit: "%",
    used: 12,
    detail: "4 cores · 46°C at last sample",
  },
  {
    name: "Disk",
    value: "84",
    unit: "/ 256 GB",
    used: 32.8,
    detail: "172 GB free on the system drive",
  },
]
export const services: Service[] = [
  {
    name: "Pi",
    purpose: "Conversations & turns",
    version: "0.3.0",
    status: "Live",
    evidence: "Fixture probe · turn loop responding",
  },
  {
    name: "ToolGate",
    purpose: "Scoped actions & approvals",
    version: "0.2.2",
    status: "Live",
    evidence: "Fixture probe · execution boundary responding",
  },
  {
    name: "MemoryGate",
    purpose: "Evidence & long-term memory",
    version: "0.2.0",
    status: "Degraded",
    evidence: "Vector index unavailable · source records safe",
  },
]
