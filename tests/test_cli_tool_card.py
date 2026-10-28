"""`conker tool-card`: show or pick the buttons the Inbox shows when one tool asks the owner."""

import sys
from argparse import Namespace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import conker_parser
import conker_toolgate


def run(template=None, cards=None):
    calls = []

    def request(config, service, path, body):
        calls.append((service, path, body))
        return (
            {"cards": cards or {}}
            if path == "/v2/owner/access"
            else {"id": "mail.send", **body}
        )

    args = Namespace(command="tool-card", id="mail.send", template=template)
    conker_toolgate.check(args)
    return conker_toolgate.operation(args, {}, request), calls


def test_picking_buttons_posts_exactly_the_template():
    result, calls = run("send")
    assert result == {"id": "mail.send", "template": "send"}
    assert calls == [
        ("toolgate-owner", "/v2/owner/tools/mail.send/card", {"template": "send"})
    ]


def test_showing_buttons_reads_the_owner_access_view():
    assert run(cards={"mail.send": "send"})[0] == {
        "id": "mail.send",
        "template": "send",
    }
    assert run()[0] == {"id": "mail.send", "template": "do"}


def test_only_the_fixed_templates_and_valid_ids_are_accepted():
    parser = conker_parser.build_parser("conker")
    assert (
        parser.parse_args(["tool-card", "mail.send", "--template", "pay"]).template
        == "pay"
    )
    with pytest.raises(SystemExit):
        parser.parse_args(["tool-card", "mail.send", "--template", "Cancel"])
    assert set(conker_toolgate.CARD_TEMPLATES) == {
        "do",
        "send",
        "publish",
        "ship",
        "run",
        "delete",
        "pay",
        "save",
    }
    with pytest.raises(ValueError):
        conker_toolgate.check(
            Namespace(command="tool-card", id="../mail", template="send")
        )
