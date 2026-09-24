# 4 · Running Conker

Pick one of three ways.

| Way | For | Needs |
|---|---|---|
| [A · Preview](#a--preview-the-interface) | Looking around, UI work | Node.js 22.12+ |
| [B · Server](#b--server-ubuntu) | Real daily use | Ubuntu, Docker, about 16 GB RAM |
| [C · Local Windows stack](#c--local-windows-stack) | Backend development on Windows | Docker Desktop, Python 3.12, Ollama |

## A · Preview the interface

Sample data, no backend, nothing leaves your machine.

```sh
cd dashboard
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open http://localhost:5173.

## B · Server (Ubuntu)

This runs ten containers: gateway, Pi, ToolGate, MemoryGate, PostgreSQL, Qdrant, embeddings,
SystemGate, Ollama and Laya decisions. Only the gateway gets a port, on `127.0.0.1`. Share it on
your private network with Tailscale Serve.

1. Export the six repositories into `~/conker-deploy/sources/` and build the dashboard.
2. Generate configuration and credentials (safe to re-run, keeps existing data):
   ```sh
   python3 sources/companion/deploy/ubuntu/prepare.py https://HOST:8443
   ```
3. Start everything:
   ```sh
   docker compose -f compose.json up -d
   ```
4. Load models:
   ```sh
   docker compose -f compose.json exec -T pi python < sources/companion/deploy/ubuntu/bootstrap_models.py
   ```
5. Expose the gateway on the tailnet only. Do not use Funnel.
6. Check it works:
   ```sh
   acceptance.py --origin https://HOST:8443 --password-file FILE
   ```

Full guide: [deploy/ubuntu/README.md](../deploy/ubuntu/README.md).

### Day to day

```sh
conker status                 # what's running
docker compose -f compose.json logs pi
docker compose -f compose.json stop
```

### Reset the password

```sh
conker auth reset-password
```

This asks for the new password privately and signs out every browser.

### Backups

Stop the stack, archive `state/` and `compose.json`, check the archive's hash, then start the stack
again. Keep a copy on another machine. A restore starts in a held state and does not go straight
back into service. See [recovery](reference/recovery.md).

## C · Local Windows stack

From the repository root, with Docker Desktop and Ollama running:

```powershell
python scripts/local_stack.py init
python scripts/local_stack.py start postgres
python scripts/local_stack.py start memorygate
python scripts/local_stack.py start toolgate
python scripts/local_stack.py start decisions
python scripts/local_stack.py start pi
python scripts/local_stack.py start gateway
```

Open https://localhost:8050. State and logs are in `.local-run/`, which Git ignores. After
`npm run build`, restart the gateway to serve the new build.

Details: [reference/local-windows.md](reference/local-windows.md).

## Models

- **Default:** local models through Ollama, free and private. Small CPU models such as Qwen 2.5 3B
  work but are weak.
- **Better answers:** add a hosted provider in Settings, Models. Every turn shows which provider
  answered.
- **Routing (optional):** the Laya decision service picks a model for each message. It takes about
  2 GB RAM and about 0.3 s per decision on CPU, and only sees the latest message.

## Security in one paragraph

Only the HTTPS gateway is reachable, and only from your private network. Services have no host
ports. Containers get no Docker socket or host filesystem. Anyone in the host's `docker` group
effectively has root. Hosted models, downloads and tools can still reach the internet. More detail:
[browser authentication](reference/browser-auth.md).
