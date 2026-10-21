"""Release acceptance, first run: sign in, configure the first run, check setup and rehearse a conversation."""

from __future__ import annotations

import hashlib
import http.cookiejar
import json
import re
import ssl
import urllib.request
import uuid
from typing import Any

from release_checks import AcceptanceError, assert_complete_setup, write_json


class FirstRunSteps:
    """The first-run steps of the acceptance gate, from sign-in to the completed rehearsal."""

    def setup_password_and_authenticate(self) -> None:
        self.runner.run(
            ["bash", "./conker", "auth", "setup"],
            input_text=f"{self.password}\n{self.password}\n",
            phase="host-password-setup",
        )
        certificate = self.runner.run(
            ["bash", "./conker", "auth", "certificate"], phase="certificate-export"
        ).stdout
        self.cert.write_text(certificate, encoding="utf-8")
        cert_sha = hashlib.sha256(certificate.encode()).hexdigest()
        context = ssl.create_default_context(cafile=str(self.cert))
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar), urllib.request.HTTPSHandler(context=context)
        )
        session = self._request_json(opener, "GET", "/auth/session")
        login = self._request_json(
            opener,
            "POST",
            "/auth/login",
            {"password": self.password},
            csrf=session.get("csrf_token"),
        )
        authenticated = self._request_json(opener, "GET", "/auth/session")
        if not authenticated.get("authenticated"):
            raise AcceptanceError("browser session did not become authenticated")
        self.browser = (opener, login.get("csrf_token") or authenticated.get("csrf_token"))
        self.evidence.artifact(
            "browser-auth.json",
            {
                "certificate_sha256": cert_sha,
                "login_authenticated": bool(login.get("authenticated")),
                "session_authenticated": True,
                "cookie_names": sorted(cookie.name for cookie in jar),
            },
        )
        self.evidence.event("browser-auth", "passed", tls_verified=True)

    def _request_json(
        self,
        opener: urllib.request.OpenerDirector,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        csrf: str | None = None,
        timeout: int = 30,
    ) -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Accept": "application/json", "Origin": "https://localhost:8050"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if csrf:
            headers["X-CSRF-Token"] = csrf
        request = urllib.request.Request(
            "https://localhost:8050" + path, data=data, headers=headers, method=method
        )
        with opener.open(request, timeout=timeout) as response:
            raw = response.read(1048577)
        if len(raw) > 1048576:
            raise AcceptanceError(f"response from {path} exceeded 1 MiB")
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise AcceptanceError(f"response from {path} was not a JSON object")
        return value

    def configure_first_run(self) -> None:
        self.runner.run(
            ["bash", "./conker", "setup", "run", "companion", "--accept"],
            phase="setup-companion",
        )
        options = self.runner.run(
            ["bash", "./conker", "setup", "models"], phase="setup-model-options"
        )
        model_options = json.loads(options.stdout)
        candidates = model_options.get("candidates")
        route = self.runner.env["CONKER_LOCAL_MODEL"]
        matching = [
            candidate
            for candidate in candidates or []
            if isinstance(candidate, dict)
            and candidate.get("route") == route
            and candidate.get("execution") == "local"
            and candidate.get("status") == "ready"
            and isinstance(candidate.get("id"), str)
        ]
        if len(matching) != 1:
            raise AcceptanceError(
                f"setup exposed {len(matching)} ready local candidates for {route}, expected one"
            )
        candidate = matching[0]
        self.runner.run(
            ["bash", "./conker", "setup", "run", "model", candidate["id"]],
            timeout=300,
            phase="setup-model-probe",
        )
        self.runner.run(
            ["bash", "./conker", "setup", "run", "memory", "--include"],
            phase="setup-memory",
        )
        self.runner.run(
            ["bash", "./conker", "setup", "run", "capabilities", "--include"],
            phase="setup-capabilities",
        )
        boundaries = self.runner.run(
            ["bash", "./conker", "inspect", "boundaries"], phase="setup-boundaries-inspect"
        )
        policy = json.loads(boundaries.stdout)
        digest = policy.get("digest")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise AcceptanceError("ToolGate boundary inspection returned no exact policy digest")
        self.runner.run(
            [
                "bash",
                "./conker",
                "setup",
                "run",
                "boundaries",
                "--confirm-digest",
                digest,
            ],
            phase="setup-boundaries-confirm",
        )
        assert self.snapshot_store is not None
        self.runner.run(
            [
                "bash",
                "./conker",
                "setup",
                "configure",
                "protection",
                "--destination",
                str(self.snapshot_store),
                "--retention",
                "2",
            ],
            phase="setup-protection-policy",
        )
        self.evidence.artifact(
            "setup-configuration.json",
            {
                "model_candidate_id": candidate["id"],
                "model_route": route,
                "model_execution": "local",
                "memory": "include",
                "capabilities": "include",
                "boundary_digest": digest,
                "protection_retention": 2,
            },
        )
        self.evidence.event("setup-configuration", "passed", steps=6)

    def verify_setup_status(self) -> None:
        result = self.runner.run(["bash", "./conker", "setup", "status"], phase="setup-status")
        status = json.loads(result.stdout)
        self.evidence.artifact("setup-status.json", status)
        assert_complete_setup(status)
        self.evidence.event("setup-status", "passed", reported_state=status.get("state"))

    def rehearse_conversation(self) -> None:
        if not self.require_conversation:
            self.evidence.event(
                "conversation", "skipped", reason="live conversation was explicitly disabled"
            )
            return
        opener, csrf = self.browser
        session = self._verified_post(opener, csrf, "/api/pi/sessions", {"title": "Release acceptance"})
        session_id = session.get("session_id")
        if not session_id:
            raise AcceptanceError("conversation rehearsal did not create a session")
        turn = self._verified_post(
            opener,
            csrf,
            f"/api/pi/sessions/{session_id}/turns",
            {
                "text": "Reply with exactly: assembled release accepted",
                "request_id": "release_acceptance_" + uuid.uuid4().hex,
            },
            timeout=240,
        )
        content = ((turn.get("message") or {}).get("content") or "").strip()
        if not turn.get("turn_id") or not content:
            raise AcceptanceError("bounded conversation produced no recorded answer")
        self.evidence.artifact(
            "conversation.json",
            {
                "session_id": session_id,
                "turn_id": turn.get("turn_id"),
                "status": turn.get("status"),
                "reply_sha256": hashlib.sha256(content.encode()).hexdigest(),
                "reply_length": len(content),
            },
        )
        self.evidence.event("conversation", "passed", bounded_timeout_seconds=240)

    def complete_rehearsal(self) -> None:
        if not self.require_conversation:
            raise AcceptanceError(
                "complete release acceptance requires the conversation rehearsal"
            )
        self.runner.run(
            ["bash", "./conker", "setup", "run", "rehearsal", "--review-memory"],
            phase="setup-rehearsal-memory",
        )
        started = self.runner.run(
            ["bash", "./conker", "setup", "run", "rehearsal", "--start-approval"],
            phase="setup-rehearsal-approval-start",
        )
        rehearsal = json.loads(started.stdout)
        request_id = rehearsal.get("approvalRequestId")
        if not isinstance(request_id, str) or not re.fullmatch(
            r"[A-Za-z][A-Za-z0-9_.:-]{0,127}", request_id
        ):
            raise AcceptanceError("rehearsal did not return one bounded approval request ID")
        approval = self.work / "rehearsal-approval.json"
        write_json(
            approval,
            {
                "operation": "decide",
                "id": request_id,
                "status": "approved",
                "note": "Release acceptance: fixed local setup rehearsal.",
            },
        )
        self.runner.run(
            ["bash", "./conker", "apply", "approvals", str(approval)],
            phase="setup-rehearsal-approval-decide",
        )
        self.runner.run(
            [
                "bash",
                "./conker",
                "setup",
                "run",
                "rehearsal",
                "--finish-approval",
                request_id,
            ],
            phase="setup-rehearsal-approval-finish",
        )
        finalized = self.runner.run(
            ["bash", "./conker", "setup", "run", "rehearsal", "--finalize"],
            phase="setup-rehearsal-finalize",
        )
        receipt = json.loads(finalized.stdout)
        if receipt.get("source") != "conker.first-run-rehearsal":
            raise AcceptanceError("Pi did not issue the expected first-run rehearsal receipt")
        self.evidence.artifact(
            "setup-rehearsal.json",
            {
                "approval_request_id": request_id,
                "receipt_id": receipt.get("receiptId"),
                "evidence_digest": receipt.get("evidenceDigest"),
                "source": receipt.get("source"),
                "subject": receipt.get("subject"),
            },
        )
        self.evidence.event("setup-rehearsal", "passed", approval_request_id=request_id)
