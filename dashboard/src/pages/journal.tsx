import { useSearchParams } from "react-router";
import {
  GitFork,
  MessageCircle,
  ShieldCheck,
  CalendarClock,
  CircleDot,
} from "lucide-react";
import { Badge, Button, Status } from "../ui";
import { journalFixtures, type JournalEntry } from "../fixtures/journal";
import { usePreview } from "../state";
import { PageHeading, EmptyState, SourceLink } from "../components/common";

export function JournalPage() {
  const [params, setParams] = useSearchParams();
  const actor = params.get("actor") ?? "all";
  const date = params.get("date") ?? "";
  const { events } = usePreview();
  const local: JournalEntry[] = events.map((event) => ({
    ...event,
    time: "Now",
    detail:
      "Local preview interaction. No backend action or permission change occurred.",
    evidence: { state: "planned", detail: "Recorded in this tab only." },
  }));
  const rows = [...local, ...journalFixtures].filter(
    (row) =>
      (actor === "all" || row.actor === actor) && (!date || row.date === date),
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  }
  return (
    <div className="page journal-page">
      <PageHeading
        eyebrow="Reference / Journal"
        title="A record you can come back to."
        description="What happened, who did it, and what the evidence actually says."
      />
      <div className="filter-bar">
        <label className="filter-label">
          Actor
          <select
            aria-label="Filter by actor"
            value={actor}
            onChange={(e) => filter("actor", e.target.value)}
          >
            <option value="all">All actors</option>
            {["You", "Conker", "Workshop", "System"].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="filter-label">
          Date
          <input
            type="date"
            aria-label="Filter by date"
            value={date}
            onChange={(e) => filter("date", e.target.value)}
          />
        </label>
        <Button variant="ghost" onClick={() => setParams({})}>
          Clear filters
        </Button>
      </div>
      <div className="journal-list">
        {rows.map((row, i) => {
          const Icon =
            row.kind === "Fork"
              ? GitFork
              : row.kind === "Turn"
                ? MessageCircle
                : row.kind === "Decision"
                  ? ShieldCheck
                  : row.kind === "Job"
                    ? CalendarClock
                    : CircleDot;
          return (
            <div key={row.id}>
              {(i === 0 || rows[i - 1].date !== row.date) && (
                <h2 className="journal-date">
                  {row.date === "2026-09-12"
                    ? "Saturday, 12 September"
                    : row.date}
                </h2>
              )}
              <details className="journal-entry">
                <summary>
                  <span className="journal-time">{row.time}</span>
                  <span className="timeline-icon">
                    <Icon />
                  </span>
                  <span className="journal-summary">
                    <strong>{row.summary}</strong>
                    <small>
                      {row.actor} · {row.kind}
                    </small>
                  </span>
                </summary>
                <div className="journal-detail">
                  <p>{row.detail}</p>
                  <Status evidence={row.evidence} />
                  <SourceLink to={row.to}>Open source record</SourceLink>
                </div>
              </details>
            </div>
          );
        })}
        {!rows.length && (
          <EmptyState title="No events in this view.">
            Try a different date or actor. An empty view is not a failed
            connection.
          </EmptyState>
        )}
      </div>
      <p className="page-footnote">
        <Badge variant="outline">Fixture timeline</Badge> Preview decisions
        appear above the sample history and reset on reload.
      </p>
    </div>
  );
}
