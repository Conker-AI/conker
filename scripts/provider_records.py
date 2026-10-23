"""Provider credential records: their shape, the supported providers and how a key is checked
with each, and the rules a saved record must satisfy. Shared by the host-only secret store and
its callers."""

from __future__ import annotations

import http.client
import re
import ssl
from dataclasses import dataclass
from datetime import UTC, datetime

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
    )
}


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
        if response.status in {401, 403}:
            return "rejected", "provider_rejected"
        return "unavailable", f"provider_http_{response.status}"
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        return "unavailable", type(exc).__name__
    finally:
        connection.close()
