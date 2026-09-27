# Owner-terminal local candidate evidence - 27 September 2026

This record covers a local `linux/amd64` candidate built from the current Pi working
tree. It is useful pre-promotion evidence, not a release identity and not target-Ubuntu
acceptance. The source tree is dirty, the image has not been published, and no registry
digest exists for `ghcr.io/conker-ai/pi-owner-terminal:0.4.0`.

## Environment

- Docker Engine: `29.5.3`
- Platform: `linux/amd64`
- Kernel: `6.18.33.1-microsoft-standard-WSL2`
- Local image ID: `sha256:d524bf71f00cc1e266d1c9cb3ac61b69a0fe35ad57df42ced80e3ca1bbda7483`
- Entrypoint: `["/usr/local/bin/conker-terminal"]`
- Runtime identity: `65532:65532`

The local image ID is content-addressed only inside this Docker engine. It must never be
copied into `OWNER_TERMINAL_IMAGE`, which requires a pullable
`repository@sha256:<registry-digest>` reference.

## Exact candidate inputs

| File | SHA-256 |
| --- | --- |
| `Dockerfile.terminal` | `4c8ceffa775990ccc4dd1f9b1d3693d3fe2aa1f9a3f79fcdf9420b56b92bf574` |
| `scripts/conker-terminal` | `271965b267235a09367f3c8e7c57d4cf93ff08a0838dc0e28ab3221fe17fae29` |
| `scripts/terminal_container_probe.py` | `d895b5a8ff39967dfe56c71aa3a994745b2bdf8262de2813e4f09ca0b2552a23` |
| `scripts/terminal_container_acceptance.sh` | `9089091cde4e2a9c789094b3deebd6c95e4b4f4295bc49c5f1a51cc261d39526` |
| `pi/owner_terminal.py` | `cbc16151aaa4618233aa62d83abe3a8d02e8d86cfb3d729fea61a943bfd2c9d1` |
| `pi/terminal_sidecar.py` | `e8df340ecbadb556f8ec31c354490203f1cffb326564170493fc146dacec0268` |

## Results

- The dedicated image contained only the three expected Python runtime files under
  `/app`, used UID/GID `65532:65532`, and retained the fixed launcher entrypoint.
- The container ran with no network, a read-only root, all capabilities dropped,
  `no-new-privileges`, bounded PIDs/memory/CPU, and only ephemeral control/workspace
  volumes plus a bounded `/tmp` tmpfs.
- The health heartbeat became ready without creating a PTY or reading the workspace.
- A distinct UID sharing only the control GID completed readiness, create, PTY output,
  resize, escaped-descendant cleanup, close and channel-loss shutdown. The supervisor
  exited `0` and the container stopped.
- The guarded Ubuntu generator active branch passed a local Linux fixture with an
  actual `65532:65532` workspace. It emitted the digest-pinned, networkless,
  read-only service; health-ordered Gateway dependency; two-mount boundary; and a
  canonical workspace device/inode record. The reviewed manifest remains deferred,
  so the ordinary generated deployment still contains none of these resources.
- The repository installer, host CLI and assembled release gate now select a static
  terminal Compose overlay only from active manifest state. A local Linux dry run
  preflighted an actual `65532:65532` workspace and Docker Compose resolved the merged
  model with no sidecar network, no Gateway workspace mount and the exact terminal
  image reference. This remains local packaging evidence, not target acceptance.
- The repeatable adversarial Docker harness passed both runs against local image ID
  `sha256:d524bf71f00cc1e266d1c9cb3ac61b69a0fe35ad57df42ced80e3ca1bbda7483`.
  It proved the shell boundary checks, escaped-descendant cleanup, a PTY-created fake
  listener, supervisor termination, channel loss and zero fake-listener admissions.
  Docker Desktop rewrites the WSL bind source internally, so only native target Linux
  may satisfy the harness's exact host-source comparison.
- Focused Python contracts: `11 passed, 4 skipped`. The skips require host facilities
  not supplied by this Windows/WSL2 test context and are not counted as acceptance.

## Promotion still required

1. Commit and review the exact terminal source, overlay and publish workflow.
2. Publish a terminal image and record its registry digest.
3. Run ADR-0012 acceptance on the target Ubuntu host, including the generated active
   service shape, listener replacement,
   supervisor termination, UID cleanup, gateway revocation and browser recovery.
4. Hash the retained acceptance bundle and set `OWNER_TERMINAL_STATE=active`,
   `OWNER_TERMINAL_IMAGE`, and `OWNER_TERMINAL_ACCEPTANCE_SHA256` together.
5. Run assembled release acceptance; its resolved Compose matrix must then include the
   exact terminal image and no additional terminal authority.
