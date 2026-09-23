# Isolated Ubuntu deployment

This source-build deployment preserves existing stacks. It uses a separate
Compose project and fresh state under `~/conker-deploy`; laptop sessions,
credentials and databases are not copied. Never run `down -v` as cleanup.

## Layout

- `sources/`: exported Git revisions of Companion and the five independent gates.
- `sources/companion/dashboard/dist/`: verified frontend production build.
- `state/`: private credentials, databases, models and TLS material (mode 0700).
- `recovery/`: inspection results, build logs and pre-change host configuration.
- `compose.json`: generated service manifest; runtime images should be pinned to
  inspected image IDs before starting. Record built image IDs for rollback.

Run `python3 sources/companion/deploy/ubuntu/prepare.py https://HOST:8443` from
the deployment directory. It generates credentials once and refreshes configuration
without resetting stores. Back up `state` and `compose.json` before changing origin
or regenerating a live deployment. It targets owner UID/GID 1000; adapt that user
mapping before installation on a different account.

## Network boundary

Only the HTTPS gateway publishes a host port: `127.0.0.1:18050`. Databases,
Ollama, vector indexing and service APIs have no host-published ports. Laya shares
Pi's network namespace and listens on loopback. Application containers run as
UID 1000 with capabilities dropped; databases retain their image startup defaults.
No container receives the Docker socket or the host filesystem.

Tailscale Serve may expose the gateway on a separate tailnet-only HTTPS port,
preserving an existing port 443 service. Do not enable Funnel. When proxying the
self-signed gateway, `https+insecure://127.0.0.1:18050` skips verification only
on that fixed host-local hop; browser-to-Tailscale TLS remains verified. Set the
gateway's exact HTTPS origin, including port, to the external address.

Tailscale ACLs determine which tailnet devices may connect. A host inspection
does not prove router port forwarding, remote tailnet administration or every
software dependency safe. Docker-group membership is effectively host root access;
sudo password prompts do not restrict a member's Docker authority.

## Operations

Install this deployment's launcher, preserving any existing command first:

```sh
mkdir -p ~/.local/bin
# If ~/.local/bin/conker exists, save it under your private recovery directory first.
install -m 755 ~/conker-deploy/sources/companion/deploy/ubuntu/conker ~/.local/bin/conker
conker status
conker auth reset-password
```

The launcher targets `~/conker-deploy` (override with `CONKER_DEPLOY_DIR`). Password
reset prompts privately and uses the same persistent auth database as the gateway.
It does not depend on Hermes. Direct Compose equivalents:

```sh
cd ~/conker-deploy
docker compose -f compose.json ps
docker compose -f compose.json up -d
docker compose -f compose.json stop
docker compose -f compose.json run --rm --no-deps gateway python -m gateway reset-password
```

After downloading the answer and embedding models, run `bootstrap_models.py`
inside Pi using `docker compose -f compose.json exec -T pi python <
sources/companion/deploy/ubuntu/bootstrap_models.py`. It preserves existing
configuration. The CPU preset keeps two models loaded to avoid repeatedly swapping
the answer and embedding models, with a five-GiB inference memory ceiling.

`acceptance.py --origin https://HOST:8443 --password-file PRIVATE_FILE` verifies
real chat and synthetic memory. Add `--workflows` for nested workflows, both
branches, loops, calculation, replay and temporary-grant removal. These checks
retain clearly named synthetic acceptance records. `check_runtime.py`, run inside
Pi, checks current semantic indexing and ranking without ingesting more evidence.

Resetting the owner password revokes previous browser sessions. Keep the initial
password file private and remove it after setting a personal passphrase.
Do not print `.env` files, full Docker inspection output or credentials into tickets.

Logs are rotated. The dedicated server's audited legacy AgentGate and FreeLLMAPI
workloads have been retired, with private data archives under `recovery`.
OS services, Docker, Tailscale, SSH and remote development access are retained.
Roll back host binding changes with the recorded systemd configuration,
and remove only the new Tailscale Serve port if reverting this deployment.

For a consistent cold backup, stop this Compose project, archive `state` and
`compose.json` with owner-only permissions, then restart it. Downloaded
`state/ollama` and `state/decisions` models can be excluded if their exact IDs and
checkpoint revisions are retained. Verify the archive digest. A restore must remain
isolated until gateway sessions are revoked; a valid archive alone is not a tested
restore. Keep an off-machine copy before relying on this server for irreplaceable data.

### Dedicated-server cleanup, 23 September 2026

`retire_freellmapi.py` archives and verifies FreeLLMAPI's volume before removing its
container, volume and image. It also removes the exact obsolete AgentGate backup
cron entry and archives old Hermes state, backup files and development scripts.
The old AgentGate review virtual environment was archived separately. Six unused
legacy Docker networks and an empty old SystemGate backup directory were removed.
Only the ten Conker application containers remain. Gateway health, MemoryGate's
Postgres/Qdrant/embedding checks, semantic retrieval and Laya ranking passed after
cleanup. No application credentials are recorded in this repository.

**Firewall follow-up requires interactive sudo:** the existing LAN SSH exception
must be removed before claiming Tailscale-only inbound application access:

```sh
sudo ufw delete allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw status verbose
```

Keep the existing `tailscale0` IPv4/IPv6 allow rules and default inbound deny.
After applying, verify a fresh Tailscale SSH connection and HTTPS on port 8443,
then verify that a LAN connection to port 22 fails. Conker's Docker gateway is
published only on loopback; do not publish backend ports on all interfaces.
Tailscale transport traffic itself remains necessary. The firewall change was
prepared but not applied by the cleanup script because sudo requires the owner's
password.
