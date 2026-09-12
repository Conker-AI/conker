import { useSearchParams } from "react-router";
import {
  GitFork,
  MessageCircle,
  ShieldCheck,
  CalendarClock,
  CircleDot,
} from "lucide-react";
import { Button, Status } from "../ui";
import type { JournalEvent } from "../domain/model";
import { useList } from "../data/queries";
import { ActionRecord } from "../components/action-record";
import { ObjectInspector, QueryState } from "../components/object-inspector";
import { PageHeading, EmptyState, SourceLink } from "../components/common";
export function JournalPage() {
  const [params, setParams] = useSearchParams();
  const actor = params.get("actor") ?? "all";
  const date = params.get("date") ?? "";
  const query = useList<JournalEvent>("journal");
  const rows = [...(query.data ?? [])]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (a.time === "Now"
          ? -1
          : b.time === "Now"
            ? 1
            : b.time.localeCompare(a.time)),
    )
    .filter(
      (row) =>
        (actor === "all" || row.actor === actor) &&
        (!date || row.date === date),
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
        description="One trail. The same action record wherever you open it."
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
      {query.isPending || query.error ? (
        <QueryState loading={query.isPending} error={query.error} />
      ) : (
        <div className="journal-list">
          {rows.map((row, index) => {
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
                {(index === 0 || rows[index - 1].date !== row.date) && (
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
                    <ObjectInspector
                      resource="journal"
                      id={row.id}
                      title={row.kind}
                    >
                      <p>{row.detail}</p>
                      {row.actionId ? (
                        <ActionRecord id={row.actionId} compact />
                      ) : (
                        <Status evidence={row.evidence} />
                      )}
                      <SourceLink to={row.to}>Open source record</SourceLink>
                    </ObjectInspector>
                  </div>
                </details>
              </div>
            );
          })}
          {!rows.length && (
            <EmptyState title="No events in this view.">
              Try another date or actor.
            </EmptyState>
          )}
        </div>
      )}
    </div>
  );
}
