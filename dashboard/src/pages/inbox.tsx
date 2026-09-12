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
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Status,
  Tabs,
  TabsList,
  TabsTrigger,
} from "../ui";
import {
  inboxFixtures,
  approvalTitle,
  toolTemplates,
  type Approval,
  type Proposal,
} from "../fixtures/inbox";
import { fixtureLive } from "../fixtures/shared";
import { usePreview } from "../state";
import { PageHeading, EmptyState, SourceLink } from "../components/common";

function ApprovalCard({
  item,
  expanded,
}: {
  item: Approval;
  expanded: boolean;
}) {
  const { decisions, decide, decisionReasons } = usePreview();
  const [open, setOpen] = useState(expanded);
  const [reason, setReason] = useState("");
  const definition = toolTemplates[item.tool];
  const decided = decisions[item.id];
  const actionable = !decided && item.lifecycle === "pending";
  const Icon = item.tool === "email.send" ? Mail : FileMinus;
  return (
    <Card className="approval-card" id={item.id}>
      <CardHeader>
        <div className="approval-glance">
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
            <CardTitle>
              <h2>{approvalTitle(item)}</h2>
            </CardTitle>
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
        </div>
      </CardHeader>
      {open && (
        <>
          <CardContent className="stack">
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
            {item.id === "cleanup" && (
              <Status
                evidence={{
                  state: "blocked",
                  detail:
                    "Intent mismatch: summarising notes does not require deleting them.",
                }}
              />
            )}
            {decided && (
              <Status
                evidence={{
                  state: "blocked",
                  detail: `Preview decision: ${decided}. No execution is connected; nothing was sent or deleted.`,
                }}
              />
            )}
            {item.lifecycle === "consumed" && (
              <Status
                evidence={fixtureLive(
                  "Consumed approval · fixture delivery receipt recorded. This request cannot run again.",
                )}
              />
            )}
            {item.lifecycle === "expired" && (
              <Status
                evidence={{
                  state: "stale",
                  source: "Fixture decision deadline",
                  checkedAt: new Date(Date.now() - 86400000).toISOString(),
                  detail:
                    "Expired before approval. Nothing ran; this request cannot be approved.",
                }}
              />
            )}
            <details className="full-detail">
              <summary>Full detail & binding</summary>
              <div className="detail-body stack">
                <dl className="metadata-list">
                  <div>
                    <dt>Tool / version</dt>
                    <dd>{item.tool} / 2</dd>
                  </div>
                  <div>
                    <dt>Standing grant</dt>
                    <dd>{item.grant}</dd>
                  </div>
                  <div>
                    <dt>Budget remaining</dt>
                    <dd>{item.budget}</dd>
                  </div>
                  <div>
                    <dt>Decide by</dt>
                    <dd>{item.decision} · starts when requested</dd>
                  </div>
                  <div>
                    <dt>Spend window</dt>
                    <dd>
                      {item.spendSeconds} seconds after approval · not from
                      creation
                    </dd>
                  </div>
                  <div>
                    <dt>Fixture binding digest</dt>
                    <dd className="mono break-anywhere">
                      sha256:{item.digest}
                    </dd>
                  </div>
                </dl>
                <pre aria-label="Exact arguments">
                  {JSON.stringify(item.args, null, 2)}
                </pre>
                <p className="fine-print">
                  Structured fixture fields and a registered tool template
                  render this card. The agent does not author its description.
                  No live approval token exists.
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
          </CardContent>
          <CardFooter className="approval-footer">
            <div className="decision-buttons">
              <Button
                variant="outline"
                disabled={!actionable}
                onClick={() => decide(item.id, "denied", reason)}
              >
                Deny
              </Button>
              <Button
                disabled={!actionable}
                onClick={() => decide(item.id, "approved")}
              >
                Approve once
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
              Decide by {item.decision} <span>·</span> Spend window{" "}
              {item.spendSeconds / 60} min once approved
            </p>
            {decided === "denied" && decisionReasons[item.id] && (
              <p className="fine-print">
                Your reason: {decisionReasons[item.id]}
              </p>
            )}
          </CardFooter>
        </>
      )}
      {!open && (
        <CardContent className="glance-footer">
          <p className="fine-print">
            {item.lifecycle === "pending"
              ? `Decide by ${item.decision}`
              : item.lifecycle === "consumed"
                ? "Previously approved and consumed"
                : "Decision window elapsed"}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
function ProposalCard({ item }: { item: Proposal }) {
  const { decisions, decide } = usePreview();
  return (
    <Card className="proposal-card">
      <CardHeader>
        <div className="approval-glance">
          <span className="service-icon">
            <Lightbulb />
          </span>
          <div>
            <p className="card-kicker">
              A suggestion <span>·</span> Conker
            </p>
            <CardTitle>
              <h2>{item.title}</h2>
            </CardTitle>
          </div>
          <Badge variant="secondary">Proposal</Badge>
        </div>
      </CardHeader>
      <CardContent className="stack">
        <p>{item.noticed}</p>
        <SourceLink to={item.source}>{item.evidence}</SourceLink>
        <div className="proposal-effect">
          <span className="eyebrow">If you accept</span>
          <p>{item.effect}</p>
        </div>
        {decisions[item.id] && (
          <Status
            evidence={{
              state: "planned",
              detail: `Preview decision: ${decisions[item.id]}. No calendar changes were made.`,
            }}
          />
        )}
      </CardContent>
      <CardFooter className="proposal-actions">
        <Button
          variant="outline"
          disabled={!!decisions[item.id]}
          onClick={() => decide(item.id, "declined")}
        >
          Decline
        </Button>
        <Button
          disabled={!!decisions[item.id]}
          onClick={() => decide(item.id, "accepted")}
        >
          Prepare the blocks
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/chat/week">Ask about it</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
export function InboxPage() {
  const { id } = useParams();
  const { decisions } = usePreview();
  const [tab, setTab] = useState("pending");
  const pending = inboxFixtures.filter(
    (item) =>
      !decisions[item.id] &&
      (item.kind === "proposal" || item.lifecycle === "pending"),
  );
  const visible = id
    ? inboxFixtures.filter((item) => item.id === id)
    : tab === "pending"
      ? pending
      : inboxFixtures.filter((item) => !pending.includes(item));
  return (
    <div className="page inbox-page">
      <PageHeading
        eyebrow="The daily loop"
        title={
          pending.length
            ? "A few things for your judgement."
            : "Nothing waiting on you."
        }
        description={
          pending.length
            ? "Read what matters. Leave the rest to Conker."
            : "You’re clear. Go put your attention somewhere you want it."
        }
      >
        <span className="quiet-count">{pending.length} decisions</span>
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
      <div className="inbox-list">
        {visible.map((item, i) =>
          item.kind === "approval" ? (
            <ApprovalCard
              key={item.id}
              item={item}
              expanded={!!id || i === 0}
            />
          ) : (
            <ProposalCard key={item.id} item={item} />
          ),
        )}
        {!visible.length && (
          <EmptyState
            title={
              id
                ? "That request isn’t in this preview."
                : "A quiet inbox is a good inbox."
            }
          >
            No hidden queue to catch up on. Your previous decisions are still in
            the history.
          </EmptyState>
        )}
      </div>
      <p className="page-footnote">
        One decision applies to one exact action. Changing a standing grant is a
        separate, visible choice.
      </p>
    </div>
  );
}
