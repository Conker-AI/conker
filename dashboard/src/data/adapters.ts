const actionStates = ["awaiting_approval", "in_progress", "completed", "outcome_unknown", "denied", "expired"];
const runStates = ["accepted", "streaming", "completed", "interrupted", "stopped", "acted_no_reply"];
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The resource response was not understood. Inspect the connection before acting.");
}
export function adaptRecord(resource: string, value: unknown, expectedId?: string): unknown {
  object(value);
  if (!["system", "profile"].includes(resource) && (typeof value.id !== "string" || expectedId && value.id !== expectedId)) throw new Error("Resource identity did not match the request.");
  if (resource === "actions") {
    if (typeof value.tool !== "string" || !value.args || typeof value.args !== "object") throw new Error("Action arguments or tool identity are missing.");
    return { ...value, status: actionStates.includes(String(value.status)) ? value.status : "outcome_unknown" };
  }
  if (resource === "runs") {
    if (!runStates.includes(String(value.status)) || typeof value.sessionId !== "string") throw new Error("Run state is not understood. Inspect the retained session.");
    return { ...value, costUsd: typeof value.costUsd === "number" && Number.isFinite(value.costUsd) && value.costUsd >= 0 ? value.costUsd : null };
  }
  if (resource === "approvals" && (!Number.isInteger(value.revision) || !["pending", "approved", "denied", "expired"].includes(String(value.decision)) || typeof value.actionId !== "string")) throw new Error("Approval revision or decision is missing. This request cannot be approved.");
  return value;
}
export function adaptList(resource: string, value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("The collection response is invalid; it is not an empty collection.");
  return value.map(item => adaptRecord(resource, item));
}
