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
model is busy. Pi can interrupt its connected request on Stop, even before response
headers arrive. A disconnect or client timeout does not cancel a forward pass
already running; the service may remain busy until that pass finishes. Connection
setup before Pi receives a socket handle remains bounded by the phase timeout.

## Measurements on the owner's laptop

Initial SDK benchmark: Intel i7-1355U, 16 GB RAM, CPU inference with four threads:

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

A later check on 10 October used three consecutive synthetic requests against the
running local service with the configured model descriptions. HTTP wall times were
6,480, 1,323 and 1,286 ms. Resident memory rose from about 42 MB to 1.4 GB during the
first call. This is consistent with paging contributing to a cold request, but
does not isolate the cause or establish a performance improvement. These inputs
and operating conditions differ from the initial benchmark. No configuration
changed, and these three classifications are not an accuracy evaluation.

## Pi integration

Set `PI_DECISION_URL` and `PI_DECISION_KEY` on the server. Register an enabled
catalogue model with provider `decisions` and route `model-routing`, then assign
it to the routing role. Other catalogue models can carry `routingDescription`
to describe suitable work. Manual answer selection and no-harness rules take
precedence. The routing role may first try its own explicitly configured helper
fallback. If routing still fails or returns an ineligible choice, the answer
role's failure policy determines whether to stop or use its configured answer
fallback. This includes unavailable, oversize, busy and low-confidence requests.
`PI_DECISION_MIN_CONFIDENCE` defaults to 0.2; passing it does not prove a
classification is right. Stop is cancellation, so it never triggers a fallback.

The Laya adapter excludes system prompts and recalled memory from its routing
projection. It sends the latest user request up to 800 characters. A short
follow-up (under 400 characters) also includes up to two earlier conversation
turns, each excerpted to at most 200 characters. Longer requests use a marked
head/tail excerpt and length evidence. The receipt names the input scope. This
bounded projection does not provide full conversation or tool-result reasoning.

Within one uninterrupted foreground attempt, Pi can reuse a successful primary
Laya choice when the exact typed request, frozen configuration and adapter match.
This avoids repeated identical classifier calls after tool results that do not
change the routing projection. Reuse still checks cancellation and eligibility;
it is identified explicitly and adds no provider-call or elapsed-time record.
Steering, approval/reply recovery, later turns and background thinking get separate
scopes. Failures and helper fallbacks are never reused. Long-request conversation
metrics can change after tools, requiring another classification.

Memory reranking is separately opt-in through the `memory-ranking` model role.
It runs after scoped retrieval, preserves every original record and its evidence,
and only changes ordering. Its inputs are marked 160-character previews.
No-harness skips it. Failure retains baseline order and a visible receipt.
Fresh stack initialization defaults it off; it is also off in the current local
setup. `check_memory_pipeline.py` exercises the real decision service
and durable Pi context storage with synthetic retrieval records; run with Pi on
PYTHONPATH and PI_DECISION_URL/PI_DECISION_KEY in the process environment.
`memory-pipeline-local.json` records the warm result. This does not establish
broad relevance accuracy or test real MemoryGate retrieval ranking.

## Running the local workspace

Use `scripts/workspace.py` and the [connected workspace guide](../../docs/reference/connected-workspace.md)
for installation, service ownership, status and recovery. Ignored `.local-run`
configuration owns the selected ports and distinct credentials. Do not copy a
historical benchmark's ports or keys into an existing workspace. The current
[source status](../../docs/status.md) distinguishes tested changes from local
acceptance and remaining limitations.

## Catalogue-selected memory ranking

Settings → Models / Providers → Model roles → Memory ranking replaces PI_MEMORY_RERANK_ENABLED. Existing configurations migrate with ranking disabled. Explicitly select and enable a model.

For the configured `decisions` provider, register a catalogue entry with route `memory-ranking`; use a separate `model-routing` entry for routing. Each role has an independent primary, timeout and optional fallback. Other configured completion providers can rank using the JSON contract. Invalid results keep retrieval order and every original record. No-memory and no-harness still prevent relevant helper calls.

Laya remains an optional decision-service implementation, not a MemoryGate dependency. A replacement behind PI_DECISION_URL must implement /v1/choose; a different protocol needs a Pi adapter. Adding a catalogue entry does not install models or grant credentials.
