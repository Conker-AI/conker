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
    requests = Requests()

    @asynccontextmanager
    async def lifespan(app):
        yield
        requests.close()
        if chatgpt.rpc:
            chatgpt.rpc.close()
        claude.close()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.inference_requests = requests

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
            or request.url.query
            or not hmac.compare_digest(
                request.headers.get("authorization", ""), "Bearer " + key
            )
        ):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if request.method == "POST":
            size = request.headers.get("content-length", "")
            if (
                not size.isdigit()
                or not 0 < int(size) <= 4_000_000
                or request.headers.get("transfer-encoding")
            ):
                return JSONResponse({"error": "invalid_request"}, status_code=422)
        return await call_next(request)

    @app.get("/chatgpt")
    def chatgpt_status():
        return chatgpt.status()

    @app.post("/chatgpt")
    async def chatgpt_operation(request: Request):
        try:
            return await run_in_threadpool(chatgpt.apply, await request.json())
        except (ValueError, OSError):
            return JSONResponse({"error": "provider_operation_failed"}, status_code=503)

    @app.get("/claude")
    def claude_status():
        return claude.status()

    @app.post("/claude")
    async def claude_operation(request: Request):
        try:
            return await run_in_threadpool(claude.apply, await request.json())
        except Exception:  # noqa: BLE001 - Native errors may contain credentials; publish only a fixed code.
            return JSONResponse({"error": "provider_operation_failed"}, status_code=503)

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
