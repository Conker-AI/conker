"""Private loopback bridge: separate owner-auth and model-inference credentials."""

import hmac
import json
import queue
import threading
from contextlib import asynccontextmanager, closing
from pathlib import Path

from chatgpt_provider import (
    ChatGPTControl,
    ChatGPTError,
    inference_events,
    responses_payload,
)
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from inference_requests import AdmissionError, Requests
from native_claude import Claude
from native_claude_sessions import SessionError, Sessions, stop_payload
from native_codex_sessions import Sessions as CodexSessions
from native_codex_sessions import raw_list_query
from plan_limits import read_chatgpt, read_claude
from starlette.concurrency import run_in_threadpool


def create_app(config):
    settings = config["native_providers"]
    control_key, inference_key = settings["control_key"], settings["inference_key"]
    if min(len(control_key), len(inference_key)) < 32 or control_key == inference_key:
        raise ValueError(
            "Provision separate private credentials for provider control and inference."
        )
    chatgpt = ChatGPTControl(Path(settings["state"]), Path(settings["codex"]))
    claude = Claude(settings["claude"], Path(settings["state"]) / "claude-auth")
    native_sessions = Sessions(
        settings["claude"], Path(settings["state"]) / "claude-auth"
    )
    codex_sessions = CodexSessions(
        settings["codex"], Path(settings["state"]) / "chatgpt-auth"
    )
    requests = Requests()

    @asynccontextmanager
    async def lifespan(app):
        yield
        native_sessions.close()
        codex_sessions.close()
        requests.close()
        if chatgpt.rpc:
            chatgpt.rpc.close()
        claude.close()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.inference_requests = requests
    app.state.request_shutdown = None

    @app.exception_handler(SessionError)
    async def native_session_error(_request, exc):
        return JSONResponse({"error": str(exc)}, status_code=exc.status)

    def split_request(value):
        if not isinstance(value, dict):
            raise AdmissionError("invalid_request", 422)
        value = dict(value)
        identity = (
            Requests.identity(value.pop("request_id"))
            if "request_id" in value
            else None
        )
        return value, identity

    @app.middleware("http")
    async def authorize(request, call_next):
        if request.url.path == "/health" and request.method == "GET":
            return JSONResponse({"status": "ready"})
        key = (
            inference_key if request.url.path.startswith("/inference/") else control_key
        )
        if (
            request.headers.get("origin")
            or (
                request.url.query
                and not (
                    request.method == "GET" and request.url.path == "/codex/sessions"
                )
            )
            or not hmac.compare_digest(
                request.headers.get("authorization", ""), "Bearer " + key
            )
        ):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if request.method == "POST":
            size = request.headers.get("content-length", "")
            limit = (
                1024
                if request.url.path.startswith("/claude/sessions/")
                or request.url.path == "/lifecycle/stop"
                else 4_000_000
            )
            if (
                not size.isdigit()
                or not 0 < int(size) <= limit
                or request.headers.get("transfer-encoding")
            ):
                return JSONResponse({"error": "invalid_request"}, status_code=422)
        return await call_next(request)

    @app.get("/chatgpt")
    def chatgpt_status():
        return chatgpt.status()

    @app.post("/lifecycle/stop")
    async def lifecycle_stop(request: Request):
        # Host launcher only: no Gateway/browser route, no inference authority.
        try:
            raw = await request.body()
            if len(raw) > 1024 or json.loads(raw) != {}:
                raise ValueError()
        except (ValueError, TypeError, UnicodeError):
            return JSONResponse({"error": "invalid_request"}, status_code=422)
        callback = app.state.request_shutdown
        if callback is None:
            return JSONResponse({"error": "lifecycle_unavailable"}, status_code=503)
        callback()
        return {"status": "stopping"}

    @app.post("/chatgpt")
    async def chatgpt_operation(request: Request):
        try:
            return await run_in_threadpool(chatgpt.apply, await request.json())
        except (ValueError, OSError):
            return JSONResponse({"error": "provider_operation_failed"}, status_code=503)

    @app.get("/chatgpt/limits")
    def chatgpt_limits():
        return read_chatgpt(chatgpt)

    @app.get("/claude")
    def claude_status():
        return claude.status()

    @app.get("/claude/limits")
    def claude_limits():
        return read_claude(claude)

    @app.post("/claude")
    async def claude_operation(request: Request):
        try:
            return await run_in_threadpool(claude.apply, await request.json())
        except Exception:  # noqa: BLE001 - Native errors may contain credentials; publish only a fixed code.
            return JSONResponse({"error": "provider_operation_failed"}, status_code=503)

    @app.get("/claude/sessions")
    def claude_sessions():
        return native_sessions.list()

    @app.get("/codex/sessions")
    def codex_saved_sessions(request: Request):
        return codex_sessions.list(raw_list_query(request.scope["query_string"]))

    @app.get("/codex/sessions/{identity}")
    def codex_saved_session(identity: str):
        return codex_sessions.status(identity)

    @app.get("/claude/sessions/{identity}")
    def claude_session(identity: str):
        return native_sessions.status(identity)

    @app.get("/claude/sessions/{identity}/output")
    def claude_session_output(identity: str):
        return native_sessions.output(identity)

    @app.post("/claude/sessions/{identity}/stop")
    async def claude_session_stop(identity: str, request: Request):
        value = stop_payload(await request.body())
        return await run_in_threadpool(native_sessions.stop, identity, value)

    @app.get("/inference/status")
    def inference_status():
        status = chatgpt.status()
        return {key: status[key] for key in ("available", "connected")}

    @app.get("/inference/claude/status")
    def claude_inference_status():
        status = claude.status()
        return {key: status[key] for key in ("available", "connected")}

    @app.post("/inference/responses")
    async def responses(request: Request):
        try:
            value, identity = split_request(await request.json())
            responses_payload(value)
        except (ValueError, TypeError):
            return JSONResponse({"error": "invalid_request"}, status_code=422)
        try:
            key, control = requests.begin("chatgpt", identity)
        except AdmissionError as exc:
            return JSONResponse({"error": str(exc)}, status_code=exc.status)
        output = queue.Queue(maxsize=8)

        def put(item):
            while True:
                control.check()
                try:
                    output.put(item, timeout=0.1)
                    return
                except queue.Full:
                    pass

        def work():
            try:
                with closing(
                    inference_events(chatgpt, value, cancellation=control)
                ) as events:
                    for item in events:
                        put(item)
            except ChatGPTError as error:
                if not control.canceled.is_set():
                    try:
                        put({"type": "error", "code": str(error)})
                    except ValueError:
                        pass
            except Exception:  # noqa: BLE001 - Provider errors may contain private data.
                if not control.canceled.is_set():
                    try:
                        put({"type": "error", "code": "provider_unavailable"})
                    except ValueError:
                        pass
            finally:
                requests.finish(key, control)

        async def events():
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        item = await run_in_threadpool(output.get, True, 0.1)
                    except queue.Empty:
                        if control.finished.is_set():
                            if control.canceled.is_set():
                                yield (
                                    json.dumps(
                                        {"type": "error", "code": "request_canceled"}
                                    )
                                    + "\n"
                                )
                            break
                        continue
                    if control.canceled.is_set():
                        yield (
                            json.dumps({"type": "error", "code": "request_canceled"})
                            + "\n"
                        )
                        break
                    yield json.dumps(item) + "\n"
            finally:
                # A disconnected subscriber cannot strand a stream/slot.
                control.cancel()

        worker = threading.Thread(target=work, daemon=True)
        try:
            worker.start()
        except Exception:
            requests.finish(key, control)
            raise

        return StreamingResponse(events(), media_type="application/x-ndjson")

    @app.post("/inference/claude/responses")
    async def claude_responses(request: Request):
        try:
            value, identity = split_request(await request.json())
            key, control = requests.begin("claude", identity)
        except (ValueError, TypeError) as exc:
            return JSONResponse(
                {
                    "error": str(exc)
                    if isinstance(exc, AdmissionError)
                    else "invalid_request"
                },
                status_code=exc.status if isinstance(exc, AdmissionError) else 422,
            )
        try:
            return await run_in_threadpool(claude.complete, value, cancellation=control)
        except Exception:  # noqa: BLE001 - Native errors may contain prompts or credentials.
            return JSONResponse({"error": "native_inference_failed"}, status_code=503)
        finally:
            requests.finish(key, control)

    async def cancel(request, provider):
        try:
            value = await request.json()
            if not isinstance(value, dict) or set(value) != {"request_id"}:
                raise AdmissionError("invalid_request", 422)
            return await run_in_threadpool(
                requests.cancel, provider, value["request_id"]
            )
        except (ValueError, TypeError) as exc:
            return JSONResponse(
                {
                    "error": str(exc)
                    if isinstance(exc, AdmissionError)
                    else "invalid_request"
                },
                status_code=exc.status if isinstance(exc, AdmissionError) else 422,
            )

    @app.post("/inference/cancel")
    async def cancel_chatgpt(request: Request):
        return await cancel(request, "chatgpt")

    @app.post("/inference/claude/cancel")
    async def cancel_claude(request: Request):
        return await cancel(request, "claude")

    return app
