**ToolGate’s direct approval checks held in the isolated tests. The whole-system boundary does not yet hold.** I changed nothing. This review covers the checkout and Compose configuration, not verification of the running image contents. I distinguish malicious model output from compromise of Pi’s process; the former does not automatically provide arbitrary socket or environment access.

New findings, ranked by potential owner impact:

1. **An approved automation can execute a changed child tool without fresh approval. — Demonstrated**

   Sequence: owner approves automation v1 → a referenced tool changes from v1 to v2 → the agent submits the still-valid automation approval → ToolGate executes child v2.

   Approval binds only the automation’s identifier, version and input arguments at [server.py:1661](/C:/Users/The1a/dev/gates/toolgate/toolgate/api/server.py:1661). Execution retrieves each child’s current definition at [server.py:1206](/C:/Users/The1a/dev/gates/toolgate/toolgate/api/server.py:1206), then passes `approval_granted=True`, bypassing its separate confirmation.

   I reproduced this with the real approval, workflow, invocation and journal functions against in-memory SQLite; external execution was replaced with a recorder. No-cost fixture checks were stubbed.

   **Reach:** requires an existing scoped automation and a legitimate child-tool edit during the approval window. The agent cannot create or edit that tool itself. The owner can nevertheless authorize one implementation and receive another—potentially changing an action’s destination or effect. Explicitly blocked tools remain blocked.

