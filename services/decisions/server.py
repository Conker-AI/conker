"""Private typed decision service. No tools, credentials vault or generated prose."""
from __future__ import annotations

import hmac
import math
import os
import threading
import time
from contextlib import asynccontextmanager
from typing import Annotated, Protocol

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ShortText = Annotated[str, StringConstraints(min_length=1, max_length=240)]
OptionId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_.:/-]{1,100}$")]


class ChoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    state: str = Field(min_length=1, max_length=12000)
    instructions: ShortText
    choices: dict[OptionId, ShortText] = Field(min_length=2, max_length=8)


class DecisionUnavailable(Exception):
    pass


class ContextTooLarge(Exception):
    pass


class Backend(Protocol):
    name: str
    model: str

    def choose(self, request: ChoiceRequest) -> dict: ...


class LayaBackend:
    name = "laya"

    def __init__(self, path: str, model: str, threads: int = 4):
        # Imports/weights stay out of clients and test processes. A local pinned
        # checkpoint is mandatory; serving never downloads arbitrary model IDs.
        if not os.path.isdir(path):
            raise RuntimeError("Configure DECISION_MODEL_PATH with a local checkpoint.")
        import torch
        import laya
        torch.set_num_threads(threads)
        self.agent = laya.load(path, device="cpu")
        self.agent.model.eval()
        self.model = model

    def choose(self, request: ChoiceRequest) -> dict:
        from laya.common import render_options
        agent = self.agent
        q = {"type": "choice", "instructions": request.instructions,
             "criteria": request.choices}
        internal = agent._to_internal(q)
        tok = agent.tok
        encode = lambda text: tok(text.replace(tok.mask_token, " "),
                                  add_special_tokens=False)["input_ids"]
        options = [encode(" " + option) for option in render_options(internal)]
        head = encode("choice question: " + request.instructions)
        option_size = sum(len(item) + 1 for item in options)
        # The upstream formatter truncates both descriptions and state. Reject
        # before inference so missing evidence cannot masquerade as a decision.
        if (any(len(item) > 48 for item in options)
                or option_size + max(16, len(head)) > agent.cfg.get("head_max_len", 192)
                or len(head) + option_size + len(encode(request.state)) + 4
                > agent.cfg.get("max_len", 512)):
            raise ContextTooLarge()
        result = agent.predict(request.state, {"decision": q})
        return result["answers"]["decision"]


def create_app(backend: Backend | None = None, *, key: str | None = None):
    token = key if key is not None else os.environ.get("DECISION_API_KEY", "")
    if len(token) < 32:
        raise RuntimeError("DECISION_API_KEY requires at least 32 characters.")
    lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(app):
        if backend is None:
            app.state.backend = LayaBackend(
                os.environ.get("DECISION_MODEL_PATH", ""),
                os.environ.get("DECISION_MODEL_ID", "laya-english"),
                max(1, min(8, int(os.environ.get("DECISION_CPU_THREADS", "4")))),
            )
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.backend = backend

    @app.middleware("http")
    async def bounded_body(request, call_next):
        size, chunks = 0, []
        async for chunk in request.stream():
            size += len(chunk)
            if size > 32768:
                return JSONResponse({"detail": "request_too_large"}, status_code=413)
            chunks.append(chunk)
        request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # FastAPI's default includes submitted values in validation errors.
        return JSONResponse({"detail": "invalid_decision_request"}, status_code=422)

    def authorize(x_decision_key: str = Header(default="")):
        if not hmac.compare_digest(token.encode(), x_decision_key.encode()):
            raise HTTPException(401, "unauthorized")

    @app.get("/health", dependencies=[Depends(authorize)])
    def health():
        value = app.state.backend
        return {"status": "ready" if value else "loading",
                "provider": value.name if value else None,
                "model": value.model if value else None, "busy": lock.locked()}

    @app.post("/v1/choose", dependencies=[Depends(authorize)])
    def choose(request: ChoiceRequest):
        # No unbounded GPU/CPU queue when several agents ask at once. A caller
        # timeout doesn't kill inference; until it finishes other requests fail
        # fast and can take their configured fallback.
        if not lock.acquire(blocking=False):
            raise HTTPException(503, "decision_busy")
        started = time.perf_counter()
        try:
            value = app.state.backend
            if value is None:
                raise DecisionUnavailable()
            result = value.choose(request)
            choice, confidence = result["choice"], result["confidence"]
            probabilities = result["probabilities"]
            if (choice not in request.choices or isinstance(confidence, bool)
                    or not isinstance(confidence, (int, float)) or not math.isfinite(confidence)
                    or not 0 <= confidence <= 1 or set(probabilities) != set(request.choices)
                    or any(isinstance(p, bool) or not isinstance(p, (int, float))
                           or not math.isfinite(p) or not 0 <= p <= 1
                           for p in probabilities.values())
                    or abs(sum(probabilities.values()) - 1) > 0.01):
                raise DecisionUnavailable()
            return {"choice": choice, "confidence": confidence,
                    "probabilities": probabilities, "provider": value.name,
                    "model": value.model,
                    "elapsed_ms": round((time.perf_counter() - started) * 1000, 2)}
        except ContextTooLarge:
            raise HTTPException(422, "decision_context_too_large") from None
        except Exception:
            raise HTTPException(503, "decision_unavailable") from None
        finally:
            lock.release()

    return app
