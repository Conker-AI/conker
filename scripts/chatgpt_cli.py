"""CLI access to exactly the same subscription operations as Settings."""

import argparse
import http.client
import json
import socket
from pathlib import Path


class Connection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("conker-host", timeout=70)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(str(self.path))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--layout", choices=("ubuntu", "repository"), required=True)
    parser.add_argument(
        "operation", choices=("status", "login", "models", "cancel", "logout")
    )
    parser.add_argument("identity", nargs="?")
    args = parser.parse_args()
    value = {"operation": args.operation}
    if args.operation in {"cancel", "logout"}:
        if not args.identity:
            parser.error("Supply the exact loginId or connectionId from status.")
        value["loginId" if args.operation == "cancel" else "connectionId"] = (
            args.identity
        )
    elif args.identity:
        parser.error("This operation does not accept an identity.")
    path = (
        args.root
        / ("state" if args.layout == "ubuntu" else ".conker")
        / "provider-control/control.sock"
    )
    connection = Connection(path)
    try:
        connection.request(
            "GET" if args.operation == "status" else "POST",
            "/chatgpt",
            body=None if args.operation == "status" else json.dumps(value),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        content = response.read(65537)
        if response.status != 200 or len(content) > 65536:
            parser.exit(
                1,
                "Subscription operation was not confirmed. Refresh status before retrying.\n",
            )
        print(json.dumps(json.loads(content), indent=2))
    except (OSError, ValueError, http.client.HTTPException):
        parser.exit(1, "Private provider service is unavailable.\n")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
