"""Provider credential records: the rules a saved record must satisfy, and how a key check reads
the provider's answer."""

from __future__ import annotations

import http.client

import pytest

from scripts import provider_records as records

REVISION = "credential_" + "a" * 32
OTHER = "credential_" + "b" * 32
AT = "2026-10-23T00:00:00+00:00"


def active(**values):
    return {
        **records.empty_record(),
        "activeRevision": REVISION,
        "activeAt": AT,
        **values,
    }


def test_a_live_credential_cannot_also_be_revoked():
    records.validate_record(active(revokedRevisions=[OTHER]))
    with pytest.raises(
        records.ProviderSecretError, match="live provider credential is marked revoked"
    ):
        records.validate_record(active(revokedRevisions=[REVISION]))


@pytest.mark.parametrize(
    "values,message",
    [
        ({"activeRevision": "credential_short"}, "invalid revision"),
        ({"activeAt": "2026-10-23T00:00:00"}, "invalid timestamp"),
        ({"activeAt": None}, "active metadata is inconsistent"),
        ({"revokedRevisions": [OTHER, OTHER]}, "revocation state is invalid"),
        ({"verificationStatus": "verified"}, "verification metadata is stale"),
    ],
)
def test_malformed_records_are_refused(values, message):
    with pytest.raises(records.ProviderSecretError, match=message):
        records.validate_record(active(**values))


class Answer:
    def __init__(self, status, body=b"{}"):
        self.status, self.body = status, body

    def read(self, limit):
        return self.body[:limit]


def checked(monkeypatch, provider, answer):
    sent = {}

    class Connection:
        def __init__(self, host, port, *, timeout, context):
            sent.update(host=host, port=port)

        def request(self, method, path, headers):
            sent.update(method=method, path=path, headers=headers)

        def getresponse(self):
            if isinstance(answer, Exception):
                raise answer
            return answer

        def close(self):
            sent["closed"] = True

    monkeypatch.setattr(records.http.client, "HTTPSConnection", Connection)
    return records.verify_provider(records.PROVIDERS[provider], b"sk-test"), sent


@pytest.mark.parametrize(
    "answer,result",
    [
        (Answer(200), ("verified", "provider_credential_check")),
        (Answer(401), ("rejected", "provider_rejected")),
        (Answer(403), ("rejected", "provider_rejected")),
        (Answer(500), ("unavailable", "provider_http_500")),
        (
            Answer(200, b"x" * (records.MAX_RESPONSE_BYTES + 1)),
            ("unavailable", "response_too_large"),
        ),
        (http.client.RemoteDisconnected("gone"), ("unavailable", "RemoteDisconnected")),
    ],
)
def test_the_providers_answer_decides_verification(monkeypatch, answer, result):
    outcome, sent = checked(monkeypatch, "openrouter", answer)
    assert outcome == result
    assert sent["closed"] and sent["port"] == 443 and sent["method"] == "GET"


def test_each_provider_gets_its_own_header(monkeypatch):
    (_, openrouter), (_, anthropic) = (
        checked(monkeypatch, name, Answer(200))
        for name in ("openrouter", "anthropic")
    )
    assert openrouter["headers"]["Authorization"] == "Bearer sk-test"
    assert anthropic["headers"]["x-api-key"] == "sk-test"
    assert anthropic["headers"]["anthropic-version"] == "2023-06-01"
    assert (openrouter["host"], anthropic["host"]) == (
        "openrouter.ai",
        "api.anthropic.com",
    )
