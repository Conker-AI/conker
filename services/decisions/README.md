# Local typed decisions

This service evaluates bounded choices using Laya on CPU. It is separate from
Pi, MemoryGate and ToolGate. It generates neither answers nor permissions.
Pi's `decisions` adapter uses a configurable URL/key, so a different implementation
of the same API can replace it without changing the conversation loop.

## Reproducibility

- SDK source: `NandhaKishorM/laya` at `573e5b62696ba441230cd6be71d593331b5d23af`.
- English checkpoint: `convaiinnovations/laya` at `1c5edc17a7acd8701df6fc341c0d179f1c62c982`.
- Python 3.12, CPU PyTorch 2.8.0, Transformers 4.57.6; Windows dependency snapshot
  in `requirements-windows.lock`. Install CPU PyTorch using its CPU wheel index,
  then install `requirements.txt` in a dedicated virtual environment.
- Run `prepare_model.py` explicitly to download that checkpoint. Serving loads
  only `DECISION_MODEL_PATH`; it does not accept model URLs from requests.

Start with `uvicorn server:create_app --factory --host 127.0.0.1 --port 8060`
from this directory after setting `DECISION_API_KEY` (32+ characters),
`DECISION_MODEL_PATH` and `DECISION_MODEL_ID` in the server environment.
`DECISION_CPU_THREADS` defaults to four. Keep one server worker to avoid duplicate
weights. Both `/health` and `/v1/choose` require `X-Decision-Key`. No browser CORS
or direct client access is configured.

`POST /v1/choose` accepts `state`, `instructions` and a dictionary of two to eight
`choices`. It returns the chosen ID, relative probabilities, SDK confidence, model
identity and elapsed inference time. Confidence is not a correctness guarantee.
Requests exceeding the actual tokenizer budgets are rejected before inference;
the SDK's silent truncation is not used. Concurrent requests fail fast while the
model is busy. A client timeout does not cancel a forward pass already running.

## First measurements on the owner's laptop

Intel i7-1355U, 16 GB RAM, CPU inference with four threads:

- Load: 10.5 seconds; resident process memory about 2 GB.
- Eight synthetic simple/complex routing cases: 6/8 correct.
- Warm inference median: 315 ms. These are SDK measurements, not browser latency.
- Three memory relevance smoke cases over synthetic records: two ranked correctly;
  one used the original retrieval order because confidence was below 0.2.
- HTTP plus ranking took about 675–716 ms in that small run.

Reports: `benchmark-local.json`, `benchmark-memory-local.json`. These tiny cases
do not establish broad accuracy or an optimal configuration. The SDK warns about
temperature calibration for 11+ choices; this service allows at most eight.
This checkpoint is English-only; multilingual support needs separate evaluation.

## Pi integration

Set `PI_DECISION_URL` and `PI_DECISION_KEY` on the server. Register an enabled
catalogue model with provider `decisions` and route `model-routing`, then assign
it to the routing role. Other catalogue models can carry `routingDescription`
to describe suitable work. Manual answer selection and no-harness rules take
precedence. The routing role's explicit fallback is used for unavailable,
oversize, busy or low-confidence requests. `PI_DECISION_MIN_CONFIDENCE` defaults
to 0.2; passing it does not prove a classification is right.

Memory reranking is separately opt-in with `PI_MEMORY_RERANK_ENABLED=true`.
It runs after scoped retrieval, preserves every original record and its evidence,
and only changes ordering. Its inputs are marked 160-character previews.
No-harness skips it. Failure retains baseline order and a visible receipt.
It is off in the initial local stack until broader evaluation is accepted.

## Local stack progress

`scripts/local_stack.py init` creates ignored `.local-run` state and distinct
service credentials. `start SERVICE`, `stop SERVICE`, and `status` manage only
that local setup. PostgreSQL uses a dedicated Docker container/volume on loopback
port 55432. The source APIs bind to loopback: ToolGate 8010, MemoryGate 8020,
Pi 8051, decisions 8060, gateway HTTPS 8050. No existing deployment state is used.

The full dashboard is still awaiting transport integration. Vector embeddings,
browser acceptance and final system-wide verification remain pending. Do not
mistake listening ports or the fixture dashboard for completed acceptance.
