"""Smoke-test a running local workspace through the Gateway, as the browser does.

Run after `python scripts/workspace.py install` and `up`: signs in with the workspace's initial
owner password (never printed), then checks the dashboard is served, one chat round trip with the
real model, the Inbox list, and a chat moved to the Trash and restored. CI runs it
(.github/workflows/stack-smoke.yml); it exits non-zero on the first failed check.
"""

from __future__ import annotations

import json
import secrets
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.workspace import ORIGIN, STATE

ANSWER_SECONDS = 300
FAILED_TURNS = {"failed", "cancelled"}


class SmokeFailure(Exception):
    pass


class Gateway:
    """One signed-in browser session: the cookie, the CSRF token and the exact Origin."""

    def __init__(self, origin: str, certificate: Path):
        self.origin = origin
        self.cookies: dict[str, str] = {}
        self.csrf = ""
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(
                context=ssl.create_default_context(cafile=str(certificate))
            ),
        )

    def raw(self, method, path, body=None, query=None, accept="application/json"):
        url = self.origin + path + ("?" + urllib.parse.urlencode(query) if query else "")
        headers = {"Accept": accept, "Origin": self.origin}
        if self.cookies:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        data = None
        if method != "GET":
            headers["X-CSRF-Token"] = self.csrf
            headers["Content-Type"] = "application/json"
            data = json.dumps(body if body is not None else {}).encode()
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with self.opener.open(request, timeout=30) as response:
                status, text = response.status, response.read().decode()
                cookies = response.headers.get_all("Set-Cookie") or []
        except urllib.error.HTTPError as error:
            raise SmokeFailure(
                f"{method} {path} answered {error.code}: {error.read().decode()[:300]}"
            ) from None
        for line in cookies:
            name, _, value = line.split(";", 1)[0].partition("=")
            self.cookies[name.strip()] = value.strip()
        return status, text

    def request(self, method, path, body=None, query=None):
        _, text = self.raw(method, path, body, query)
        return json.loads(text) if text else {}

    def sign_in(self, password: str):
        self.csrf = self.request("GET", "/auth/session")["csrf_token"]
        self.request("POST", "/auth/login", {"password": password})
        # Login rotates the session; use the new token from here on.
        session = self.request("GET", "/auth/session")
        if not session.get("authenticated"):
            raise SmokeFailure("Sign-in did not authenticate the session.")
        self.csrf = session["csrf_token"]


def check_dashboard(gateway) -> str:
    for path in ("/", "/inbox"):
        status, text = gateway.raw("GET", path, accept="text/html")
        if status != 200 or '<div id="root">' not in text:
            raise SmokeFailure(f"GET {path} did not serve the dashboard.")
    return "dashboard served at / and /inbox"


def chat_round_trip(gateway, seconds=ANSWER_SECONDS, sleep=time.sleep) -> tuple[str, str]:
    """A new chat, one message, and the model's answer saved in it. Returns (chat id, summary)."""
    created = gateway.request("POST", "/api/pi/sessions", {"title": "Stack smoke"})
    session = created["session_id"]
    request_id = secrets.token_hex(16)
    text = "Reply with one short sentence: what is two plus two?"
    gateway.request(
        "POST", f"/api/pi/sessions/{session}/turns", {"text": text, "request_id": request_id}
    )
    deadline = time.monotonic() + seconds
    while True:
        detail = gateway.request("GET", f"/api/pi/sessions/{session}")
        turns = detail.get("turns") or []
        failed = [turn for turn in turns if turn.get("status") in FAILED_TURNS]
        if failed:
            raise SmokeFailure(
                f"Turn {failed[0].get('status')}: {str(failed[0].get('detail'))[:300]}"
            )
        answers = [
            message["content"]
            for message in detail.get("messages") or []
            if message.get("role") == "assistant"
            and isinstance(message.get("content"), str)
            and message["content"].strip()
        ]
        settled = turns and all(turn.get("status") != "running" for turn in turns)
        if answers and settled:
            last = turns[-1]
            summary = (
                f"chat answered ({last.get('status')}, {last.get('provider')}/{last.get('model')}):"
                f" {answers[-1].strip()[:80]!r}"
            )
            return session, summary
        if time.monotonic() >= deadline:
            raise SmokeFailure(f"No answer within {seconds}s; turns: {turns}")
        sleep(2)


def check_inbox(gateway) -> str:
    page = gateway.request("GET", "/api/owner/requests", query={"limit": 50})
    if not isinstance(page.get("results"), list) or "next_cursor" not in page:
        raise SmokeFailure(f"Inbox list has an unexpected shape: {sorted(page)}")
    return f"inbox listed ({len(page['results'])} requests)"


def history(gateway, trashed: bool) -> list[str]:
    query = {"limit": 50, **({"trashed": "only"} if trashed else {})}
    page = gateway.request("GET", "/api/pi/sessions/history", query=query)
    return [row["id"] for row in page["results"]]


def trash_and_restore(gateway, session: str) -> str:
    for trashed in (True, False):
        result = gateway.request(
            "POST", "/api/control/pi/sessions/trash", {"sessions": [session], "trashed": trashed}
        )
        if result != {"sessions": [session], "trashed": trashed}:
            raise SmokeFailure(f"Trash answered {result}")
        in_trash, in_list = session in history(gateway, True), session in history(gateway, False)
        if (in_trash, in_list) != (trashed, not trashed):
            where = "trash" if trashed else "chat list"
            raise SmokeFailure(f"Chat is not in the {where} after trashed={trashed}.")
    return "chat moved to Trash and restored"


def main() -> int:
    password = (STATE / "gateway/initial-owner-password.txt").read_text().strip()
    gateway = Gateway(ORIGIN, STATE / "gateway/tls.crt")
    started = time.monotonic()
    try:
        gateway.sign_in(password)
        print("signed in")
        print(check_dashboard(gateway))
        session, summary = chat_round_trip(gateway)
        print(summary)
        print(check_inbox(gateway))
        print(trash_and_restore(gateway, session))
    except SmokeFailure as error:
        print(f"FAILED: {error}", file=sys.stderr)
        return 1
    print(f"stack smoke passed in {time.monotonic() - started:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