2. **Pi’s network access grants unauthenticated control of Ollama and Qdrant. — Inferred from configuration and upstream contracts**

   Both inherit `conker_net`. [Compose’s Qdrant service](/C:/Users/The1a/dev/companion/docker-compose.yml:165) configures no authentication; [Ollama](/C:/Users/The1a/dev/companion/docker-compose.yml:195) exposes its ordinary management API and retains its model volume.

   A process able to send requests from Pi can delete or modify vector collections without MemoryGate credentials, and create/delete local models without ToolGate approval. Qdrant explicitly documents this unauthenticated default. Ollama’s container listens on all interfaces, and its API supports creating models with embedded system prompts. [Qdrant security](https://qdrant.tech/documentation/security/), [Ollama container](https://github.com/ollama/ollama/blob/v0.32.3/Dockerfile), [model creation](https://docs.ollama.com/api/create).

   **Reach:** process/socket compromise, not a demonstrated consequence of ordinary model output. The owner can lose reliable retrieval or local-model availability, with changes surviving restart. This does **not** establish access to ToolGate’s vault or PostgreSQL’s canonical memories.

   A valuable containment boundary remains: MemoryGate reloads vector hits from PostgreSQL and checks agent ownership and active status before returning text at [runtime.py:118](/C:/Users/The1a/dev/gates/memorygate/services/api/app/routes/runtime.py:118). Forged vector payloads alone cannot become arbitrary memory text through that path.

3. **A permitted search operation can export private context without violating SSRF checks. — Component behavior demonstrated**

   Sequence: private text is available to the model → it places that text in a permitted search query → ToolGate forwards it verbatim to SearXNG at [research.py:353](/C:/Users/The1a/dev/gates/toolgate/toolgate/executors/research.py:353), for external search.

   I passed a synthetic private marker through the actual search function with an HTTP recorder; the outgoing query contained it unchanged. No traffic was sent.

   **Reach:** requires a usable search capability and whatever approval its policy requires. This demonstrates disclosure to search infrastructure, not arbitrary delivery to an attacker-controlled inbox. The owner loses confidentiality once the query leaves. Public-address validation cannot enforce the separation between private reasoning and public research.

4. **Model-generated summaries are promoted into system messages. — Demonstrated**

   External content enters a conversation → the model summarizes it → Pi persists that summary into a child session at [loop.py:178](/C:/Users/The1a/dev/gates/pi/pi/loop.py:178) → subsequent turns receive it as a system message at [loop.py:139](/C:/Users/The1a/dev/gates/pi/pi/loop.py:139).

   I demonstrated the system-role insertion using a synthetic summary. Recalled memory is also inserted as a system message, although that path includes an explicit “untrusted evidence” warning.

   **Reach:** this gives unverified model output a higher-trust presentation and persistence across turns. It can corrupt the account of the owner’s wishes; it does not itself create an execution key or satisfy ToolGate approval. I did not demonstrate a particular model obeying an injected instruction.

The boundaries that held:

| Boundary | Evidence |
|---|---|
| Direct approval integrity | In-memory checks rejected forged verification requests, changed arguments, another agent’s use, replay, repeated decisions and stale request replacement. Enforced by [issuance fingerprints and serialized transitions](/C:/Users/The1a/dev/gates/toolgate/toolgate/core/control_plane.py:500). |
| Revocation survives bootstrap | Demonstrated: bootstrapping a narrowed, revoked key with wildcard configuration preserved its narrowed scopes and revoked status. [control_plane.py:225](/C:/Users/The1a/dev/gates/toolgate/toolgate/core/control_plane.py:225). |
| Execution keys cannot administer ToolGate | Source inspection: tool registration, scope changes, approval decisions and spending-policy changes require the separate admin credential. [server.py:1422](/C:/Users/The1a/dev/gates/toolgate/toolgate/api/server.py:1422). |
| Child spending cannot escape its job | Demonstrated: excessive child reservations and switching jobs were rejected; job ceilings were immutable; missing usage retained the reservation. [spending.py:138](/C:/Users/The1a/dev/gates/toolgate/toolgate/core/spending.py:138). |
| Public HTTPS destination checks | Controlled DNS tests rejected tailnet addresses, mapped addresses, mixed public/private answers and rebinding before socket connection. [public_https.py:42](/C:/Users/The1a/dev/gates/toolgate/toolgate/core/public_https.py:42). |
| Service credentials remain separate in Compose | Pi receives its own admin key, its ToolGate execution key and optional OpenRouter key—not ToolGate admin/owner credentials or MemoryGate, SystemGate or Embeddings admin credentials. Those HTTP services authenticate callers rather than trusting network membership. |

Your explicit money question: **ToolGate’s caps do not cover direct OpenRouter inference.** [openrouter.py:145](/C:/Users/The1a/dev/gates/pi/pi/openrouter.py:145) posts directly using Pi’s bearer credential, without a ToolGate reservation. A compromised process can bypass Pi’s free-model guard and consume whatever funded balance or provider-side limit that key permits. I did not inspect that account’s limits. No additional payment credential is passed to Pi by Compose. This is the remaining **B9** exposure, not a newly numbered finding.

Three qualifications matter when interpreting those results:

- Provenance is still absent from ToolGate’s verification payload in this checkout. Pi’s locally stored originating text is not an independently verified ToolGate provenance chain. That remains **B8**.
- Gateway credentials are separated, but its `/v2/owner/...` targets are absent from the inspected ToolGate server. I cannot certify a working owner-control channel; that is the existing **B4** integration gap.
- Pi’s current client omits `action_id`, while ToolGate requires it before non-echo dispatch: [toolgate.py:122](/C:/Users/The1a/dev/gates/pi/pi/toolgate.py:122), [server.py:952](/C:/Users/The1a/dev/gates/toolgate/toolgate/api/server.py:952). Consequently, the normal Pi tool path currently blocks those executions. This limits present exploit reach; it is not a security control to rely on.

Dependency checks found one maintenance concern without a demonstrated exploit: MemoryGate pins **cryptography 46.0.1**, below fixes for the bundled-OpenSSL advisory and PKCS#7 decryption oracle. Its inspected encryption code uses Fernet; I found no PKCS#7 decryption caller, so I am **not** claiming vault compromise. [OpenSSL advisory](https://github.com/pyca/cryptography/security/advisories/GHSA-537c-gmf6-5ccf), [PKCS#7 advisory](https://github.com/pyca/cryptography/security/advisories/GHSA-g6cj-pr64-35w5).

Conversely, MemoryGate’s **h11 0.16.0** and **Starlette 1.3.1**, and the declared **Qdrant 1.18.2**, are beyond the fixes for the checked request-smuggling, Host-validation and `/logger` file-write advisories. [h11](https://github.com/python-hyper/h11/security/advisories/GHSA-vqfr-h8mv-ghfj), [Starlette](https://github.com/advisories/GHSA-86qp-5c8j-p5mr), [Qdrant](https://github.com/qdrant/qdrant/security/advisories/GHSA-f632-vm87-2m2f). This was a targeted advisory check, not a complete scan of deployed transitive dependencies.