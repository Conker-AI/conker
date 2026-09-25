# Security policy

Conker holds someone's conversations and memories, and can act for them. Security reports are the
most useful contribution there is.

## Reporting a vulnerability

Please **don't open a public issue**. Report privately through GitHub:
**Security → Report a vulnerability** on the affected repository
([conker](https://github.com/Conker-AI/conker/security/advisories/new),
[pi](https://github.com/Conker-AI/pi/security/advisories/new),
[toolgate](https://github.com/Conker-AI/toolgate/security/advisories/new),
[memorygate](https://github.com/Conker-AI/memorygate/security/advisories/new),
[systemgate](https://github.com/Conker-AI/systemgate/security/advisories/new),
[embeddings](https://github.com/Conker-AI/embeddings/security/advisories/new)).

Include what an attacker can do, the steps to reproduce, and the version or commit. Conker is
maintained by one person, so reply times vary, and there is no bounty.

## What counts

The boundaries Conker promises, so anything that breaks them is in scope:

- An action reaching the outside world without going through ToolGate.
- An approval that can be used twice, used for different arguments, or forged.
- The browser reaching a service other than the Gateway, or receiving a service key.
- History being rewritten, or forgotten content surviving where it shouldn't.
- A health check reporting `ok` while a dependency is down.
- Secrets appearing in logs, responses or backups.

## Supported versions

Only the latest release of each service is supported. Conker is early software: run it on a private
network (for example Tailscale), never directly on the internet.
