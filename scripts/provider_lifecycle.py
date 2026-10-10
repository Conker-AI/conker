"""Stop the owned provider service without taking ownership of native agent jobs."""

import json
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def graceful_stop(config, port):
    key = config.get("native_providers", {}).get("control_key")
    if not isinstance(key, str) or len(key) < 32:
        return False
    try:
        request = Request(
            f"http://127.0.0.1:{port}/lifecycle/stop",
            data=b"{}",
            headers={
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
            },
        )
        with build_opener(ProxyHandler({}), NoRedirect()).open(
            request, timeout=3
        ) as response:
            return json.loads(response.read(1025)) == {"status": "stopping"}
    except (ValueError, OSError, URLError):
        # A legacy/unresponsive service falls back only to exact service processes.
        return False


def stop(process, config, port, launcher):
    import psutil

    def matches(candidate):
        command = candidate.cmdline()
        return len(command) == 4 and command[1:] == [
            str(launcher),
            "serve",
            "providers",
        ]

    if not matches(process):
        raise SystemExit("Process identity no longer matches; nothing stopped.")
    # Windows venv Python can retain a launcher parent. Capture both exact service
    # processes, but never select Codex, Claude, supervisors or inference children.
    candidates = [process, *process.children(recursive=True)]
    owned = []
    for candidate in candidates:
        try:
            if matches(candidate):
                owned.append((candidate, candidate.create_time()))
        except psutil.NoSuchProcess:
            continue
    acknowledged = graceful_stop(config, port)
    _gone, alive = psutil.wait_procs(
        [item for item, _ in owned], timeout=15 if acknowledged else 0
    )

    def signal(candidate, created, method):
        try:
            # psutil caches create_time on a Process instance; obtain a fresh
            # identity before signaling rather than trusting that cached value.
            current = psutil.Process(candidate.pid)
            if current.create_time() != created or not matches(current):
                raise SystemExit(
                    "Provider process identity changed; nothing else stopped."
                )
            getattr(current, method)()
        except psutil.NoSuchProcess:
            pass

    for candidate, created in reversed(owned):
        if candidate in alive:
            signal(candidate, created, "terminate")
    _gone, alive = psutil.wait_procs(alive, timeout=3)
    for candidate, created in reversed(owned):
        if candidate in alive:
            signal(candidate, created, "kill")
    _gone, alive = psutil.wait_procs(alive, timeout=2)
    if alive:
        raise SystemExit("Provider service stop was not confirmed; check its status.")
