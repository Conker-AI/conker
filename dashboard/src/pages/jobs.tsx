import { Link, useParams } from "react-router";
import { ArrowLeft, Pause, Play, CalendarClock } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Status,
} from "../ui";
import { jobFixtures } from "../fixtures/jobs";
import { usePreview } from "../state";
import { PageHeading, SourceLink, EmptyState } from "../components/common";
import { fixtureLive } from "../fixtures/shared";

export function JobsPage() {
  const { id } = useParams();
  const { jobState, updateJob, record } = usePreview();
  const rows = jobFixtures.filter((job) => !id || job.id === id);
  return (
    <div className="page">
      <PageHeading
        eyebrow="Control / Jobs"
        title="The things that tick along."
        description="Small background routines. Clear limits. A record of what they produced."
      >
        <Badge variant="outline">Asia/Jerusalem</Badge>
      </PageHeading>
      {id && (
        <Button variant="ghost" asChild className="back-link">
          <Link to="/jobs">
            <ArrowLeft />
            All jobs
          </Link>
        </Button>
      )}
      <div className="jobs-list">
        {rows.map((job) => {
          const state = jobState[job.id] ?? { paused: false, runs: 0 };
          return (
            <Card key={job.id}>
              <CardHeader>
                <div className="section-heading">
                  <div className="job-title">
                    <CalendarClock />
                    <CardTitle>
                      <h2>
                        <Link to={`/jobs/${job.id}`}>{job.name}</Link>
                      </h2>
                    </CardTitle>
                  </div>
                  <Badge variant="secondary">{job.agent}</Badge>
                </div>
                <CardDescription>{job.description}</CardDescription>
              </CardHeader>
              <CardContent className="stack">
                <Status
                  evidence={
                    state.paused
                      ? {
                          state: "blocked",
                          detail:
                            "Paused in this preview. No next run is scheduled here.",
                        }
                      : { state: "planned", detail: job.schedule }
                  }
                />
                <div className="job-timing">
                  <div>
                    <span>Last run</span>
                    <strong>
                      {state.runs ? "Just now · fixture replay" : job.last}
                    </strong>
                  </div>
                  <div>
                    <span>Next run</span>
                    <strong>{state.paused ? "Paused" : job.next}</strong>
                  </div>
                </div>
                <div className="job-result">
                  <p className="eyebrow">What it produced</p>
                  <p>{job.produced}</p>
                  <SourceLink to={job.source}>Open result</SourceLink>
                </div>
                {state.runs > 0 && (
                  <Status
                    evidence={fixtureLive(
                      `Replayed ${state.runs} fixture run${state.runs > 1 ? "s" : ""}. No background process ran.`,
                    )}
                  />
                )}
                <details open={!!id}>
                  <summary>Run details & watermark</summary>
                  <dl className="metadata-list job-details">
                    <div>
                      <dt>Watermark</dt>
                      <dd className="mono">{job.watermark}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{job.duration}</dd>
                    </div>
                    <div>
                      <dt>Cost</dt>
                      <dd>{job.cost}</dd>
                    </div>
                    <div>
                      <dt>Authority</dt>
                      <dd>
                        Uses the agent’s existing bounded grants. No job can
                        widen them.
                      </dd>
                    </div>
                  </dl>
                </details>
              </CardContent>
              <CardFooter className="job-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    updateJob(job.id, { ...state, paused: !state.paused });
                    record(
                      `${state.paused ? "Resumed" : "Paused"} ${job.name} · preview only`,
                      "Job",
                      `/jobs/${job.id}`,
                    );
                  }}
                >
                  {state.paused ? <Play /> : <Pause />}
                  {state.paused ? "Resume schedule" : "Pause"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={state.paused}
                  onClick={() => {
                    updateJob(job.id, { ...state, runs: state.runs + 1 });
                    record(
                      `Replayed ${job.name} fixture`,
                      "Job",
                      `/jobs/${job.id}`,
                    );
                  }}
                >
                  <Play />
                  Run now
                </Button>
                <span className="fine-print">
                  Replays a local fixture only.
                </span>
              </CardFooter>
            </Card>
          );
        })}
        {!rows.length && (
          <EmptyState title="That job isn’t in this preview.">
            <Link to="/jobs">Back to scheduled work</Link>
          </EmptyState>
        )}
      </div>
    </div>
  );
}
