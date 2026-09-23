# Ubuntu acceptance — 23 September 2026

Source-built Conker installed alongside the existing AgentGate stack on Ubuntu
26.04 LTS, i7-8700K, 16 GB RAM. Existing application data and services were retained.
This is acceptance of the connected subset, not a claim that every preview screen
has a production backend.

## Verified

- Ten containers running: gateway, Pi, ToolGate, MemoryGate, PostgreSQL, Qdrant,
  embeddings, SystemGate, Ollama and Laya decisions.
- Tailnet-only HTTPS on port 8443; existing private port 443 service preserved.
- Real authenticated chat: Qwen 2.5 3B returned 42 for the arithmetic smoke test.
- Synthetic memory ingestion, recall, semantic indexing and independently selected
  Laya ranking. Final check: all memory dependencies healthy, zero pending indexes.
- Nested editor workflows: true/false branches, loops, calculation, stored history
  and idempotent replay. Temporary execution grants removed; agent workflow inventory empty.
- Anonymous session API rejected with 401; mutation without fresh verification
  rejected with 428; verified mutation succeeded.
- Desktop and mobile live chat inspected; no browser console warnings/errors.
- Cold state archive created with services stopped, archive listing checked and
  SHA-256 verified. Services restarted successfully. Restore drill and off-host
  backup replication remain separate work.

## Host/network changes

- Old AgentGate development API and Vite listener changed from all interfaces to
  loopback, preserving the existing Tailscale proxy.
- SSH password/root login and X11 forwarding disabled; fresh key login verified.
- Temporary `NOPASSWD:ALL` sudo grant removed after deployment; prior configuration
  retained privately for recovery.
- Disposable apt cache cleaned; archived journal cleanup recovered about 1.2 GiB.
  Journal retention bounded to 512 MiB / 30 days, and new container logs rotated.
- TCP checks from the owner's PC: Tailscale exposes SSH and private HTTPS 443/8443;
  LAN exposes SSH. Checked application APIs, inference, databases and Docker API
  were unreachable on both addresses. No Tailscale Funnel configuration enabled.

## Remaining limits

No guarantee of zero risk: router rules, tailnet-admin ACLs and every dependency
vulnerability were not independently audited. The owner remains a Docker-group
member, which is effectively host-root authority even without passwordless sudo.
Conker containers do not receive that socket or host terminal access.

The CPU answer model is functional but not frontier-quality. Add a configured
provider for stronger answers. Routing remains disabled until there are multiple
eligible answer models; ranking is enabled independently. Hosted-provider credentials
and laptop conversations were not copied to the server.

Home and some other live routes still report their integration limits. Realtime
voice/vision and unrestricted system management were not made production-ready by
installing the stack. SystemGate runs without the host Docker socket; container
visibility does not imply full host control.

The initial owner password is stored privately on the host and in the owner's
ignored local deployment folder. Set a personal passphrase and remove those initial
password copies. The source guide contains the host reset command.
