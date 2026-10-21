"""Inbox CLI tests: everything that happened and everything that needs the owner."""

import io
import json
import sys
from pathlib import Path
from urllib.error import HTTPError

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker as cli
from conker_inbox import render


@pytest.fixture
def invoke(monkeypatch):
    calls, config_reads = [], []
    state = {"responses": []}

    def config():
        config_reads.append(True)
        return {
            "environments": {
                "gateway": {"GATEWAY_PI_OWNER_KEY": "fixture-owner-key"},
                "pi": {"PI_ADMIN_KEY": "fixture-admin-key"},
            }
        }

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            if not state["responses"]:
                raise AssertionError("unexpected request")

            response = state["responses"].pop(0)
            if isinstance(response, Exception):
                raise response

            raw = json.dumps(response, ensure_ascii=False).encode("utf-8")
            return io.BytesIO(raw)

    def opener(*handlers):
        assert handlers[0].proxies == {}
        assert isinstance(handlers[1], cli.NoRedirect)
        return Opener()

    def check_headers(call_index=0):
        """Check that a request has the correct headers."""
        request = calls[call_index][0]
        headers = dict(request.headers) if hasattr(request, "headers") else {}
        assert headers.get("X-pi-key") == "fixture-admin-key"
        assert headers.get("X-Pi-Owner-Key") is None

    monkeypatch.setattr(cli, "read_config", config)
    monkeypatch.setattr(cli, "build_opener", opener)

    def run(*arguments):
        monkeypatch.setattr(sys, "argv", ["conker.py", *map(str, arguments)])
        return cli.cli()

    return run, calls, config_reads, state, check_headers


def test_inbox_json_calls_pi_endpoint(invoke):
    run, calls, _, state, check_headers = invoke
    state["responses"] = [
        {
            "generatedAt": 1792240794.5,
            "day": {
                "date": "2026-10-17",
                "timeZone": "Asia/Jerusalem",
                "startsAt": 1792188000.0,
            },
            "needsYou": [
                {
                    "kind": "approval",
                    "id": "trn_1",
                    "title": "Trip planning",
                    "tool": "calendar.create",
                    "since": 1792200000.0,
                    "source": {},
                }
            ],
            "handled": [
                {
                    "kind": "task",
                    "title": "Renew library books",
                    "at": 1792210000.0,
                    "source": {},
                }
            ],
            "upcoming": [
                {
                    "kind": "job",
                    "id": "job_1",
                    "title": "Weekly review",
                    "at": 1792300000.0,
                    "source": {},
                }
            ],
            "impact": {
                "today": {
                    "answers": 4,
                    "actions": 2,
                    "tasksCompleted": 1,
                    "jobsCompleted": 0,
                    "costUsd": 0.0123,
                },
                "week": {
                    "answers": 30,
                    "actions": 9,
                    "tasksCompleted": 5,
                    "jobsCompleted": 3,
                    "costUsd": 0.2,
                },
            },
            "counts": {"needsYou": 1, "handled": 1, "upcoming": 1},
        }
    ]
    assert run("inbox", "--json") == 0
    assert len(calls) == 1
    check_headers(0)
    assert calls[0][0].full_url == "http://127.0.0.1:18551/inbox"
    assert calls[0][0].data is None


