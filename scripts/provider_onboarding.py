"""Provider-owned login and model discovery; no inference or ambient credentials."""

from __future__ import annotations

import base64
import hashlib
import http.client
import json
import re
import secrets
import ssl
import threading
import time
from urllib.parse import urlencode

from scripts.provider_secrets import PROVIDERS, REVISION, ProviderSecretError

MODEL_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_./:+-]{0,299}")
LOGIN_ID = re.compile(r"login_[0-9a-f]{32}")
MAX_MODELS = 1000
MAX_RESPONSE = 4_000_000


def provider_json(host, path, *, body=None, headers=None):
    connection = http.client.HTTPSConnection(
        host, timeout=20, context=ssl.create_default_context()
    )
    try:
        connection.request(
            "POST" if body is not None else "GET",
            path,
            body=None if body is None else json.dumps(body),
            headers={"Accept": "application/json", **(headers or {}),
                     **({"Content-Type": "application/json"} if body is not None else {})},
        )
        response = connection.getresponse()
        content = response.read(MAX_RESPONSE + 1)
        if response.status != 200 or len(content) > MAX_RESPONSE:
            raise ProviderSecretError("Provider request was not confirmed.")
        value = json.loads(content)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (OSError, ValueError, http.client.HTTPException):
        raise ProviderSecretError("Provider is unavailable. No request was retried.") from None
    finally:
        connection.close()


class ProviderOnboarding:
    def __init__(self, control, *, request=provider_json, clock=time.monotonic):
        self.control, self.request, self.clock = control, request, clock
        self.lock = threading.RLock()
        self.attempt = None
        self.login_state = "idle"

    def _guard(self):
        if self.control.policy.status()["policyRecoveryRequired"] or any(
            (self.control.root / name).exists()
            for name in (".conker-recovery.json", ".conker-backup.lock")
        ):
            raise ProviderSecretError("Finish installation recovery before connecting.")

    def _record(self, provider):
        return next(row for row in self.control.store.status()["providers"] if row["id"] == provider)

    def _expire(self):
        if self.attempt and self.clock() >= self.attempt["expires"]:
            self.attempt = None
            self.login_state = "expired"

    def status(self):
        with self.lock:
            self._expire()
            return {"kind": "login", "available": True, "provider": "openrouter",
                    "loginId": self.attempt["id"] if self.attempt else None,
                    "loginState": self.login_state, "credentialsIncluded": False}

    def apply(self, value):
        with self.lock:
            self._guard()
            if not isinstance(value, dict):
                raise ProviderSecretError("Invalid onboarding operation.")
            operation = value.get("operation")
            if operation == "models":
                return self.models(value)
            if operation == "login":
                if set(value) != {"operation", "provider", "activeRevision", "stagedRevision"} or value["provider"] != "openrouter":
                    raise ProviderSecretError("Only OpenRouter browser sign-in is supported here.")
                self._expire()
                if self.attempt:
                    raise ProviderSecretError("Cancel the pending sign-in first.")
                record = self._record("openrouter")
                expected = (value["activeRevision"], value["stagedRevision"])
                if expected != (record["activeRevision"], record["stagedRevision"]) or record["activationPending"]:
                    raise ProviderSecretError("Credential changed; refresh before connecting.")
                verifier = secrets.token_urlsafe(48)
                challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
                self.attempt = {"id": "login_" + secrets.token_hex(16), "verifier": verifier,
                                "expected": expected, "expires": self.clock() + 600}
                self.login_state = "pending"
                return {**self.status(), "authorizationUrl": "https://openrouter.ai/auth?" + urlencode({
                    "code_challenge": challenge, "code_challenge_method": "S256", "key_label": "Conker",
                })}
            if operation not in {"complete", "cancel"} or value.get("provider") != "openrouter" or set(value) != ({"operation", "provider", "loginId", "code"} if operation == "complete" else {"operation", "provider", "loginId"}):
                raise ProviderSecretError("Invalid onboarding operation.")
            self._expire()
            if not self.attempt or value["loginId"] != self.attempt["id"]:
                raise ProviderSecretError("Sign-in changed or expired. Start again.")
            if operation == "cancel":
                self.attempt = None
                self.login_state = "canceled"
                return self.status()
            code = value["code"]
            if not isinstance(code, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{8,2048}", code):
                raise ProviderSecretError("Invalid authorization code.")
            # Consume before exchange: ambiguous network failures must not replay a code.
            attempt, self.attempt = self.attempt, None
            self.login_state = "failed"
            record = self._record("openrouter")
            if attempt["expected"] != (record["activeRevision"], record["stagedRevision"]):
                raise ProviderSecretError("Credential changed; start a new sign-in.")
            response = self.request("openrouter.ai", "/api/v1/auth/keys", body={
                "code": code, "code_verifier": attempt["verifier"], "code_challenge_method": "S256",
            })
            key = response.get("key")
            if not isinstance(key, str) or not re.fullmatch(r"sk-or-[!-~]{8,4090}", key):
                raise ProviderSecretError("Provider did not return a valid credential.")
            self.control.store.stage("openrouter", key.encode(), expected=attempt["expected"])
            self.login_state = "complete"
            return self.status()

    def models(self, value):
        provider, revision = value.get("provider"), value.get("revision")
        if set(value) != {"operation", "provider", "revision"} or provider not in PROVIDERS or not isinstance(revision, str) or not REVISION.fullmatch(revision):
            raise ProviderSecretError("Supply the active provider credential revision.")
        store = self.control.store
        store.initialize()
        with store.locked():
            record = store._view(provider, store._provider(store._load(), provider))
            if record["activeRevision"] != revision or not record["configured"] or record["activationPending"]:
                raise ProviderSecretError("Active credential changed; refresh before discovery.")
            secret = store._read_secret(store.active_path(provider)).decode("ascii")
        entry = PROVIDERS[provider]
        headers = {entry.header: entry.prefix + secret}
        if provider == "anthropic":
            headers["anthropic-version"] = "2023-06-01"
        path = {"openrouter": "/api/v1/models/user", "anthropic": "/v1/models?limit=1000", "openai": "/v1/models"}[provider]
        response = self.request(entry.host, path, headers=headers)
        # Never export arbitrary provider fields (pricing, headers, reasoning, credentials).
        rows = response.get("data")
        if not isinstance(rows, list):
            raise ProviderSecretError("Provider catalogue is unavailable.")
        models, seen = [], set()
        for row in rows[:MAX_MODELS]:
            if not isinstance(row, dict):
                continue
            identity = row.get("id")
            if not isinstance(identity, str) or not MODEL_ID.fullmatch(identity) or identity in seen:
                continue
            seen.add(identity)
            name = row.get("name") or row.get("display_name") or identity
            if not isinstance(name, str):
                name = identity
            models.append({"id": identity, "name": re.sub(r"[\x00-\x1f\x7f]", "", name)[:160] or identity[:160]})
        # A credential change during discovery invalidates its entire result.
        if self._record(provider)["activeRevision"] != revision:
            raise ProviderSecretError("Credential changed during model discovery.")
        return {"kind": "catalogue", "provider": provider, "revision": revision,
                "models": models, "catalogueComplete": len(rows) <= MAX_MODELS and not response.get("has_more", False),
                "credentialsIncluded": False}
