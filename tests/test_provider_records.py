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


def test_the_direct_providers_use_their_own_hosts_and_headers(monkeypatch):
    expected = {
        "gemini": ("generativelanguage.googleapis.com", "x-goog-api-key", "sk-test"),
        "xai": ("api.x.ai", "Authorization", "Bearer sk-test"),
        "mistral": ("api.mistral.ai", "Authorization", "Bearer sk-test"),
        "deepseek": ("api.deepseek.com", "Authorization", "Bearer sk-test"),
        "groq": ("api.groq.com", "Authorization", "Bearer sk-test"),
    }
    for name, (host, header, value) in expected.items():
        outcome, sent = checked(monkeypatch, name, Answer(200))
        assert outcome == ("verified", "provider_credential_check")
        assert sent["host"] == host and sent["headers"][header] == value
        assert "anthropic-version" not in sent["headers"]


def test_google_answers_a_wrong_key_with_400():
    assert 400 in records.PROVIDERS["gemini"].rejected
    assert all(400 not in records.PROVIDERS[name].rejected for name in records.FIRST_PROVIDERS)


@pytest.mark.parametrize("name,result", [("gemini", "rejected"), ("openai", "unavailable")])
def test_a_400_is_rejected_only_where_the_provider_means_a_wrong_key(monkeypatch, name, result):
    (outcome, _), _sent = checked(monkeypatch, name, Answer(400))
    assert outcome == result


@pytest.mark.parametrize(
    "lines,released",
    [
        (None, records.FIRST_PROVIDERS),
        ("DIRECT_PROVIDERS_STATE=deferred\n", records.FIRST_PROVIDERS),
        ("PI_VERSION=0.16.1\nDIRECT_PROVIDERS_STATE=active\n", tuple(records.PROVIDERS)),
    ],
)
def test_a_release_offers_the_direct_providers_only_when_it_says_so(tmp_path, lines, released):
    versions = tmp_path / "versions.env"
    if lines is not None:
        versions.write_text(lines, encoding="utf-8")
    assert records.released_providers(versions) == released
