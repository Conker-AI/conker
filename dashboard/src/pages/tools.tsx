import { useState } from "react";
import { Link, useParams } from "react-router";
import { Search, ArrowLeft, ArrowUpRight, Unplug } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Status,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui";
import { toolFixtures } from "../fixtures/tools";
import { fixtureLive } from "../fixtures/shared";
import { PageHeading, EmptyState, SourceLink } from "../components/common";

export function ToolsPage() {
  const { id } = useParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [offline, setOffline] = useState(false);
  const selected = toolFixtures.find((t) => t.id === id);
  const rows = toolFixtures.filter(
    (t) =>
      `${t.name} ${t.title} ${t.agents.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" || t.sensitivity === filter),
  );
  return (
    <div className="page">
      <PageHeading
        eyebrow="Control / Tools"
        title={selected?.title ?? "Capability, with consequence."}
        description="What each tool can do, how consequential it is, and who may address it."
      >
        <Button variant="ghost" onClick={() => setOffline(!offline)}>
          <Unplug />
          {offline
            ? "Restore fixture catalogue"
            : "Preview unavailable catalogue"}
        </Button>
      </PageHeading>
      {offline ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>The catalogue could not be reached.</h2>
            </CardTitle>
            <CardDescription>
              This is a connection problem, not a list of zero tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Status
              evidence={{
                state: "offline",
                detail:
                  "ToolGate did not answer the fixture request. Existing scopes are not assumed current.",
              }}
            />
          </CardContent>
        </Card>
      ) : selected ? (
        <>
          <Button asChild variant="ghost" className="back-link">
            <Link to="/tools">
              <ArrowLeft />
              All tools
            </Link>
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{selected.name}</h2>
              </CardTitle>
              <CardDescription>{selected.description}</CardDescription>
            </CardHeader>
            <CardContent className="stack">
              <Badge variant="outline">{selected.sensitivity}</Badge>
              <dl className="metadata-list">
                <div>
                  <dt>Scope</dt>
                  <dd>{selected.scope}</dd>
                </div>
                <div>
                  <dt>Recovery</dt>
                  <dd>{selected.recovery}</dd>
                </div>
                <div>
                  <dt>Recent use</dt>
                  <dd>{selected.recent}</dd>
                </div>
                <div>
                  <dt>Scoped agents</dt>
                  <dd>
                    {selected.agents.map((agent) => (
                      <SourceLink
                        key={agent}
                        to={`/agents/${agent.toLowerCase()}`}
                      >
                        {agent}
                      </SourceLink>
                    ))}
                  </dd>
                </div>
              </dl>
              <details open>
                <summary>Example arguments</summary>
                <pre>{JSON.stringify(selected.args, null, 2)}</pre>
              </details>
              <Status
                evidence={fixtureLive(
                  "Catalogue evidence supplied by the fixture, not the model.",
                )}
              />
            </CardContent>
          </Card>
        </>
      ) : id ? (
        <EmptyState title="That tool isn’t in this catalogue.">
          <Link to="/tools">Back to the tools</Link>
        </EmptyState>
      ) : (
        <>
          <div className="filter-bar">
            <div className="search-field">
              <Search aria-hidden="true" />
              <Input
                aria-label="Search tools"
                placeholder="Find a tool or agent…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Sensitivity"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All sensitivities</option>
              {["observe", "prepare", "act locally", "act outward"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <p className="body-copy section-intro">
            Observe → prepare → act locally → act outward. Being scoped to a
            tool does not mean it may run without a decision.
          </p>
          {rows.length ? (
            <Card className="catalogue-card">
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Sensitivity</TableHead>
                      <TableHead>Scoped to</TableHead>
                      <TableHead>Recent use</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((tool) => (
                      <TableRow key={tool.id}>
                        <TableCell>
                          <Link className="table-link" to={`/tools/${tool.id}`}>
                            {tool.title}
                            <ArrowUpRight />
                          </Link>
                          <small className="table-secondary">{tool.name}</small>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tool.sensitivity}</Badge>
                        </TableCell>
                        <TableCell>{tool.agents.join(", ")}</TableCell>
                        <TableCell className="table-muted">
                          {tool.recent}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <EmptyState title="No tools match that search.">
              Try a tool name or an agent.
            </EmptyState>
          )}
          <p className="page-footnote">
            Changing sensitivity is a governance decision. Editing live tool
            definitions is not part of this preview.
          </p>
        </>
      )}
    </div>
  );
}
