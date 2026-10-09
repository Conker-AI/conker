"""Cancellation is scoped to exact worker-owned operations and releases real capacity."""

import os
import socket
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import workspace_providers
from chatgpt_provider import RESPONSES_URL, ChatGPTError, inference_events
from inference_requests import AdmissionError, RequestControl, Requests
from native_claude import Claude

IDENTITY = "inference-cancellation-test-001"
PAYLOAD = {
    "model": "test-model",
    "messages": [{"role": "user", "content": "hello"}],
    "timeout": 5,
}


def config(tmp_path):
    return {
        "native_providers": {
            "state": str(tmp_path),
            "codex": str(tmp_path / "absent"),
            "claude": str(tmp_path / "absent"),
            "control_key": "c" * 32,
            "inference_key": "i" * 32,
        }
    }


def test_duplicate_early_cancel_and_capacity_wait_for_actual_finalization():
    requests = Requests(capacity=1, maximum=4)
    key, control = requests.begin("chatgpt", IDENTITY)
    stopped = threading.Event()
    with control.register(stopped.set):
        assert requests.cancel("chatgpt", IDENTITY)["status"] == "cancel_requested"
        assert stopped.is_set()
        with pytest.raises(AdmissionError, match="busy"):
            requests.begin("chatgpt", "different-inference-002")
        with pytest.raises(AdmissionError, match="request_already_used"):
            requests.begin("chatgpt", IDENTITY)
    requests.finish(key, control)
    requests.finish(key, control)  # An extra cleanup cannot over-release the semaphore.
    assert requests.cancel("chatgpt", IDENTITY)["status"] == "finished"
    assert requests.cancel("claude", "cancel-before-start-001")["status"] == "not_found"
    with pytest.raises(AdmissionError, match="request_already_used"):
        requests.begin("claude", "cancel-before-start-001")
    key, control = requests.begin("chatgpt", "different-inference-002")
    requests.finish(key, control)


def test_cancel_tombstones_are_bounded_and_provider_scoped():
    requests = Requests(maximum=2)
    requests.cancel("claude", IDENTITY)
    key, control = requests.begin("chatgpt", IDENTITY)
    assert not control.canceled.is_set()
    with pytest.raises(AdmissionError, match="busy"):
        requests.cancel("claude", "different-inference-002")
    requests.finish(key, control)
    with pytest.raises(AdmissionError, match="invalid_request"):
        requests.cancel("claude", "123")


def test_worker_cancel_is_private_exact_and_releases_chatgpt_stream(
    tmp_path, monkeypatch
):
    started, aborted = threading.Event(), threading.Event()

    def blocked(_control, _value, *, cancellation):
        with cancellation.register(aborted.set):
            started.set()
            assert aborted.wait(3)
            cancellation.check()
            yield {"type": "text", "delta": "must not escape"}

    monkeypatch.setattr(workspace_providers, "inference_events", blocked)
    app = workspace_providers.create_app(config(tmp_path))
    headers = {"Authorization": "Bearer " + "i" * 32}
    body = {"request_id": IDENTITY}
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as pool:
        for wrong in (
            {},
            {"Authorization": "Bearer " + "c" * 32},
            {**headers, "Origin": "https://evil.test"},
        ):
            assert (
                client.post("/inference/cancel", headers=wrong, json=body).status_code
                == 401
            )
        assert (
            client.post(
                "/inference/cancel", headers=headers, json={**body, "pid": 1}
            ).status_code
            == 422
        )
        pending = pool.submit(
            client.post,
            "/inference/responses",
            headers=headers,
            json={**PAYLOAD, "request_id": IDENTITY},
        )
        assert started.wait(3)
        assert (
            client.post(
                "/inference/responses",
                headers=headers,
                json={**PAYLOAD, "request_id": IDENTITY},
            ).status_code
            == 409
        )
        wrong_provider = client.post(
            "/inference/claude/cancel", headers=headers, json=body
        )
        assert wrong_provider.json()["status"] == "not_found" and not aborted.is_set()
        canceled = client.post("/inference/cancel", headers=headers, json=body)
        assert canceled.json() == {"request_id": IDENTITY, "status": "cancel_requested"}
        response = pending.result(timeout=3)
        assert response.status_code == 200 and "must not escape" not in response.text
        assert "request_canceled" in response.text
        leases = [app.state.inference_requests.begin("chatgpt") for _ in range(3)]
        for key, control in leases:
            app.state.inference_requests.finish(key, control)


def test_cancel_before_worker_admission_prevents_provider_call(tmp_path, monkeypatch):
    monkeypatch.setattr(
        workspace_providers,
        "inference_events",
        lambda *_a, **_k: pytest.fail("canceled inference dispatched"),
    )
    headers = {"Authorization": "Bearer " + "i" * 32}
    with TestClient(workspace_providers.create_app(config(tmp_path))) as client:
        assert (
            client.post(
                "/inference/cancel", headers=headers, json={"request_id": IDENTITY}
            ).json()["status"]
            == "not_found"
        )
        assert (
            client.post(
                "/inference/responses",
                headers=headers,
                json={**PAYLOAD, "request_id": IDENTITY},
            ).status_code
            == 409
        )


