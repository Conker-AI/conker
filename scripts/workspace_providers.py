"""Private loopback bridge: separate owner-auth and model-inference credentials."""

import hmac
import json
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from chatgpt_provider import (
    ChatGPTControl,
    ChatGPTError,
    inference_events,
    responses_payload,
)
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
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
    slots = threading.BoundedSemaphore(3)

    @asynccontextmanager
    async def lifespan(app):
        yield
        if chatgpt.rpc:
            chatgpt.rpc.close()
        claude.close()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

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
            value = await request.json()
            responses_payload(value)
        except (ValueError, TypeError):
            return JSONResponse({"error": "invalid_request"}, status_code=422)
        if not slots.acquire(blocking=False):
            return JSONResponse({"error": "busy"}, status_code=503)

        def events():
            try:
                yield from (
                    json.dumps(item) + "\n" for item in inference_events(chatgpt, value)
                )
            except ChatGPTError as error:
                yield json.dumps({"type": "error", "code": str(error)}) + "\n"
            finally:
                slots.release()

        return StreamingResponse(events(), media_type="application/x-ndjson")

    @app.post("/inference/claude/responses")
    async def claude_responses(request: Request):
        if not slots.acquire(blocking=False):
            return JSONResponse({"error": "busy"}, status_code=503)
        try:
            return await run_in_threadpool(claude.complete, await request.json())
        except Exception:  # noqa: BLE001 - Native errors may contain prompts or credentials.
            return JSONResponse({"error": "native_inference_failed"}, status_code=503)
        finally:
            slots.release()

    return app
