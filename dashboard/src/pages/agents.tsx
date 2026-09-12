import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { agentFixtures } from "../fixtures/agents";
import { fixtureLive } from "../fixtures/shared";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Status,
} from "../ui";
import { PageHeading, EmptyState, SourceLink } from "../components/common";

import { usePreview } from "../state";

type Agent = (typeof agentFixtures)[number];
function AgentDetail({ agent }: { agent: Agent }) {
  const { grantBounds: bounds, changeGrant } = usePreview();
  const [draft, setDraft] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <div className="agent-detail">
      <div className="section-heading">
        <h2>Standing grants</h2>
        <Badge variant="outline">Bounded contracts</Badge>
      </div>
      <p className="body-copy section-intro">
        Each grant names what may happen, how often, and when that permission
        ends. Nothing here is an “always allow” switch.
      </p>
      <div className="contract-grid">
        {agent.grants.map((grant) => (
          <Card key={grant.id}>
            <CardHeader>
              <CardTitle>
                <h3>{grant.operation}</h3>
              </CardTitle>
              <CardDescription>{grant.subject}</CardDescription>
            </CardHeader>
            <CardContent className="stack">
              <dl className="metadata-list">
                <div>
                  <dt>Frequency</dt>
                  <dd>
                    {bounds[grant.id] ?? grant.frequency} {grant.period}
                  </dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>{grant.budget} · paid execution excluded</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{grant.expiry}</dd>
                </div>
                <div>
                  <dt>Boundary</dt>
                  <dd>{grant.boundary}</dd>
                </div>
                <div>
                  <dt>Recovery</dt>
                  <dd>{grant.recovery}</dd>
                </div>
              </dl>
              <Status
                evidence={fixtureLive(
                  "Fixture grant record, not a live authorization.",
                )}
              />
            </CardContent>
            <CardFooter>
              <Dialog
                open={editing === grant.id}
                onOpenChange={(open) => {
                  setEditing(open ? grant.id : null);
                  setDraft(bounds[grant.id] ?? grant.frequency);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ShieldCheck />
                    Review bounds
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Review this standing grant</DialogTitle>
                    <DialogDescription>
                      {grant.operation} · {grant.subject}. This is separate from
                      approving a pending action.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (draft > 0 && draft <= 100) {
                        changeGrant(grant.id, draft, agent.id);
                        setEditing(null);
                        setSaved(true);
                      }
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="frequency">
                          Maximum uses {grant.period}
                        </FieldLabel>
                        <Input
                          id="frequency"
                          type="number"
                          required
                          min={1}
                          max={100}
                          value={draft}
                          onChange={(e) => setDraft(Number(e.target.value))}
                        />
                      </Field>
                    </FieldGroup>
                    <div className="grant-delta">
                      <span>
                        Current: {bounds[grant.id] ?? grant.frequency}{" "}
                        {grant.period}
                      </span>
                      <ArrowUpRight />
                      <strong>
                        Proposed: {draft} {grant.period}
                      </strong>
                    </div>
                    <p className="body-copy">
                      Budget stays {grant.budget}. Expiry stays {grant.expiry}.
                      This change does not authorize sending or deletion, and
                      does not approve any Inbox request.
                    </p>
                    <DialogFooter className="dialog-actions">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit">Apply to preview</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardFooter>
          </Card>
        ))}
      </div>
      {saved && (
        <p className="inline-notice" role="status">
          Preview bounds changed. No live permission was granted.
        </p>
      )}
      <div className="two-column section-gap">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Which model, and what it costs</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="stack">
            <strong>{agent.model}</strong>
            <p className="body-copy">{agent.routing}</p>
            <p className="fine-print">{agent.spend}</p>
            <Status
              evidence={{
                state: "unknown",
                detail: "Unknown charges are not counted as free.",
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Recent activity</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="stack">
            {agent.activity.map((item) => (
              <p className="activity-line" key={item}>
                {item}
              </p>
            ))}
            <SourceLink to={`/journal?actor=${agent.name}`}>
              Full audit trail
            </SourceLink>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
export function AgentsPage() {
  const { id } = useParams();
  const selected = agentFixtures.find((agent) => agent.id === id);
  return (
    <div className="page">
      <PageHeading
        eyebrow="Control / Agents"
        title={selected ? selected.name : "Useful, within clear limits."}
        description={
          selected
            ? selected.description
            : "The people-shaped parts of the system. Their permissions should be easier to read than their prompts."
        }
      />
      {id && !selected ? (
        <EmptyState title="Agent not found">
          Choose one of the fixture agents.
        </EmptyState>
      ) : selected ? (
        <>
          <Button asChild variant="ghost" className="back-link">
            <Link to="/agents">
              <ArrowLeft />
              All agents
            </Link>
          </Button>
          <AgentDetail key={selected.id} agent={selected} />
        </>
      ) : (
        <div className="agent-grid">
          {agentFixtures.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <div className="agent-identity">
                  <span className="agent-avatar">{agent.initials}</span>
                  <div>
                    <CardTitle>
                      <h2>{agent.name}</h2>
                    </CardTitle>
                    <CardDescription>{agent.role}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="stack">
                <p className="body-copy">{agent.description}</p>
                <Status
                  evidence={fixtureLive(
                    `${agent.grants.length} bounded grants in this fixture.`,
                  )}
                />
                <p className="fine-print">
                  {agent.model} · Local
                  <br />
                  {agent.spend}
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="outline" asChild>
                  <Link to={`/agents/${agent.id}`}>
                    Review grants
                    <ArrowUpRight />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
