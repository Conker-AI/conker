import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, CheckCheck, Wrench } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import type { Action, Approval } from "../domain/model";
import { api } from "../data/client";
import { useObject, keys, refresh } from "../data/queries";
import { Button, Status } from "../ui";
import { fixtureLive } from "../fixtures/shared";
import { QueryState } from "./object-inspector";
import { readView, updateView } from "../platform/session-view-state";

export function ActionStatus({ action }: { action: Action }) {
  if (action.status === "outcome_unknown") return <Status evidence={{ state: "degraded", detail: "Outcome unknown. The connection ended without a receipt; the action may have run." }} />;
  if (action.replyMissing) return <Status evidence={{ state: "degraded", detail: "acted_no_reply · the action ran; only the model reply is missing." }} />;
  if (action.status === "completed") return <Status evidence={action.receipt ? fixtureLive(action.receipt) : { state: "unknown", detail: "Completion was reported, but its receipt is missing. Inspect the retained record." }} />;
  if (action.status === "in_progress") return <Status evidence={{ state: "unknown", detail: "Approved, awaiting an execution receipt. Approval is not completion." }} />;
  return <Status evidence={{ state: "blocked", detail: action.status === "denied" ? "Denied by you. No execution authorised." : action.status === "expired" ? "Authority expired. Nothing was dispatched under this request." : "Waiting for your decision. Nothing has been sent." }} />;
}
export function ActionRecord({ id, compact = false }: { id: string; compact?: boolean }) {
  const query = useObject<Action>("actions", id); const action = query.data;
  const approval = useObject<Approval>("approvals", action?.approvalId ?? "");
  const [notice, setNotice] = useState("");
  const mutate = useMutation({ mutationFn: (operation: "check" | "reply") => api(`/actions/${id}/${operation}`, {}), onSuccess: async (_, operation) => { await refresh("actions", "messages", "journal"); setNotice(operation === "check" ? "Existing action checked. No second dispatch was made." : "Only the missing reply was requested."); } });
  if (!action) return <QueryState loading={query.isPending} error={query.error} />;
  return <div className="action-record" data-action-id={id}>
    <div className="action-heading"><Wrench /><strong>{action.tool}</strong><small>{id}</small></div>
    <ActionStatus action={action} />
    {!compact && <details open={readView(action.sessionId).details[id] ?? false} onToggle={event => updateView(action.sessionId, { details: { ...readView(action.sessionId).details, [id]: event.currentTarget.open } })}><summary>Arguments & record</summary><pre>{JSON.stringify(action.args, null, 2)}</pre>{approval.data && <p className="fine-print">Approval {approval.data.id} · {approval.data.decision} · revision {approval.data.revision}</p>}</details>}
    {action.status === "awaiting_approval" && <Button variant="link" asChild><Link to={`/inbox/${action.approvalId}`}>Review in Inbox<ArrowRight /></Link></Button>}
    {action.status === "outcome_unknown" && <Button variant="outline" size="sm" disabled={mutate.isPending} onClick={() => mutate.mutate("check")}>Check existing action</Button>}
    {action.replyMissing && <Button variant="outline" size="sm" disabled={mutate.isPending} onClick={() => mutate.mutate("reply")}><CheckCheck />Ask only for the reply</Button>}
    {notice && <p className="fine-print" role="status">{notice}</p>}
    {mutate.error && <Status evidence={{ state: "degraded", detail: mutate.error.message }} />}
  </div>;
}
