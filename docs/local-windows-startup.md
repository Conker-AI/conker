# Local Windows integration

This setup uses the existing source checkouts on this machine. It is separate
from the Ubuntu deployment and from the fixture preview.

- Live authenticated UI: https://localhost:8050
- Fixture preview: http://localhost:5173 (does not represent live service state)
- State, credentials and logs: `companion/.local-run/`, excluded from Git.

## Start and stop

Start Docker Desktop first. In PowerShell, from `C:\Users\The1a\dev\companion`:

```powershell
$conkerPython = 'C:/Users/The1a/.cache/conker-memory-check/Scripts/python.exe'
& $conkerPython scripts/local_stack.py status
& $conkerPython scripts/local_stack.py start postgres
& $conkerPython scripts/local_stack.py start memorygate
& $conkerPython scripts/local_stack.py start toolgate
& $conkerPython scripts/local_stack.py start decisions
& $conkerPython scripts/local_stack.py start pi
& $conkerPython scripts/local_stack.py start gateway
```

Only start services whose ports are closed. The launcher refuses to replace an
existing listener. A listening port is not a health check. Logs for each service
are at `.local-run/<service>/service.log`; the dashboard's Settings page shows
actual model-provider health. Laya needs roughly 11 seconds to load on this CPU.

Ollama must also be running on localhost:11434 with the existing `qwen2.5:3b` and
`qwen3:4b` models. Start the installed Ollama application if it is stopped.

Use `stop SERVICE` in reverse order to stop these processes without deleting data.
The PostgreSQL container and volume are named `conker-local-integration-postgres`.
Never remove the volume as a routine restart step.

## Browser access

The local gateway has a self-signed certificate. Verify that the address is this
machine's localhost gateway; do not disable certificate validation globally.
The public certificate is `.local-run/gateway/tls.crt`. Keep `tls.key` private.

The initial owner password used for local acceptance is in the ignored file
`.local-run/gateway/initial-owner-password.txt`. It is not committed or displayed
in the integration report. Replace it with your own passphrase using the existing
host command, from `C:\Users\The1a\dev\gates\pi`:

```powershell
& 'C:/Users/The1a/.cache/conker-memory-check/Scripts/python.exe' -m gateway reset-password --db 'C:/Users/The1a/dev/companion/.local-run/gateway/auth.db'
```

This command prompts interactively and revokes existing browser sessions. After
success, the initial-password file is obsolete. Do not paste service credentials
into browser fields. Dashboard mutations use a fresh password verification for
the exact submitted operation.

## Serving a new frontend build

From `companion/dashboard`, run `npm run build`. Then stop/start the gateway using
the launcher. The gateway snapshots build assets at startup, so browser refresh
alone does not pick up a new build. Pi source changes likewise need a Pi restart.

## Current limits

Read `local-integration-plan.md` for verified journeys and remaining work. The
live shell connects memory inspection, model settings, conversations and activity;
unconnected screens say so explicitly. Memory retrieval uses text fallback without
vector embeddings. Laya is an English decision classifier; CPU answer generation
is performed separately by Ollama. Routing sees only the latest request, and
uncertain or unavailable routing may stop according to the configured policy.
Manual model selection is available. Bounded memory reranking is enabled in the
current local configuration; a fresh launcher initialization defaults it off.
ToolGate has no execution scopes configured in this isolated setup.
