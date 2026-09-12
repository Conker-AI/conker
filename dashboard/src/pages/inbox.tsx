import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  Mail,
  FileMinus,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Clock3,
  Wrench,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Input,
  Status,
  Tabs,
  TabsList,
  TabsTrigger,
} from "../ui";
import { approvalTitle, toolDefinition } from "../domain/approval-description";
import type { Approval, ProposalRecord } from "../domain/model";
import { useInbox } from "../data/inbox";
import { api } from "../data/client";
import { refresh } from "../data/queries";
import { ActionRecord } from "../components/action-record";
import { PageHeading, SourceLink } from "../components/common";
import { QueryState, DetailFields } from "../components/object-inspector";

function ApprovalCard({
  item,
  expanded,
}: {
  item: Approval;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  const [reason, setReason] = useState("");
  const [scenario, setScenario] = useState("normal");
  const definition = toolDefinition(item.tool);
  const actionable =
    item.decision === "pending" && definition.effect !== "Unknown";
  const mutation = useMutation({
    mutationFn: (decision: "approved" | "denied") =>
      api(`/approvals/${item.id}/decision`, {
        decision,
        revision: item.revision,
        reason,
        scenario,
      }),
    onSettled: async () => {
      await refresh("approvals", "actions", "journal");
    },
  });
  const Icon =
    item.tool === "email.send"
      ? Mail
      : item.tool === "files.delete"
        ? FileMinus
        : Wrench;
  return (
    <article className="approval-ticket" id={item.id}>
      <header className="approval-glance">
        <span className="service-icon">
          <Icon aria-hidden="true" />
        </span>
        <div>
          <div className="card-kicker">
            {definition.service}
            <span>·</span>
            {item.agent}
            <Badge variant="outline">{definition.effect}</Badge>
          </div>
          <h2>{approvalTitle(item)}</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Review"} ${definition.service} request`}
          onClick={() => setOpen(!open)}
        >
          {open ? "−" : "Review"}
        </Button>
      </header>
      {open ? (
        <div className="ticket-detail">
          <div className="intent-comparison">
            <div>
              <span className="eyebrow">You asked</span>
              <p>“{item.asked}”</p>
              <SourceLink to={item.source}>Original conversation</SourceLink>
            </div>
            <div>
              <span className="eyebrow">It wants to</span>
              <p>{approvalTitle(item)}</p>
              <small>{item.tool} · version 2</small>
            </div>
          </div>
          <div className="grant-delta" aria-label="Authority requested">
            <span>Current: {item.grant}</span>
            <span>?</span>
            <strong>Once: {approvalTitle(item)}</strong>
          </div>
          {definition.effect === "Unknown" && (
            <Status
              evidence={{
                state: "unknown",
                detail:
                  "Tool definition unavailable. Review is read-only until its effect is known.",
              }}
            />
          )}
          <dl className="argument-list">
            {Object.entries(item.args).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {(definition.fields as Record<string, string>)[key] ?? key}
                </dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="approval-reason">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>{item.reversible}</strong>
              <p>{item.reason}</p>
            </div>
          </div>
          {item.intentEvidence?.matches === false && (
            <Status
              evidence={{
                state: "blocked",
                detail: item.intentEvidence.detail,
              }}
            />
          )}
          {!actionable && <ActionRecord id={item.actionId} compact />}
          <details className="full-detail">
            <summary>Full detail & binding</summary>
            <div className="detail-body stack">
              <DetailFields
                fields={[
                  { label: "Tool / version", value: `${item.tool} / 2` },
                  { label: "Standing grant", value: item.grant },
                  { label: "Budget remaining", value: item.budget },
                  {
                    label: "Decide by",
                    value: `${item.decideBy} · starts when requested`,
                  },
                  {
                    label: "Spend window",
                    value: `${item.spendSeconds} seconds after approval · not from creation`,
                  },
                  {
                    label: "Binding digest",
                    value: (
                      <span className="mono break-anywhere">
                        sha256:{item.digest}
                      </span>
                    ),
                  },
                  { label: "Request revision", value: item.revision },
                ]}
              />
              <pre aria-label="Exact arguments">
                {JSON.stringify(item.args, null, 2)}
              </pre>
              <p className="fine-print">
                Registered template + exact structured arguments. The requesting
                agent does not write this description.
              </p>
            </div>
          </details>
          {actionable && (
            <details className="denial-note">
              <summary>Add a reason if you deny</summary>
              <Input
                aria-label="Denial reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional. Your judgement, in your words."
              />
            </details>
          )}
          <div className="approval-footer">
            <div className="decision-buttons">
              <Button
                variant="outline"
                disabled={!actionable || mutation.isPending}
                onClick={() => mutation.mutate("denied")}
              >
                Deny
              </Button>
              <Button
                disabled={!actionable || mutation.isPending}
                onClick={() => mutation.mutate("approved")}
              >
                {mutation.isPending ? "Submitting decision…" : "Approve once"}
                <ArrowRight />
              </Button>
            </div>
            <Link
              className="policy-link"
              to={`/agents/${item.agent.toLowerCase()}?review=grants`}
            >
              Raise this agent’s autonomy instead →
            </Link>
            <p className="fine-print">
              <Clock3 />
              Decide by {item.decideBy} · Spend window {item.spendSeconds / 60}{" "}
              min once approved
            </p>
            {item.denialReason && (
              <p className="fine-print">Your reason: {item.denialReason}</p>
            )}
          </div>
          {mutation.isPending && (
            <Status
              evidence={{
                state: "unknown",
                detail:
                  "Decision pending. No approval or completion is assumed.",
              }}
            />
          )}
          {mutation.error && (
            <Status
              evidence={{ state: "blocked", detail: mutation.error.message }}
            />
          )}
          {actionable && (
            <details className="fixture-scenario">
              <summary>Preview a different outcome</summary>
              <label>
                Decision scenario
                <select
                  aria-label="Decision scenario"
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                >
                  <option value="normal">Delayed receipt</option>
                  <option value="unknown">
                    Connection lost after dispatch
                  </option>
                  <option value="expired">
                    Authority expires before acceptance
                  </option>
                  <option value="revision">Request revision changes</option>
                </select>
              </label>
            </details>
          )}
        </div>
      ) : (
        <p className="fine-print glance-footer">Decide by {item.decideBy}</p>
      )}
    </article>
  );
}
function ProposalCard({ item }: { item: ProposalRecord }) {
  const mutation = useMutation({
    mutationFn: (decision: "accepted" | "declined") =>
      api(`/proposals/${item.id}`, { decision }),
    onSuccess: () => refresh("proposals", "journal"),
  });
  return (
    <article className="approval-ticket proposal-ticket">
      <header className="approval-glance">
        <span className="service-icon">
          <Lightbulb />
        </span>
        <div>
          <p className="card-kicker">A suggestion · Conker</p>
          <h2>{item.title}</h2>
        </div>
        <Badge variant="secondary">Proposal</Badge>
      </header>
      <div className="ticket-detail stack">
        <p>{item.noticed}</p>
        <SourceLink to={item.source}>{item.evidence}</SourceLink>
        <div>
          <span className="eyebrow">If you accept</span>
          <p>{item.effect}</p>
        </div>
        {item.decision && (
          <Status
            evidence={{
              state: "planned",
              detail: `Proposal ${item.decision}. No real calendar changes.`,
            }}
          />
        )}
        <div className="proposal-actions">
          <Button
            variant="outline"
            disabled={!!item.decision || mutation.isPending}
            onClick={() => mutation.mutate("declined")}
          >
            Decline
          </Button>
          <Button
            disabled={!!item.decision || mutation.isPending}
            onClick={() => mutation.mutate("accepted")}
          >
            Prepare the blocks
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/chat/week">Ask about it</Link>
          </Button>
        </div>
        {mutation.error && (
          <Status
            evidence={{ state: "degraded", detail: mutation.error.message }}
          />
        )}
      </div>
    </article>
  );
}
function InboxRow({ item }: { item: Approval | ProposalRecord }) {
  const definition =
    item.kind === "approval"
      ? toolDefinition(item.tool)
      : { service: "Suggestion", effect: "Proposal" };
  const Icon =
    item.kind === "proposal"
      ? Lightbulb
      : item.tool === "email.send"
        ? Mail
        : item.tool === "files.delete"
          ? FileMinus
          : Wrench;
  return (
    <Link className="approval-ticket approval-glance" to={`/inbox/${item.id}`}>
      <span className="service-icon">
        <Icon aria-hidden="true" />
      </span>
      <div>
        <div className="card-kicker">
          {definition.service}
          <Badge variant="outline">{definition.effect}</Badge>
        </div>
        <strong>
          {item.kind === "approval" ? approvalTitle(item) : item.title}
        </strong>
        <p className="fine-print">
          {item.kind === "approval"
            ? `Decide by ${item.decideBy} ? Spend window ${item.spendSeconds / 60} min once approved`
            : "No decision deadline ? No execution window (proposal)"}
        </p>
      </div>
    </Link>
  );
}
export function InboxPage() {
  const { id } = useParams();
  const inbox = useInbox();
  const [tab, setTab] = useState("pending");
  const visible = id
    ? inbox.records.filter((item) => item.id === id)
    : tab === "pending"
      ? inbox.pending
      : inbox.records.filter((item) => !inbox.pending.includes(item));
  const unavailable = !!inbox.error;
  const loading = inbox.isPending || inbox.isFetching;
  return (
    <div className="page inbox-page">
      <PageHeading
        eyebrow="The daily loop"
        title={
          unavailable
            ? "Inbox unavailable"
            : loading
              ? "Checking your inbox?"
              : "Inbox"
        }
        description="The intent, the effect, and your say. Nothing more than it needs to be."
      >
        {!loading && !unavailable && (
          <span className="quiet-count">{inbox.pending.length} decisions</span>
        )}
      </PageHeading>
      {id ? (
        <Button asChild variant="ghost" className="back-link">
          <Link to="/inbox">
            <ArrowLeft />
            All decisions
          </Link>
        </Button>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="page-tabs">
          <TabsList>
            <TabsTrigger value="pending">Needs you</TabsTrigger>
            <TabsTrigger value="history">Decision history</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {unavailable || inbox.isPending || (loading && !visible.length) ? (
        <QueryState loading={loading} error={inbox.error} />
      ) : (
        <div className="inbox-list">
          {visible.map((item) =>
            !id ? (
              <InboxRow key={item.id} item={item} />
            ) : item.kind === "approval" ? (
              <ApprovalCard key={item.id} item={item} expanded />
            ) : (
              <ProposalCard key={item.id} item={item} />
            ),
          )}
          {!visible.length && (
            <QueryState
              empty={
                id
                  ? "This inbox record is missing. Return to the list to choose an available record."
                  : !inbox.records.length
                    ? "Verified empty inbox. No retained items."
                    : tab === "pending"
                      ? "Nothing waiting on you. Retained decisions are in Decision history."
                      : "No decisions match Decision history. Pending items are under Needs you."
              }
            />
          )}
        </div>
      )}
      <p className="page-footnote">
        One decision, one exact action. A change to standing grants is a
        separate choice.
      </p>
    </div>
  );
}