def test_inbox_renders_example_data():
    value = {
        "generatedAt": 1792240794.5,
        "day": {
            "date": "2026-10-17",
            "timeZone": "Asia/Jerusalem",
            "startsAt": 1792188000.0,
        },
        "needsYou": [
            {
                "kind": "approval",
                "id": "trn_1",
                "title": "Trip planning",
                "tool": "calendar.create",
                "since": 1792200000.0,
                "source": {},
            }
        ],
        "handled": [
            {
                "kind": "task",
                "title": "Renew library books",
                "at": 1792210000.0,
                "source": {},
            }
        ],
        "upcoming": [
            {
                "kind": "job",
                "id": "job_1",
                "title": "Weekly review",
                "at": 1792300000.0,
                "source": {},
            }
        ],
        "impact": {
            "today": {
                "answers": 4,
                "actions": 2,
                "tasksCompleted": 1,
                "jobsCompleted": 0,
                "costUsd": 0.0123,
            },
            "week": {
                "answers": 30,
                "actions": 9,
                "tasksCompleted": 5,
                "jobsCompleted": 3,
                "costUsd": 0.2,
            },
        },
        "counts": {"needsYou": 1, "handled": 1, "upcoming": 1},
    }

    result = render(value)

    # Check that every item line puts its time at exactly column 54 (1-based)
    lines = result.split("\n")
    for line in lines:
        if any(time_str in line for time_str in ["since 04:20", "07:06", "Sun 08:06"]):
            # Time text should start at character 53 (0-based), which is column 54 (1-based)
            assert line[53:] in ["since 04:20", "07:06", "Sun 08:06"], (
                f"Time not at column 54 in line: {line!r}"
            )

    expected = """Inbox · 2026-10-17 (Asia/Jerusalem)

Needs you (1)
  ! Trip planning: approve calendar.create           since 04:20
Handled (1)
  ✓ Renew library books                              07:06
Upcoming (1)
  · Weekly review                                    Sun 08:06
Impact today: 4 answers · 2 actions · 1 task · 0 jobs · $0.0123
This week:    30 answers · 9 actions · 5 tasks · 3 jobs · $0.2000"""

    assert result == expected


def test_inbox_renders_empty_data():
    value = {
        "generatedAt": 1792240794.5,
        "day": {
            "date": "2026-10-17",
            "timeZone": "Asia/Jerusalem",
            "startsAt": 1792188000.0,
        },
        "needsYou": [],
        "handled": [],
        "upcoming": [],
        "impact": {
            "today": {
                "answers": 0,
                "actions": 0,
                "tasksCompleted": 0,
                "jobsCompleted": 0,
                "costUsd": 0.0,
            },
            "week": {
                "answers": 0,
                "actions": 0,
                "tasksCompleted": 0,
                "jobsCompleted": 0,
                "costUsd": 0.0,
            },
        },
        "counts": {"needsYou": 0, "handled": 0, "upcoming": 0},
    }

    expected = """Inbox · 2026-10-17 (Asia/Jerusalem)

Needs you (0)
  nothing
Handled (0)
  nothing
Upcoming (0)
  nothing
Impact today: 0 answers · 0 actions · 0 tasks · 0 jobs · $0.0000
This week:    0 answers · 0 actions · 0 tasks · 0 jobs · $0.0000"""

    assert render(value) == expected


def test_inbox_urgent_attention_gets_exclamation(invoke, capsys):
    run, _calls, _, state, _ = invoke
    state["responses"] = [
        {
            "generatedAt": 1792240794.5,
            "day": {
                "date": "2026-10-17",
                "timeZone": "Asia/Jerusalem",
                "startsAt": 1792188000.0,
            },
            "needsYou": [
                {
                    "kind": "attention",
                    "id": "att_1",
                    "title": "Urgent matter",
                    "status": "pending",
                    "urgency": {"urgent": True},
                }
            ],
            "handled": [],
            "upcoming": [],
            "impact": {
                "today": {
                    "answers": 0,
                    "actions": 0,
                    "tasksCompleted": 0,
                    "jobsCompleted": 0,
                    "costUsd": 0.0,
                },
                "week": {
                    "answers": 0,
                    "actions": 0,
                    "tasksCompleted": 0,
                    "jobsCompleted": 0,
                    "costUsd": 0.0,
                },
            },
            "counts": {"needsYou": 1, "handled": 0, "upcoming": 0},
        }
    ]
    assert run("inbox") == 0
    output = capsys.readouterr()
    assert "! Urgent matter: pending" in output.out


