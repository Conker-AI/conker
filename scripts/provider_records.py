"""Provider credential records: their shape, the supported providers and how a key is checked
with each, and the rules a saved record must satisfy. Shared by the host-only secret store and
its callers."""

from __future__ import annotations

import http.client
import re
import ssl
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

MAX_RESPONSE_BYTES = 65536
REVISION = re.compile(r"credential_[0-9a-f]{32}")
BASIS = re.compile(r"[A-Za-z0-9_]{1,64}")
VERIFICATION_STATUSES = {"unverified", "verified", "rejected", "unavailable"}


class ProviderSecretError(RuntimeError):
    pass


@dataclass(frozen=True)
class Provider:
    identity: str
    host: str
    path: str
    header: str
    prefix: str
    # The statuses that mean "this key is wrong". Google answers a bad key with 400.
    rejected: frozenset[int] = frozenset({401, 403})


PROVIDERS = {
    item.identity: item
    for item in (
        Provider(
            "openrouter",
            "openrouter.ai",
            "/api/v1/auth/key",
            "Authorization",
            "Bearer ",
        ),
        Provider(
            "openai", "api.openai.com", "/v1/models?limit=1", "Authorization", "Bearer "
        ),
        Provider(
            "anthropic", "api.anthropic.com", "/v1/models?limit=1", "x-api-key", ""
        ),
        # Direct API keys for the other frontier labs: Pi releases after 0.16.0 read them.
        Provider(
            "gemini",
            "generativelanguage.googleapis.com",
            "/v1beta/models?pageSize=1",
            "x-goog-api-key",
            "",
            frozenset({400, 401, 403}),
        ),
        Provider("xai", "api.x.ai", "/v1/models", "Authorization", "Bearer "),
        # Mistral's full model list can pass the response cap; one model's card cannot.
        Provider(
            "mistral",
            "api.mistral.ai",
            "/v1/models/mistral-small-latest",
            "Authorization",
            "Bearer ",
        ),
        Provider("deepseek", "api.deepseek.com", "/models", "Authorization", "Bearer "),
        Provider("groq", "api.groq.com", "/openai/v1/models", "Authorization", "Bearer "),
    )
}
# The providers every Pi release reads. The others are offered only once the release says the
# pinned Pi reads them too (DIRECT_PROVIDERS_STATE=active in versions.env): an older gateway
# refuses a status with rows it does not know, and an older Pi would never see the key.
FIRST_PROVIDERS = ("openrouter", "openai", "anthropic")
DIRECT_PROVIDERS_RELEASE = "DIRECT_PROVIDERS_STATE=active"


def released_providers(versions_env: Path) -> tuple[str, ...]:
    """The provider ids this release's Pi reads, in PROVIDERS order."""
    try:
        lines = {line.strip() for line in versions_env.read_text(encoding="utf-8").splitlines()}
    except FileNotFoundError:
        lines = set()
    if DIRECT_PROVIDERS_RELEASE in lines:
        return tuple(PROVIDERS)
    return tuple(name for name in PROVIDERS if name in FIRST_PROVIDERS)


def now() -> str:
    return datetime.now(UTC).isoformat()


def empty_record() -> dict:
    return {
        "activeRevision": None,
        "activeAt": None,
        "stagedRevision": None,
        "stagedAt": None,
        "verificationStatus": None,
        "verificationBasis": None,
        "verifiedAt": None,
        "pendingActivation": None,
        "revokedRevisions": [],
    }


def validate_revision(value: object, *, optional: bool = True) -> None:
    if value is None and optional:
        return
    if not isinstance(value, str) or not REVISION.fullmatch(value):
        raise ProviderSecretError("Provider credential state has an invalid revision.")


def validate_timestamp(value: object, *, optional: bool = True) -> None:
    if value is None and optional:
        return
    if not isinstance(value, str) or len(value) > 64:
        raise ProviderSecretError("Provider credential state has an invalid timestamp.")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ProviderSecretError(
            "Provider credential state has an invalid timestamp."
        ) from exc
    if parsed.tzinfo is None:
        raise ProviderSecretError("Provider credential state has an invalid timestamp.")


def validate_record(record: dict) -> None:
    active, staged = record["activeRevision"], record["stagedRevision"]
    validate_revision(active)
    validate_revision(staged)
    validate_timestamp(record["activeAt"])
    validate_timestamp(record["stagedAt"])
    validate_timestamp(record["verifiedAt"])
    if bool(active) != bool(record["activeAt"]):
        raise ProviderSecretError(
            "Provider credential active metadata is inconsistent."
        )
    if bool(staged) != bool(record["stagedAt"]):
        raise ProviderSecretError(
            "Provider credential staged metadata is inconsistent."
        )

    status, basis = record["verificationStatus"], record["verificationBasis"]
    if status is not None and status not in VERIFICATION_STATUSES:
        raise ProviderSecretError("Provider credential verification state is invalid.")
    if basis is not None and (not isinstance(basis, str) or not 1 <= len(basis) <= 128):
        raise ProviderSecretError("Provider credential verification basis is invalid.")
    if staged is None:
        if status is not None or basis is not None or record["verifiedAt"] is not None:
            raise ProviderSecretError(
                "Provider credential verification metadata is stale."
            )
    elif status is None:
        raise ProviderSecretError(
            "Provider credential verification metadata is missing."
        )
    elif status == "unverified":
        if basis is not None or record["verifiedAt"] is not None:
            raise ProviderSecretError(
                "Provider credential verification metadata is invalid."
            )
    elif basis is None or record["verifiedAt"] is None:
        raise ProviderSecretError(
            "Provider credential verification metadata is missing."
        )

    pending = record["pendingActivation"]
    if pending is not None:
        if not isinstance(pending, dict) or set(pending) != {
            "revision",
            "previousRevision",
            "preparedAt",
        }:
            raise ProviderSecretError(
                "Provider credential activation state is invalid."
            )
        validate_revision(pending["revision"], optional=False)
        validate_revision(pending["previousRevision"])
        validate_timestamp(pending["preparedAt"], optional=False)
        if (
            pending["revision"] != staged
            or pending["previousRevision"] != active
            or status != "verified"
        ):
            raise ProviderSecretError(
                "Provider credential activation state is inconsistent."
            )

    revoked = record["revokedRevisions"]
    if (
        not isinstance(revoked, list)
        or len(revoked) > 100
        or len(revoked) != len(set(revoked))
    ):
        raise ProviderSecretError("Provider credential revocation state is invalid.")
    for revision in revoked:
        validate_revision(revision, optional=False)
    if active in revoked or staged in revoked:
        raise ProviderSecretError("A live provider credential is marked revoked.")


def verify_provider(provider: Provider, secret: bytes) -> tuple[str, str]:
    headers = {
        provider.header: provider.prefix + secret.decode("ascii"),
        "Accept": "application/json",
    }
    if provider.identity == "anthropic":
        headers["anthropic-version"] = "2023-06-01"
    connection = http.client.HTTPSConnection(
        provider.host, 443, timeout=10, context=ssl.create_default_context()
    )
    try:
        connection.request("GET", provider.path, headers=headers)
        response = connection.getresponse()
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            return "unavailable", "response_too_large"
        if 200 <= response.status < 300:
            return "verified", "provider_credential_check"
        if response.status in provider.rejected:
            return "rejected", "provider_rejected"
        return "unavailable", f"provider_http_{response.status}"
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        return "unavailable", type(exc).__name__
    finally:
        connection.close()
