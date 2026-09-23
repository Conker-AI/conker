"""Run from a trusted client with httpx; never prints passwords or session tokens."""
import argparse
import json
from pathlib import Path
import sys
import uuid

import httpx

parser = argparse.ArgumentParser()
parser.add_argument("--origin", required=True)
parser.add_argument("--password-file", type=Path, required=True)
parser.add_argument("--workflows", action="store_true")
args = parser.parse_args()
origin = args.origin
if not origin.startswith("https://"):
    raise SystemExit("A verified HTTPS origin is required")
password = args.password_file.read_text().strip()
client = httpx.Client(base_url=origin, trust_env=False, timeout=240)
start = client.get("/auth/session"); start.raise_for_status()
headers = {"Origin": origin, "X-CSRF-Token": start.json()["csrf_token"]}
login = client.post("/auth/login", headers=headers, json={"password": password})
login.raise_for_status()
headers["X-CSRF-Token"] = login.json()["csrf_token"]


def request(path, body=None):
    if body is None:
        response = client.get(path)
    else:
        verification = client.post("/auth/verify", headers=headers, json={"password": password,
            "operation": {"method": "POST", "path": path, "body": body}})
        verification.raise_for_status()
        response = client.post(path, json=body, headers={**headers,
            "X-Conker-Verification": verification.json()["verification_token"]})
    response.raise_for_status()
    return response.json()


if args.workflows:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    from check_local_workflow import run
    run(lambda path, body=None: request("/api/owner/editor-drafts/" + path, body))
else:
    session = request("/api/pi/sessions", {"title": "Ubuntu memory acceptance"})["session_id"]
    # Synthetic preference is explicitly attributed to a test character, not the owner.
    prompts = [
        "For this fictional deployment test, remember that the character Test Finch prefers jasmine tea every morning. Acknowledge briefly.",
        "For the fictional deployment test, remember that Test Finch prefers evening walks in the park. Acknowledge briefly.",
        "What tea does Test Finch prefer? Answer briefly using memory if available.",
    ]
    for text in prompts:
        response = request(f"/api/pi/sessions/{session}/turns", {"text": text, "request_id": "ubuntu_" + uuid.uuid4().hex})
        retrieval = response.get("memory", {}).get("retrieval") or {}
        package = retrieval.get("package") or {}
        print(json.dumps({"session": session, "turn": response.get("turn_id"),
            "reply": response.get("message", {}).get("content"), "memory_status": retrieval.get("status"),
            "memory_count": len(package.get("memories", [])),
            "ranking": package.get("retrieval", {}).get("reranking")}, ensure_ascii=True))
client.close()