def test_inbox_suggestion_gets_question_mark(invoke, capsys):
    run, _calls, _, state, _ = invoke
    state["responses"] = [
        {
            "generatedAt": 1792240794.5,
            "day": {
                "date": "2026-10-17",
                "timeZone": "Asia/Jerusalem",
                "startsAt": 1792188000.0,
            },
            "needsYou": [
                {"kind": "suggestion", "id": "sug_1", "title": "Consider this option"}
            ],
            "handled": [],
            "upcoming": [],
            "impact": {
                "today": {
                    "answers": 0,
                    "actions": 0,
                    "tasksCompleted": 0,
                    "jobsCompleted": 0,
                    "costUsd": 0.0,
                },
                "week": {
                    "answers": 0,
                    "actions": 0,
                    "tasksCompleted": 0,
                    "jobsCompleted": 0,
                    "costUsd": 0.0,
                },
            },
            "counts": {"needsYou": 1, "handled": 0, "upcoming": 0},
        }
    ]
    assert run("inbox") == 0
    output = capsys.readouterr()
    assert "? Consider this option" in output.out


def test_inbox_time_on_another_day_shows_weekday():

    # Create a value with an upcoming item on a different day
    value = {
        "generatedAt": 1792240794.5,
        "day": {
            "date": "2026-10-17",
            "timeZone": "Asia/Jerusalem",
            "startsAt": 1792188000.0,
        },  # Saturday
        "needsYou": [],
        "handled": [],
        "upcoming": [
            {
                "kind": "job",
                "id": "job_1",
                "title": "Tuesday meeting",
                "at": 1792473600.0,
            }
        ],  # Tuesday
        "impact": {
            "today": {
                "answers": 0,
                "actions": 0,
                "tasksCompleted": 0,
                "jobsCompleted": 0,
                "costUsd": 0.0,
            },
            "week": {
                "answers": 0,
                "actions": 0,
                "tasksCompleted": 0,
                "jobsCompleted": 0,
                "costUsd": 0.0,
            },
        },
        "counts": {"needsYou": 0, "handled": 0, "upcoming": 1},
    }

    result = render(value)
    assert "Tue 08:20" in result


def test_inbox_pi_refusal_exits(invoke, capsys):
    run, _calls, _, state, _ = invoke
    body = b'{"detail": {"code": "forbidden", "message": "Owner access required."}}'
    state["responses"] = [
        HTTPError("http://private", 403, "Forbidden", {}, io.BytesIO(body))
    ]
    assert run("inbox") == 1
    assert (
        "Pi refused this (forbidden): Owner access required." in capsys.readouterr().err
    )


def test_a_plan_alert_shows_when_its_window_resets():
    zero = {
        "answers": 0,
        "actions": 0,
        "tasksCompleted": 0,
        "jobsCompleted": 0,
        "costUsd": 0.0,
    }
    value = {
        "generatedAt": 1792240794.5,
        "day": {
            "date": "2026-10-21",
            "timeZone": "Asia/Jerusalem",
            "startsAt": 1792188000.0,
        },
        "needsYou": [
            {
                "kind": "plan",
                "id": "plan_" + "a" * 32,
                "title": "ChatGPT weekly limit 84% used",
                "since": 1792240000.0,
                "usedPercent": 84,
                "resetsAt": "2026-10-23T09:00:00Z",
            }
        ],
        "handled": [
            {
                "kind": "plan-reset",
                "title": "Claude 5-hour limit reset",
                "at": 1792240500.0,
            }
        ],
        "upcoming": [],
        "impact": {"today": zero, "week": zero},
        "counts": {"needsYou": 1, "handled": 1, "upcoming": 0},
    }
    text = render(value)
    assert "- ChatGPT weekly limit 84% used, resets Fri 12:00" in text
    assert "✓ Claude 5-hour limit reset" in text
