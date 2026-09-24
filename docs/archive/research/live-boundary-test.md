# Live container-boundary test

**Run 2026-09-12** against the real stack on this machine, from inside the running `conker-pi`
container. Answers one question directly: *when the AI runtime is compromised, can it reach past its
boundary to the other services?*

## Method

Brought the full stack up with `docker compose up -d`, then executed probes **from inside
`conker-pi`** with `docker exec` — the exact position a compromised Pi process occupies.

## Results

**Network reachability (flat bridge `conker_net`):**

| From Pi, socket to | Result |
|---|---|
| `toolgate-api:8010` | reachable |
| `memorygate-api:8020` | reachable |
| `systemgate-api:8040` | reachable |
| `embeddings-api:8030` | reachable |
| `conker-gateway:8060` | **not reachable** — the gateway is on the `owner_control` network, isolated from Pi |

Reachability is expected and is **not** the boundary. The boundary is authentication.

**What Pi's process actually holds:** `PI_ADMIN_KEY` (its own API), `PI_TOOLGATE_KEY` (a *scoped*
execution key), `PI_GATEWAY_KEY_SHA256` (a **hash**, verify-only, cannot impersonate the gateway),
and an empty `PI_OPENROUTER_KEY`. No MemoryGate key. No SystemGate key. No vault access.

**What Pi can actually do with them:**

| Attempt from inside Pi | Result |
|---|---|
| Read MemoryGate directly, no auth | **401** |
| Read MemoryGate directly with Pi's own admin key | **401** — Pi holds no key MemoryGate accepts |
| Read SystemGate directly | **401** — Pi holds no SystemGate key |
| Read ToolGate's vault with the execution key | **401** — the execution key cannot reach the vault |

## Conclusion

**The separation is by credential, and it holds.** A compromised Pi can open a socket to every
service, and can *use* none of them beyond its own scoped ToolGate path. Reaching the port buys
nothing without a key the service accepts, and Pi holds only the keys its job requires.

The gateway — which holds the owner-approval credential — is additionally isolated at the **network**
layer, unreachable from Pi at all.

## The one architectural note this surfaced

`PI_OPENROUTER_KEY` lives in Pi's own environment, because Pi calls OpenRouter directly for model
inference. It is empty on this install (no paid key set). But when the owner sets one, a compromised
Pi could spend it **directly**, outside ToolGate's spend accounting — inference is not a
ToolGate-mediated action. That is not a boundary breach; it is the one credential the boundary
architecture cannot cover, because the runtime must hold it to function. Bounding it needs a limit
at the point Pi calls the provider, not at ToolGate. Tracked in open-issues.
