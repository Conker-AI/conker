import { useState } from "react";
import {
  Database,
  HardDrive,
  Server,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Status,
  Badge,
} from "../ui";
import { useObject } from "../data/queries";
import type { ServiceRecord as ServiceFixture, SystemRecord } from "../features/management/types";
import { QueryState } from "../components/object-inspector";
import { PageHeading } from "../components/common";

function ServiceRows({ rows }: { rows: ServiceFixture[] }) {
  return (
    <div className="service-list">
      {rows.map((service) => (
        <div className="service-row" key={service.name}>
          <div className="service-name">
            <strong>{service.name}</strong>
            <small>{service.purpose}</small>
          </div>
          <div className="service-evidence">
            <Status evidence={service.evidence} />
          </div>
          <Badge variant="outline" className="version-badge">
            {service.version}
          </Badge>
        </div>
      ))}
    </div>
  );
}
export function SystemPage() {
  const [refreshed, setRefreshed] = useState(false);
  const query = useObject<SystemRecord>("system", "overview");
  if (!query.data) return <div className="page"><QueryState loading={query.isPending} error={query.error} /></div>;
  const { services: serviceFixtures, databases: databaseFixtures, host: hostFixtures, backup: backupFixture, manifest: backupManifestFixture } = query.data;
  return (
    <div className="page system-page">
      <PageHeading
        eyebrow="Control / Your server"
        title="A clear picture of the machine."
        description="What was checked, what is old, and what we don’t know."
      >
        <Button variant="outline" onClick={() => setRefreshed(true)}>
          <RefreshCw />
          Replay health sample
        </Button>
      </PageHeading>
      {refreshed && (
        <p className="inline-notice" role="status">
          Fixture sample replayed. No server was contacted; the degraded and
          stale readings remain.
        </p>
      )}
      <div className="system-notice">
        <Status
          evidence={{
            state: "degraded",
            detail:
              "Meaning search needs attention. Chat and scoped actions are available in this sample.",
          }}
        />
        <Button variant="link" asChild>
          <Link to="/memory">
            What this affects
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <section className="vitals-section" aria-labelledby="host-title">
        <div className="section-heading">
          <h2 id="host-title">The box</h2>
          <span className="fine-print">
            conker-home · Linux · sample 7 minutes old
          </span>
        </div>
        <div className="vitals-grid">
          {hostFixtures.map((vital) => (
            <Card key={vital.label} className="vital-card">
              <CardHeader>
                <CardDescription>{vital.label}</CardDescription>
                <CardTitle>
                  <span className="vital-number">
                    {vital.value}
                    <small>{vital.unit}</small>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="meter"
                  role="meter"
                  aria-label={vital.label}
                  aria-valuenow={vital.used}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${vital.used}%` }} />
                </div>
                <p className="fine-print">{vital.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Status evidence={serviceFixtures[3].evidence} />
      </section>
      <Card className="service-card">
        <CardHeader>
          <div className="section-heading">
            <CardTitle>
              <h2>
                <Server />
                Services
              </h2>
            </CardTitle>
            <span className="fine-print">Health evidence · image tag</span>
          </div>
          <CardDescription>
            Configuration is not a health check.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServiceRows rows={serviceFixtures} />
        </CardContent>
      </Card>
      <Card className="service-card">
        <CardHeader>
          <CardTitle>
            <h2>
              <Database />
              Data stores
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceRows rows={databaseFixtures} />
        </CardContent>
      </Card>
      <div className="system-bottom">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>
                <HardDrive />A way back
              </h2>
            </CardTitle>
            <CardDescription>
              Backup and recovery are different claims.
            </CardDescription>
          </CardHeader>
          <CardContent className="stack">
            <div className="backup-meta">
              <strong>{backupFixture.time}</strong>
              <span>{backupFixture.size}</span>
            </div>
            <code className="path-label">{backupFixture.location}</code>
            <p className="fine-print">{backupFixture.contains}</p>
            <Status
              evidence={{
                state: "unknown",
                detail: "Latest snapshot’s recoverability is not yet verified.",
              }}
            />
            <p className="fine-print">{backupFixture.recovery}</p>
            <details>
              <summary>Inspect fixture manifest</summary>
              <pre>{JSON.stringify(backupManifestFixture, null, 2)}</pre>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Updates, deliberately</h2>
            </CardTitle>
            <CardDescription>
              No moving image tags. No silent upgrades.
            </CardDescription>
          </CardHeader>
          <CardContent className="stack">
            <Status
              evidence={{
                state: "unknown",
                detail:
                  "Registry versions have not been checked in this preview.",
              }}
            />
            <p className="body-copy">
              The tags above are fixture versions, not a claim that your
              installation is current.
            </p>
            <Status
              evidence={{
                state: "blocked",
                detail: "Update execution is not connected.",
              }}
            />
            <Status
              evidence={{ state: "empty", detail: "No update plan is queued." }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