def test_claude_worker_cancel_finalizes_before_reusing_capacity(tmp_path, monkeypatch):
    started, aborted = threading.Event(), threading.Event()

    def blocked(_self, _value, *, cancellation):
        with cancellation.register(aborted.set):
            started.set()
            assert aborted.wait(3)
            cancellation.check()

    monkeypatch.setattr(workspace_providers.Claude, "complete", blocked)
    app = workspace_providers.create_app(config(tmp_path))
    headers = {"Authorization": "Bearer " + "i" * 32}
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(
            client.post,
            "/inference/claude/responses",
            headers=headers,
            json={**PAYLOAD, "request_id": IDENTITY},
        )
        assert started.wait(3)
        response = client.post(
            "/inference/claude/cancel", headers=headers, json={"request_id": IDENTITY}
        )
        assert response.json()["status"] == "cancel_requested"
        assert pending.result(timeout=3).status_code == 503
        leases = [app.state.inference_requests.begin("claude") for _ in range(3)]
        for key, control in leases:
            app.state.inference_requests.finish(key, control)


def test_legacy_inference_payload_still_works_and_invalid_cancel_ids_are_rejected(
    tmp_path, monkeypatch
):
    def complete(_control, _value, *, cancellation):
        cancellation.check()
        yield {"type": "text", "delta": "hello"}
        yield {
            "type": "done",
            "model": "test-model",
            "inputTokens": 1,
            "outputTokens": 1,
            "cachedTokens": None,
        }

    monkeypatch.setattr(workspace_providers, "inference_events", complete)
    headers = {"Authorization": "Bearer " + "i" * 32}
    with TestClient(workspace_providers.create_app(config(tmp_path))) as client:
        assert (
            "hello"
            in client.post("/inference/responses", headers=headers, json=PAYLOAD).text
        )
        for identity in (None, "short", 123, "x" * 129):
            assert (
                client.post(
                    "/inference/responses",
                    headers=headers,
                    json={**PAYLOAD, "request_id": identity},
                ).status_code
                == 422
            )


def test_chatgpt_cancel_interrupts_a_real_blocked_socket_read():
    client_socket, server_socket = socket.socketpair()
    client_socket.settimeout(3)
    reader = client_socket.makefile("rb")
    entered = threading.Event()
    control = RequestControl()

    class Response:
        fp = SimpleNamespace(raw=SimpleNamespace(_sock=client_socket))
        headers = SimpleNamespace(get_content_type=lambda: "text/event-stream")

        def geturl(self):
            return RESPONSES_URL

        def readline(self, limit):
            entered.set()
            return reader.readline(limit)

        def close(self):
            reader.close()
            client_socket.close()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.close()

    def run():
        with pytest.raises(ChatGPTError):
            list(
                inference_events(
                    SimpleNamespace(
                        credentials=lambda: ("synthetic-token", "synthetic-account")
                    ),
                    PAYLOAD,
                    opener=SimpleNamespace(open=lambda *_a, **_k: Response()),
                    cancellation=control,
                )
            )

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(run)
            assert entered.wait(2)
            started = time.monotonic()
            control.cancel()
            pending.result(timeout=2)
            assert time.monotonic() - started < 2
        assert reader.closed and not control.cleanup_failed
    finally:
        server_socket.close()
        client_socket.close()


def test_claude_cancel_kills_owned_process_and_reaps_before_return(
    tmp_path, monkeypatch
):
    import native_claude

    control = RequestControl()
    started = threading.Event()
    original = subprocess.Popen
    owned = []
    child_pid_file = tmp_path / "child.pid"

    def spawn(_command, **kwargs):
        process = original(
            [
                sys.executable,
                "-c",
                (
                    "import subprocess,sys,time; "
                    "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)']); "
                    "open(sys.argv[1],'w').write(str(child.pid)); time.sleep(30)"
                ),
                str(child_pid_file),
            ],
            **kwargs,
        )
        owned.append(process)
        started.set()
        return process

    monkeypatch.setattr(native_claude.subprocess, "Popen", spawn)
    # Keep taskkill's own implementation from passing through the fixture Popen.
    original_stop = native_claude.stop_inference_process

    def stop(process):
        monkeypatch.setattr(native_claude.subprocess, "Popen", original)
        original_stop(process)

    monkeypatch.setattr(native_claude, "stop_inference_process", stop)
    native = Claude(tmp_path / "claude.exe", tmp_path / "auth")
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(native.complete, PAYLOAD, cancellation=control)
        assert started.wait(2)
        deadline = time.monotonic() + 2
        while not child_pid_file.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert child_pid_file.exists()
        child_pid = int(child_pid_file.read_text())
        control.cancel()
        with pytest.raises(ValueError, match="request_canceled"):
            pending.result(timeout=3)
    assert owned[0].poll() is not None
    assert owned[0].stdin.closed and owned[0].stdout.closed and owned[0].stderr.closed
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        kernel = ctypes.windll.kernel32
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(wintypes.DWORD),
        ]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, child_pid)
        if handle:
            try:
                code = wintypes.DWORD()
                assert kernel.GetExitCodeProcess(handle, ctypes.byref(code))
                assert code.value != 259  # STILL_ACTIVE
            finally:
                kernel.CloseHandle(handle)
