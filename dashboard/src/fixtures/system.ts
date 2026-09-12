import type { StatusEvidence } from "../ui";
import { fixtureLive, previewStartedAt } from "./shared";
export type ServiceFixture = {
  name: string;
  purpose: string;
  version: string;
  evidence: StatusEvidence;
};
export const serviceFixtures: ServiceFixture[] = [
  {
    name: "Pi",
    purpose: "Conversations & turns",
    version: "0.3.0",
    evidence: fixtureLive("Turn loop responding."),
  },
  {
    name: "ToolGate",
    purpose: "Scoped actions & approvals",
    version: "0.2.2",
    evidence: fixtureLive("Execution boundary responding."),
  },
  {
    name: "MemoryGate",
    purpose: "Evidence & long-term memory",
    version: "0.2.0",
    evidence: {
      state: "degraded",
      detail:
        "Vector index unavailable. Source records are safe; meaning search is paused.",
    },
  },
  {
    name: "SystemGate",
    purpose: "Read-only host telemetry",
    version: "0.2.2",
    evidence: {
      state: "stale",
      source: "Fixture host sample",
      checkedAt: new Date(Date.parse(previewStartedAt) - 420000).toISOString(),
      detail: "Last sample is 7 minutes old; current host load is not known.",
    },
  },
  {
    name: "Embeddings",
    purpose: "Text → multilingual vectors",
    version: "0.1.2",
    evidence: {
      state: "planned",
      detail:
        "Being folded into MemoryGate. No standalone service is claimed ready.",
    },
  },
];
export const databaseFixtures: ServiceFixture[] = [
  {
    name: "PostgreSQL",
    purpose: "Authoritative memory records",
    version: "16.4",
    evidence: fixtureLive("Read/write probe passed in fixture."),
  },
  {
    name: "Qdrant",
    purpose: "Rebuildable meaning index",
    version: "1.12.1",
    evidence: {
      state: "offline",
      detail: "Connection refused in the fixture health sample.",
    },
  },
  {
    name: "Pi SQLite",
    purpose: "Conversations, outbox & tombstones",
    version: "WAL",
    evidence: fixtureLive("Integrity check recorded."),
  },
  {
    name: "ToolGate SQLite",
    purpose: "Vault, approvals & execution records",
    version: "WAL",
    evidence: {
      state: "unknown",
      detail: "No independent database probe in this sample.",
    },
  },
];
export const hostFixtures = [
  {
    label: "Memory",
    value: "6.2",
    unit: "/ 16 GB",
    detail: "9.8 GB available at last sample",
    used: 39,
  },
  {
    label: "CPU",
    value: "12",
    unit: "%",
    detail: "4 cores · 46°C at last sample",
    used: 12,
  },
  {
    label: "Disk",
    value: "84",
    unit: "/ 256 GB",
    detail: "172 GB free on the system drive",
    used: 33,
  },
];
export const backupFixture = {
  location: "/mnt/backup/conker/2026-09-12_0300",
  size: "4.2 GB",
  time: "Today, 03:00",
  contains:
    "Postgres · Pi database · ToolGate vault & key · config · version manifest",
  recovery:
    "Last successful isolated restore drill: 10 September, 18:22. This newer snapshot has not been restored.",
};

export const backupManifestFixture = {
  complete: true,
  stores: ["postgres", "pi.db", "toolgate"],
  vault_recovery_material: "included",
  outbound_on_restore: "disabled",
  restore_drill_for_this_snapshot: "not run",
};
