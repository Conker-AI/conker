import type { StatusEvidence } from "../../ui";
export type Grant = { id: string; subject: string; operation: string; frequency: number; period: string; budget: string; expiry: string; recovery: string; boundary: string };
export type AgentRecord = { id: string; name: string; role: string; initials: string; description: string; model: string; routing: string; spend: string; activity: string[]; grants: Grant[] };
export type ToolRecord = { id: string; name: string; title: string; description: string; sensitivity: string; scope: string; agents: string[]; recent: string; recovery: string; args: Record<string, unknown> };
export type MemoryRecord = { id: string; text: string; confidence: string; age: string; date: string; provenance: string; quote: string; source: string; category: string; forgotten: boolean; correction: string };
export type JobRecord = { id: string; name: string; description: string; agent: string; schedule: string; last: string; next: string; produced: string; source: string; watermark: string; duration: string; cost: string; paused: boolean; runs: number };
export type ServiceRecord = { name: string; purpose: string; version: string; evidence: StatusEvidence };
export type SystemRecord = { services: ServiceRecord[]; databases: ServiceRecord[]; host: { label: string; value: string; unit: string; detail: string; used: number }[]; backup: { location: string; size: string; time: string; contains: string; recovery: string }; manifest: Record<string, unknown> };
