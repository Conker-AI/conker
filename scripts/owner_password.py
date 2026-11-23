"""The owner's password typed at the server's shell, for the settings Settings asks it for.

Pi decides what needs it (ADR-0010): a preferences save on the recovery key that would change the
sign-out time, a new chat's access or the daily budgets is refused, 403 `password_required`, and
nothing is saved (`conker_config.PasswordRequired`). Only then is the password asked, here, with
echo off, once, and the same save goes once more to the gateway's `owner-preferences` host command,
with the password, on stdin: never in argv, the environment, a log or an error. The gateway checks
it (five wrong ones in five minutes and it waits) and saves with the owner credential.
"""

from __future__ import annotations

import getpass
import json
import os
import subprocess
import sys
from urllib.error import HTTPError

from conker_config import PasswordRequired, password_required

COMMAND = ("-m", "gateway", "owner-preferences")
PROMPT = "Your Conker password (this setting asks for it, as Settings does): "
MAYBE = " It may already be saved; check it with conker config get before trying again."


class NotSaved(OSError):
    """The gateway refused the save or did not answer: the owner reads why."""


def ask(
    prompt: str = PROMPT, refusal: str = "This setting needs your password. Nothing was changed."
) -> str:
    try:
        password = getpass.getpass(prompt)
    except EOFError:  # no terminal and nothing on stdin: nobody to ask
        password = ""
    if not password:
        raise ValueError(refusal)
    return password


def gateway(argv: list[str], document: dict, **options) -> dict:
    """Run a gateway host command with `document` (it holds the password) on stdin; its answer."""
    try:
        result = subprocess.run(
            argv,
            input=json.dumps(document).encode(),
            capture_output=True,
            timeout=150,
            check=False,
            **options,
        )
    except OSError:
        # docker, or Python in development, is missing: the command never started.
        raise NotSaved(
            "Could not start the gateway command. Nothing was changed. Check it with: conker status"
        ) from None
    except subprocess.TimeoutExpired:
        raise NotSaved("The gateway did not answer." + MAYBE) from None
    if result.returncode:
        # The gateway's own words (it never repeats the password or the request), one line.
        said = result.stderr.decode("utf-8", "replace").strip().splitlines()
        line = "".join(c for c in (said[-1] if said else "") if c.isprintable())[:300]
        raise NotSaved(line or "The gateway refused the change. Nothing was saved.")
    try:
        value = json.loads(result.stdout)
    except ValueError:
        value = None
    if not isinstance(value, dict):
        raise NotSaved("The gateway answered with something unreadable." + MAYBE)
    return value


def saver(argv: list[str], **options):
    """`conker_config`'s save once Pi asked for the password: the same save, sent with it."""

    def save(body: dict) -> dict:
        return gateway(argv, {"password": ask(), **body}, **options)

    return save


def installed(command: list[str]):
    """On an installed stack: the command runs in the gateway container."""
    return saver([*command, "exec", "-T", "gateway", "python", *COMMAND])


def development(config: dict):
    """On the development stack: the same command from Pi's checkout, with the gateway's settings
    and none of this shell's service settings (read only when a save needs it)."""

    def save(body: dict) -> dict:
        from scripts.cli.conker_spending import SERVICE_PREFIXES

        environment = {
            key: value for key, value in os.environ.items() if not key.startswith(SERVICE_PREFIXES)
        }
        environment.update(config["environments"]["gateway"])
        environment["PYTHONPATH"] = config["repositories"]["pi"]
        argv = [config.get("python", sys.executable), *COMMAND]
        return saver(argv, env=environment)(body)

    return save


def asking(request):
    """The development CLI's `request`, with Pi's 403 `password_required` as PasswordRequired."""

    def call(*args, **options):
        try:
            return request(*args, **options)
        except HTTPError as error:
            if error.code == 403 and password_required(error.read()):
                raise PasswordRequired("Pi asks for your password for this setting.") from None
            raise

    return call
