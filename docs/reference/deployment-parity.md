# Minimum deployment parity

The repository installer and the isolated Ubuntu deployment expose the same connected
minimum product: the authenticated gateway serves compiled dashboard assets, Pi has
paired MemoryGate ingest/read credentials, owner approval and execution use separate
ToolGate credentials, and the proposal and scheduler workers are enabled but idle
until the owner configures them.

The repository installer builds `dashboard/dist` in a digest-pinned Node container
and mounts it read-only into the published Pi gateway image. Ubuntu mounts a verified
build from its reviewed source export and refuses preparation when it is absent.
Application service images are never replaced with local lookalike tags.
The Ubuntu generator reads the same validated `versions.env` and writes its PostgreSQL,
Qdrant and Ollama digest references directly into `compose.json`; it refuses a mutable
or malformed image reference before creating a deployment manifest.

Owner-terminal remains absent from both default layouts while its capability is
deferred. The Ubuntu generator and repository Compose overlay now have guarded active
paths: each requires the manifest's exact terminal image and acceptance hash plus an
operator-selected workspace, runs the canonical host preflight, records workspace
identity, and emits the isolated networkless service. The host CLI and assembled
release runner select the repository overlay from manifest state. These implemented
shapes are not activation evidence; the current manifest remains deferred until
publication and target-Linux acceptance are complete.

Laya remains one explicit packaging difference. Ubuntu is a source-build deployment
and builds its decision sidecar from the reviewed Companion source. The repository
installer has no published decision-service image to pin, so `PI_DECISION_URL` and
`PI_DECISION_KEY` are optional operator-supplied settings and are preserved on rerun.
Proposal and scheduling do not require this adapter; model routing and memory ranking
fall back visibly when no decision endpoint is configured. A future repository release
may add the sidecar only after its image is published and added to `versions.env`.

Recovery is layout-aware without becoming permissive. The Ubuntu profile must match the
generated ten-service manifest, captures every authoritative host-backed store including Laya's
model directory, uses the generated `conker` PostgreSQL identity and `/data/runtime.key`, and
excludes only the known read-only dashboard, provider-secret, telemetry and backup-observation
mounts. Any additional service, bind, database or changed runtime path fails before capture.
Snapshots carry their layout and database identity; older repository snapshots without those
fields retain the original repository defaults.

`tests/test_deployment_parity.py` compares these contracts, while
`tests/test_browser_auth.py` resolves the repository Compose model and checks the
credential and network boundaries.
